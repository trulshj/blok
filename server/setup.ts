import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { z } from "zod";
import type { SetupStatus } from "../shared/types.ts";
import { loadConfig, writeConfig, type Config } from "./config.ts";

export const SetupInput = z.object({
  notesDir: z.string().trim().min(1, "Pick a folder for your notes"),
  gitInit: z.boolean().default(true),
});

export class SetupError extends Error {}

const NOTES_GITATTRIBUTES = `# Same line endings on Windows and Mac
* text=auto eol=lf

*.png binary
*.jpg binary
*.jpeg binary
*.avif binary
*.webp binary
`;

const isDir = (path: string) => existsSync(path) && statSync(path).isDirectory();

export function setupStatus(config: Config): SetupStatus {
  const notesExists = isDir(config.notesDir);
  return {
    ready: !config.error && notesExists && isDir(join(config.notesDir, "notes")),
    config: { source: config.source, path: config.file, error: config.error ?? null },
    notes: {
      raw: config.raw.notesDir,
      path: config.notesDir,
      exists: notesExists,
      // only a repo at the folder itself counts, not one further up
      isGitRepo: notesExists && existsSync(join(config.notesDir, ".git")),
    },
    trulsDev: {
      raw: config.raw.trulsDevDir,
      path: config.trulsDevDir,
      exists: isDir(config.trulsDevDir),
    },
  };
}

/**
 * Saves the notes folder to the config, then creates the folder with notes/ and .gitattributes,
 * and optionally runs git init. Safe to run again on a folder that already exists.
 */
export async function createNotesFolder(config: Config, input: z.infer<typeof SetupInput>): Promise<Config> {
  if (config.error) {
    throw new SetupError(`Fix ${config.file} first. ${config.error}`);
  }

  writeConfig(config, { notesDir: input.notesDir });
  const next = loadConfig(config.root);

  await mkdir(join(next.notesDir, "notes"), { recursive: true });

  const attributes = join(next.notesDir, ".gitattributes");
  if (!existsSync(attributes)) await writeFile(attributes, NOTES_GITATTRIBUTES);

  if (input.gitInit && !existsSync(join(next.notesDir, ".git"))) {
    await simpleGit(next.notesDir).init(["--initial-branch=main"]);
  }

  return next;
}
