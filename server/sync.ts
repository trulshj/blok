import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import type { SyncResult, SyncStatus } from "../shared/types.ts";
import { git, gitMaybe } from "./git.ts";

/** A sync that couldn't finish, with a message meant for the person using blok. */
export class SyncError extends Error {}

const FETCH_EVERY_MS = 60_000;

// never committed: blok's in-flight temp files and OS clutter
const IGNORED = /(^|\/)(\.DS_Store|Thumbs\.db)$|\.tmp$/;
const EXCLUDE = [":(exclude,glob)**/*.tmp", ":(exclude,glob)**/.DS_Store", ":(exclude,glob)**/Thumbs.db"];
const CONFLICT_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

/**
 * Git sync for the notes folder: status, and a sync that commits everything, fetches, rebases onto
 * the remote and pushes. If the rebase conflicts it's aborted, so the folder never holds conflict
 * markers, and the error says which notes clash and how to finish in a terminal.
 */
export function createSync(dir: string, { now = () => new Date() } = {}) {
  let busy = false;
  let fetchedAt: Date | null = null;
  let syncedAt: Date | null = null;
  let lastError: string | null = null;

  const run = (args: string[]) => git(dir, args);
  const isRepo = () => existsSync(join(dir, ".git"));

  /** A rebase or merge left half-done (by a crash, or by hand). */
  const operationInProgress = () =>
    ["rebase-merge", "rebase-apply", "MERGE_HEAD"].some((name) => existsSync(join(dir, ".git", name)));

  async function remoteName(): Promise<string | null> {
    const remotes = (await run(["remote"])).split("\n").filter(Boolean);
    return remotes.includes("origin") ? "origin" : (remotes[0] ?? null);
  }

  const branchName = async () => (await gitMaybe(dir, ["symbolic-ref", "--short", "HEAD"])) || null;
  const refExists = async (ref: string) => (await gitMaybe(dir, ["rev-parse", "--verify", "--quiet", ref])) !== null;

  /** Commits reachable from `ref`, or 0 if it doesn't exist (e.g. HEAD before the first commit). */
  const commitCount = async (ref: string) => Number(await gitMaybe(dir, ["rev-list", "--count", ref])) || 0;

  /** [ahead, behind] of HEAD compared with `ref`. */
  async function counts(ref: string): Promise<[number, number]> {
    if (!(await refExists("HEAD"))) return [0, await commitCount(ref)];
    const [ahead = "0", behind = "0"] = (await run(["rev-list", "--left-right", "--count", `HEAD...${ref}`])).split(/\s+/);
    return [Number(ahead), Number(behind)];
  }

  /** Changed files (paths) and conflicted ones, from git status. */
  async function changes(): Promise<{ changed: string[]; conflicted: string[] }> {
    const tokens = (await run(["status", "--porcelain=v1", "-z", "--untracked-files=all"])).split("\0");
    const changed: string[] = [];
    const conflicted: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const entry = tokens[i];
      if (!entry) continue;
      const code = entry.slice(0, 2);
      const path = entry.slice(3);
      if (code[0] === "R" || code[0] === "C") i++; // renames carry the old path as the next token
      if (IGNORED.test(path)) continue;
      changed.push(path);
      if (CONFLICT_CODES.has(code)) conflicted.push(path);
    }
    return { changed, conflicted };
  }

  async function fetchIfDue(force: boolean) {
    if (!force && fetchedAt && now().getTime() - fetchedAt.getTime() < FETCH_EVERY_MS) return;
    const remote = await remoteName();
    if (!remote) return;
    try {
      await run(["fetch", "--quiet", remote]);
      fetchedAt = now();
    } catch (err) {
      throw new SyncError(explain(err));
    }
  }

  async function status({ fetch = false } = {}): Promise<SyncStatus> {
    const base = {
      fetchedAt: fetchedAt?.toISOString() ?? null,
      syncedAt: syncedAt?.toISOString() ?? null,
      error: lastError,
    };
    if (!isRepo()) {
      return { ...base, state: "not-repo", branch: null, upstream: null, changed: 0, ahead: 0, behind: 0 };
    }

    if (fetch && !busy) await fetchIfDue(false).catch(() => {}); // offline is fine; counts are as of the last fetch

    const remote = await remoteName();
    const branch = await branchName();
    const { changed } = await changes();
    const tracking = await gitMaybe(dir, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    // no upstream yet (a fresh repo): compare with the remote's branch of the same name, if it has one
    const candidate = remote && branch ? `${remote}/${branch}` : null;
    const upstream = tracking || (candidate && (await refExists(candidate)) ? candidate : null);
    const [ahead, behind] = upstream ? await counts(upstream) : [await commitCount("HEAD"), 0];

    const local = changed.length > 0 || ahead > 0;
    const state: SyncStatus["state"] = busy
      ? "busy"
      : !remote
        ? "no-remote"
        : local && behind > 0
          ? "diverged"
          : local
            ? "changes"
            : behind > 0
              ? "behind"
              : "clean";

    return { ...base, state, branch, upstream, changed: changed.length, ahead, behind };
  }

  async function sync(): Promise<SyncResult> {
    if (!isRepo()) throw new SyncError("The notes folder isn't a git repository. Run git init in it, or set it up again.");
    if (busy) throw new SyncError("A sync is already running.");
    busy = true;

    try {
      if (operationInProgress()) {
        throw new SyncError(
          `A rebase or merge is unfinished in ${dir}. Finish it in a terminal (git status shows what's left), then sync again.`,
        );
      }

      // 1. commit everything
      await run(["add", "-A", "--", ".", ...EXCLUDE]);
      const staged = (await run(["diff", "--cached", "--name-only"])).split("\n").filter(Boolean);
      if (staged.length) {
        try {
          await run(["commit", "--quiet", "-m", commitMessage(staged)]);
        } catch (err) {
          await gitMaybe(dir, ["reset", "-q"]); // unstage, leave the files as they are
          throw new SyncError(explain(err));
        }
      }

      const remote = await remoteName();
      const branch = await branchName();
      if (!remote || !branch) return done(staged.length, 0, 0);

      // 2. fetch, then rebase onto the remote branch if it has anything new
      await fetchIfDue(true);
      const remoteBranch = `${remote}/${branch}`;
      const remoteHasBranch = await refExists(remoteBranch);
      let pulled = 0;
      if (remoteHasBranch) {
        const [, behind] = await counts(remoteBranch);
        if (behind > 0) {
          if (!(await refExists("HEAD"))) {
            await run(["reset", "-q", "--hard", remoteBranch]); // nothing here yet: take the remote as it is
          } else {
            await mustShareHistory(remoteBranch);
            try {
              await run(["rebase", "--quiet", remoteBranch]);
            } catch {
              const { conflicted } = await changes();
              await gitMaybe(dir, ["rebase", "--abort"]);
              throw new SyncError(conflictMessage(conflicted, remoteBranch, dir));
            }
          }
          pulled = behind;
        }
      }

      // 3. push
      const [ahead] = remoteHasBranch ? await counts(remoteBranch) : [await commitCount("HEAD")];
      if (ahead > 0) {
        try {
          await run(["push", "--quiet", "-u", remote, branch]);
        } catch (err) {
          throw new SyncError(explain(err));
        }
      }
      return done(staged.length, pulled, ahead);
    } catch (err) {
      lastError = err instanceof SyncError ? err.message : explain(err);
      throw err instanceof SyncError ? err : new SyncError(lastError);
    } finally {
      busy = false;
    }
  }

  async function done(committed: number, pulled: number, pushed: number): Promise<SyncResult> {
    syncedAt = now();
    lastError = null;
    busy = false;
    return { committed, pulled, pushed, status: await status() };
  }

  async function mustShareHistory(ref: string) {
    if ((await gitMaybe(dir, ["merge-base", "HEAD", ref])) === null) {
      throw new SyncError(
        `This notes folder and ${ref} have separate histories (was it made with git init instead of cloned?). ` +
          "Move this folder aside, clone the repository instead, and copy any new notes back in.",
      );
    }
  }

  return { status, sync };
}

