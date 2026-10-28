import { hostname } from "node:os";
import type { SyncResult, SyncStatus } from "../shared/types.ts";
import {
  branchName,
  commitCount,
  counts,
  explainGitError,
  git,
  gitMaybe,
  isRepo,
  operationInProgress,
  rebaseOnto,
  refExists,
  remoteName,
} from "./git.ts";

/** A sync that couldn't finish, with a message meant for the person using blok. */
export class SyncError extends Error {}

const FETCH_EVERY_MS = 60_000;

// never committed: blok's in-flight temp files and OS clutter
const IGNORED = /(^|\/)(\.DS_Store|Thumbs\.db)$|\.tmp$/;
const EXCLUDE = [":(exclude,glob)**/*.tmp", ":(exclude,glob)**/.DS_Store", ":(exclude,glob)**/Thumbs.db"];

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

  /** Changed files, from git status, minus temp files and OS clutter. */
  async function changedFiles(): Promise<string[]> {
    const tokens = (await run(["status", "--porcelain=v1", "-z", "--untracked-files=all"])).split("\0");
    const changed: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const entry = tokens[i];
      if (!entry) continue;
      const code = entry.slice(0, 2);
      if (code[0] === "R" || code[0] === "C") i++; // renames carry the old path as the next token
      const path = entry.slice(3);
      if (!IGNORED.test(path)) changed.push(path);
    }
    return changed;
  }

  async function fetchIfDue(force: boolean) {
    if (!force && fetchedAt && now().getTime() - fetchedAt.getTime() < FETCH_EVERY_MS) return;
    const remote = await remoteName(dir);
    if (!remote) return;
    try {
      await run(["fetch", "--quiet", remote]);
      fetchedAt = now();
    } catch (err) {
      throw new SyncError(explainGitError(err));
    }
  }

  async function status({ fetch = false } = {}): Promise<SyncStatus> {
    const base = {
      fetchedAt: fetchedAt?.toISOString() ?? null,
      syncedAt: syncedAt?.toISOString() ?? null,
      error: lastError,
    };
    if (!isRepo(dir)) {
      return { ...base, state: "not-repo", branch: null, upstream: null, changed: 0, ahead: 0, behind: 0 };
    }

    if (fetch && !busy) await fetchIfDue(false).catch(() => {}); // offline is fine; counts are as of the last fetch

    const remote = await remoteName(dir);
    const branch = await branchName(dir);
    const changed = await changedFiles();
    const tracking = await gitMaybe(dir, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    // no upstream yet (a fresh repo): compare with the remote's branch of the same name, if it has one
    const candidate = remote && branch ? `${remote}/${branch}` : null;
    const upstream = tracking || (candidate && (await refExists(dir, candidate)) ? candidate : null);
    const [ahead, behind] = upstream ? await counts(dir, upstream) : [await commitCount(dir, "HEAD"), 0];

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
    if (!isRepo(dir)) throw new SyncError("The notes folder isn't a git repository. Run git init in it, or set it up again.");
    if (busy) throw new SyncError("A sync is already running.");
    busy = true;

    try {
      if (operationInProgress(dir)) {
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
          throw new SyncError(explainGitError(err));
        }
      }

      const remote = await remoteName(dir);
      const branch = await branchName(dir);
      if (!remote || !branch) return done(staged.length, 0, 0);

      // 2. fetch, then rebase onto the remote branch if it has anything new
      await fetchIfDue(true);
      const remoteBranch = `${remote}/${branch}`;
      const remoteHasBranch = await refExists(dir, remoteBranch);
      let pulled = 0;
      if (remoteHasBranch) {
        const [, behind] = await counts(dir, remoteBranch);
        if (behind > 0) {
          if (!(await refExists(dir, "HEAD"))) {
            await run(["reset", "-q", "--hard", remoteBranch]); // nothing here yet: take the remote as it is
          } else {
            await mustShareHistory(remoteBranch);
            const conflicted = await rebaseOnto(dir, remoteBranch);
            if (conflicted) throw new SyncError(conflictMessage(conflicted, remoteBranch, dir));
          }
          pulled = behind;
        }
      }

      // 3. push
      const [ahead] = remoteHasBranch ? await counts(dir, remoteBranch) : [await commitCount(dir, "HEAD")];
      if (ahead > 0) {
        try {
          await run(["push", "--quiet", "-u", remote, branch]);
        } catch (err) {
          throw new SyncError(explainGitError(err));
        }
      }
      return done(staged.length, pulled, ahead);
    } catch (err) {
      lastError = err instanceof SyncError ? err.message : explainGitError(err);
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
