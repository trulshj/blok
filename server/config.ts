import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

export const CONFIG_FILE = "blok.config.json";

const ConfigFile = z.object({
  notesDir: z.string().min(1).default("../blok-notes"),
  trulsDevDir: z.string().min(1).default("../truls.dev"),
  port: z.number().int().min(1024).max(65534).default(4747),
});
export type ConfigFile = z.infer<typeof ConfigFile>;

export const DEFAULTS: ConfigFile = ConfigFile.parse({});

export type Config = {
  /** The blok checkout. */
  root: string;
  /** Absolute path of the config file, whether or not it exists yet. */
  file: string;
  source: "file" | "defaults";
  /** Set when the file exists but can't be used. Values then fall back to the defaults. */
  error?: string;
  /** Values as written, with relative paths kept. */
  raw: ConfigFile;
  notesDir: string;
  trulsDevDir: string;
  port: number;
};

/**
 * Reads blok.config.json from the blok checkout (or the file named by BLOK_CONFIG).
 * Relative paths resolve from the config file's folder, so "../blok-notes" works on every machine.
 */
export function loadConfig(root: string): Config {
  const file = process.env.BLOK_CONFIG ? resolve(root, process.env.BLOK_CONFIG) : join(root, CONFIG_FILE);
  if (!existsSync(file)) return build(root, file, "defaults", DEFAULTS);

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return build(root, file, "file", DEFAULTS, `Not valid JSON: ${(err as Error).message}`);
  }

  const parsed = ConfigFile.safeParse(json);
  if (!parsed.success) return build(root, file, "file", DEFAULTS, z.prettifyError(parsed.error));
  return build(root, file, "file", parsed.data);
}

/** Merges `patch` into the config file, creating it if needed. */
export function writeConfig(config: Config, patch: Partial<ConfigFile>): void {
  const next = { ...config.raw, ...patch };
  writeFileSync(config.file, `${JSON.stringify(next, null, 2)}\n`);
}

function build(root: string, file: string, source: Config["source"], raw: ConfigFile, error?: string): Config {
  const base = dirname(file);
  return {
    root,
    file,
    source,
    error,
    raw,
    notesDir: resolve(base, raw.notesDir),
    trulsDevDir: resolve(base, raw.trulsDevDir),
    port: raw.port,
  };
}
