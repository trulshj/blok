import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { CreateNoteRequest, Note, NoteMeta, NoteSummary, UpdateNoteRequest } from "../../shared/types.ts";
import { normalizeTags } from "../../shared/tags.ts";
import { DEFAULTS, parseNoteFile, serializeNote, type ParsedNote } from "./frontmatter.ts";
import { preview } from "./preview.ts";
import { isValidSlug, slugify, stamp, uniqueSlug } from "../../shared/slug.ts";

export const NOTE_FILE = "index.md";
export const TRASH_DIR = ".trash";

export type NoteErrorCode = "invalid-slug" | "invalid-file" | "not-found" | "exists" | "conflict" | "unreadable";

export class NoteError extends Error {
  code: NoteErrorCode;
  constructor(code: NoteErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type NoteStore = ReturnType<typeof createNoteStore>;

/**
 * Notes live in <notesDir>/notes/<slug>/index.md, with images next to them.
 * Deleting moves the folder to notes/.trash/. Writes run one at a time.
 */
export function createNoteStore(notesDir: string, { now = () => new Date() } = {}) {
  const dir = resolve(notesDir, "notes");
  const trashDir = join(dir, TRASH_DIR);

  // one write at a time, so autosaves, renames and deletes can't interleave
  let queue: Promise<unknown> = Promise.resolve();
  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  /** The folder for `slug`, refusing anything that isn't a plain slug directly inside notes/. */
  function folder(slug: string): string {
    const path = resolve(dir, slug);
    if (!isValidSlug(slug) || dirname(path) !== dir) {
      throw new NoteError("invalid-slug", `"${slug}" isn't a valid note name`);
    }
    return path;
  }

  const taken = (slug: string) => existsSync(join(dir, slug));

  async function load(slug: string): Promise<ParsedNote> {
    const file = join(folder(slug), NOTE_FILE);
    let text: string;
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      [text, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new NoteError("not-found", `No note called "${slug}"`);
      throw err;
    }
    return parseNoteFile(text, { title: slug, created: info.birthtime, updated: info.mtime });
  }

  const toNote = (slug: string, parsed: ParsedNote): Note => ({
    slug,
    meta: parsed.meta,
    body: parsed.body,
    problems: parsed.problems,
    preview: preview(parsed.body),
  });

  /** Folders in notes/ that are valid slugs. They may still lack an index.md. */
  async function slugs(): Promise<string[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory() && isValidSlug(e.name)).map((e) => e.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async function save(slug: string, meta: NoteMeta, extra: Record<string, unknown>, body: string): Promise<Note> {
    const path = folder(slug);
    await mkdir(path, { recursive: true });
    await writeAtomic(join(path, NOTE_FILE), serializeNote(meta, extra, body));
    return toNote(slug, { meta, body, extra, problems: [], readable: true });
  }

  return {
    dir,
    slugs,

    async list(): Promise<NoteSummary[]> {
      const notes = await Promise.all(
        (await slugs()).map(async (slug) => {
          try {
            const { body, ...summary } = toNote(slug, await load(slug));
            return summary;
          } catch (err) {
            if (err instanceof NoteError && err.code === "not-found") return null; // a folder without index.md
            throw err;
          }
        }),
      );
      return notes.filter((n) => n !== null).sort((a, b) => b.meta.updated.localeCompare(a.meta.updated));
    },

    async get(slug: string): Promise<Note> {
      return toNote(slug, await load(slug));
    },

    create(input: CreateNoteRequest): Promise<Note> {
      return exclusive(async () => {
        const at = now();
        const slug = uniqueSlug(slugify(input.title, at), taken);
        const meta: NoteMeta = {
          title: input.title.trim(),
          type: input.type ?? DEFAULTS.type,
          lang: input.lang ?? DEFAULTS.lang,
          status: input.status ?? DEFAULTS.status,
          tags: normalizeTags(input.tags ?? []),
          created: at.toISOString(),
          updated: at.toISOString(),
        };
        if (input.titleJa?.trim()) meta.titleJa = input.titleJa.trim();
        if (input.excerpt?.trim()) meta.excerpt = input.excerpt.trim();
        if (input.image) meta.image = input.image;
        return save(slug, meta, {}, input.body ?? "");
      });
    },

    update(slug: string, input: UpdateNoteRequest): Promise<Note> {
      return exclusive(async () => {
        const current = await load(slug);
        if (!current.readable) {
          throw new NoteError(
            "unreadable",
            `The frontmatter in notes/${slug}/${NOTE_FILE} can't be read, so saving would lose it. Fix it by hand first.`,
          );
        }
        if (input.baseUpdated && input.baseUpdated !== current.meta.updated) {
          throw new NoteError("conflict", `"${slug}" was changed somewhere else after you opened it`);
        }

        const meta: NoteMeta = {
          title: input.meta.title.trim(),
          type: input.meta.type,
          lang: input.meta.lang,
          status: input.meta.status,
          tags: normalizeTags(input.meta.tags),
          created: current.meta.created,
          updated: now().toISOString(),
        };
        if (input.meta.titleJa?.trim()) meta.titleJa = input.meta.titleJa.trim();
        if (input.meta.excerpt?.trim()) meta.excerpt = input.meta.excerpt.trim();
        if (input.meta.image) meta.image = input.meta.image;
        return save(slug, meta, current.extra, input.body);
      });
    },

    /** Moves the note to a new slug: the one given, or one derived from its title. */
    rename(slug: string, to?: string): Promise<Note> {
      return exclusive(async () => {
        const current = await load(slug);
        let target: string;
        if (to !== undefined) {
          folder(to); // validates
          if (to !== slug && taken(to)) throw new NoteError("exists", `There's already a note called "${to}"`);
          target = to;
        } else {
          target = uniqueSlug(slugify(current.meta.title, new Date(current.meta.created)), (s) => s !== slug && taken(s));
        }
        if (target !== slug) await renameWithRetry(folder(slug), folder(target));
        return toNote(target, current);
      });
    },

    /** Saves `data` in the note's folder as `<base>.<ext>`, or `<base>-2.<ext>`… if taken. Returns the file name. */
    addFile(slug: string, base: string, ext: string, data: Uint8Array): Promise<string> {
      return exclusive(async () => {
        const path = folder(slug);
        if (!existsSync(join(path, NOTE_FILE))) throw new NoteError("not-found", `No note called "${slug}"`);
        const name = `${uniqueSlug(base, (s) => existsSync(join(path, `${s}.${ext}`)))}.${ext}`;
        await writeAtomic(join(path, name), data);
        return name;
      });
    },

    /** Path of `file` in the note's folder. Only plain names matching `pattern`, nothing outside the folder. */
    filePath(slug: string, file: string, pattern: RegExp): string {
      const path = resolve(folder(slug), file);
      if (!pattern.test(file) || dirname(path) !== folder(slug)) {
        throw new NoteError("invalid-file", `"${file}" isn't a file blok can show`);
      }
      return path;
    },

    /** Files in the note's folder matching `pattern`, by name. */
    async listFiles(slug: string, pattern: RegExp): Promise<{ file: string; bytes: number }[]> {
      const path = folder(slug);
      let entries;
      try {
        entries = await readdir(path, { withFileTypes: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new NoteError("not-found", `No note called "${slug}"`);
        throw err;
      }
      const files = entries.filter((e) => e.isFile() && pattern.test(e.name)).map((e) => e.name).sort();
      return Promise.all(files.map(async (file) => ({ file, bytes: (await stat(join(path, file))).size })));
    },

    /** Moves the note folder to notes/.trash/. Never deletes anything. */
    trash(slug: string): Promise<{ trashedAs: string }> {
      return exclusive(async () => {
        const source = folder(slug);
        if (!existsSync(join(source, NOTE_FILE))) throw new NoteError("not-found", `No note called "${slug}"`);
        await mkdir(trashDir, { recursive: true });
        const name = existsSync(join(trashDir, slug)) ? `${slug}-${stamp(now(), "seconds")}` : slug;
        await renameWithRetry(source, join(trashDir, name));
        return { trashedAs: `${TRASH_DIR}/${name}` };
      });
    },
  };
}

/** Write to a temp file, then rename over the target, so a crash never leaves half a file. */
async function writeAtomic(file: string, content: string | Uint8Array): Promise<void> {
  const temp = `${file}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temp, content);
  try {
    await renameWithRetry(temp, file);
  } catch (err) {
    await unlink(temp).catch(() => {});
    throw err;
  }
}

// Windows (antivirus, OneDrive, editors) can hold files for a moment, failing renames with EPERM/EBUSY
async function renameWithRetry(from: string, to: string, attempts = 6): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      return await rename(from, to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (i >= attempts || !["EPERM", "EBUSY", "EACCES"].includes(code ?? "")) throw err;
      await sleep(25 * 2 ** i);
    }
  }
}