export type Sync = ReturnType<typeof createSync>;

/** "blok: kyoto-alley, minecraft-vocab-1 and 2 more", plus which machine it came from. */
export function commitMessage(files: string[]): string {
  const notes = new Set<string>();
  const trashed = new Set<string>();
  let other = 0;
  for (const file of files) {
    const trash = /^notes\/\.trash\/([^/]+)\//.exec(file);
    const note = /^notes\/([^/.][^/]*)\//.exec(file);
    if (trash?.[1]) trashed.add(trash[1]);
    else if (note?.[1]) notes.add(note[1]);
    else other++;
  }

  const list = (names: string[]) =>
    names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
  const parts = [
    notes.size ? list([...notes].sort()) : "",
    trashed.size ? `trash ${list([...trashed].sort())}` : "",
    !notes.size && !trashed.size && other ? `${other} ${other === 1 ? "file" : "files"}` : "",
  ].filter(Boolean);

  return `blok: ${parts.join("; ")}\n\nSynced from ${hostname()}`;
}

function conflictMessage(files: string[], ref: string, dir: string): string {
  const notes = [...new Set(files.map((f) => /^notes\/([^/]+)\//.exec(f)?.[1] ?? f))];
  const which = notes.length ? notes.join(", ") : "Some files";
  return (
    `${which} changed both here and in ${ref}, in ways git can't combine. Nothing was lost: your changes are ` +
    `committed here, and the sync was undone. To combine them, open a terminal in ${dir} and run ` +
    `git pull --rebase, fix the marked parts, then git add the files and git rebase --continue.`
  );
}

/** Turns git's error output into something actionable. */
function explain(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/tell me who you are|user\.email|user\.name/i.test(text)) {
    return 'Git doesn\'t know your name and email on this machine yet. In a terminal: git config --global user.name "Your Name", then git config --global user.email you@example.com.';
  }
  if (/could not resolve host|unable to access|network is unreachable|timed out|failed to connect|does not appear to be a git repository|could not read from remote/i.test(text)) {
    return "Can't reach the remote (offline?). Your notes are committed here and will go up with the next sync.";
  }
  if (/authentication failed|could not read username|terminal prompts disabled|permission denied|403/i.test(text)) {
    return "Git couldn't log in to the remote. Push once from a terminal so your credentials are saved, then sync again.";
  }
  if (/rejected|non-fast-forward|fetch first/i.test(text)) {
    return "The remote changed while syncing. Sync again.";
  }
  const first = text.split("\n").find((line) => line.trim()) ?? text;
  return `Git said: ${first.trim()}`;
}
