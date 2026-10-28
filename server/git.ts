import { execFile } from "node:child_process";

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
