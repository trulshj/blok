import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** A git command that failed; `message` holds git's own error output. */
export class GitError extends Error {}

/**
 * Runs git in `cwd` and resolves with its trimmed output. blok only runs fixed commands, so a plain
 * child process is enough. Git is never allowed to wait for a password prompt: it fails instead.
 */
export function git(cwd: string, args: string[], { timeoutMs = 60_000 } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes",
          LC_ALL: "C", // English messages, so errors can be recognised
        },
      },
      (err, stdout, stderr) => {
        if (err) reject(new GitError((stderr || stdout || err.message).trim()));
        else resolve(stdout.trimEnd());
      },
    );
  });
}

/** Like git(), but resolves with null instead of failing (for "does this exist?" checks). */
export async function gitMaybe(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
}

// ---------- small questions about a repo ----------

export const isRepo = (dir: string) => existsSync(join(dir, ".git"));

export const refExists = async (dir: string, ref: string) =>
  (await gitMaybe(dir, ["rev-parse", "--verify", "--quiet", ref])) !== null;

/** The current branch, or null when detached. Works before the first commit. */
export const branchName = async (dir: string) => (await gitMaybe(dir, ["symbolic-ref", "--short", "HEAD"])) || null;

/** "origin" if there is one, else the first remote, else null. */
export async function remoteName(dir: string): Promise<string | null> {
  const remotes = (await git(dir, ["remote"])).split("\n").filter(Boolean);
  return remotes.includes("origin") ? "origin" : (remotes[0] ?? null);
}

/** Commits reachable from `ref`, or 0 if it doesn't exist (e.g. HEAD before the first commit). */
export const commitCount = async (dir: string, ref: string) => Number(await gitMaybe(dir, ["rev-list", "--count", ref])) || 0;

/** [ahead, behind] of HEAD compared with `ref`. */
export async function counts(dir: string, ref: string): Promise<[number, number]> {
  if (!(await refExists(dir, "HEAD"))) return [0, await commitCount(dir, ref)];
  const [ahead = "0", behind = "0"] = (await git(dir, ["rev-list", "--left-right", "--count", `HEAD...${ref}`])).split(/\s+/);
  return [Number(ahead), Number(behind)];
}

/** A rebase or merge left half-done (by a crash, or by hand). */
export const operationInProgress = (dir: string) =>
  ["rebase-merge", "rebase-apply", "MERGE_HEAD"].some((name) => existsSync(join(dir, ".git", name)));

/**
 * Rebases HEAD onto `ref`. If it conflicts, the rebase is aborted (so no conflict markers are left
 * behind) and the conflicting paths are returned; null means it went through.
 */
export async function rebaseOnto(dir: string, ref: string, { autostash = false } = {}): Promise<string[] | null> {
  try {
    await git(dir, ["rebase", "--quiet", ...(autostash ? ["--autostash"] : []), ref]);
    return null;
  } catch {
    const conflicted = ((await gitMaybe(dir, ["diff", "--name-only", "--diff-filter=U"])) ?? "").split("\n").filter(Boolean);
    await gitMaybe(dir, ["rebase", "--abort"]);
    return conflicted;
  }
}

/** Turns git's error output into something actionable. */
export function explainGitError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/tell me who you are|user\.email|user\.name/i.test(text)) {
    return 'Git doesn\'t know your name and email on this machine yet. In a terminal: git config --global user.name "Your Name", then git config --global user.email you@example.com.';
  }
  if (/could not resolve host|unable to access|network is unreachable|timed out|failed to connect|does not appear to be a git repository|could not read from remote/i.test(text)) {
    return "Can't reach the remote (offline?). The change is committed here and will go up with the next push.";
  }
  if (/authentication failed|could not read username|terminal prompts disabled|permission denied|403/i.test(text)) {
    return "Git couldn't log in to the remote. Push once from a terminal so your credentials are saved, then try again.";
  }
  if (/rejected|non-fast-forward|fetch first/i.test(text)) {
    return "The remote changed in the meantime. Try again.";
  }
  const first = text.split("\n").find((line) => line.trim()) ?? text;
  return `Git said: ${first.trim()}`;
}
