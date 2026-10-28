import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Document, isSeq, parse } from "yaml";
import { z } from "zod";
import { stamp } from "../../shared/slug.ts";
import type { VocabEntry, VocabInput } from "../../shared/types.ts";
import { renameWithRetry, TRASH_DIR, writeAtomic } from "../notes/store.ts";

export const VOCAB_DIR = "vocab";
const ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/;

export class VocabError extends Error {
  code: "invalid-id" | "not-found";
  constructor(code: VocabError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

// YAML may hand over numbers (a word like 100) or null (an empty field); read them as text
const text = z.preprocess((v) => (v == null ? "" : String(v)), z.string());
const optionalText = z.preprocess((v) => (v == null || v === "" ? undefined : String(v)), z.string().optional());

const VocabFile = z.object({
  word: text.refine((w) => w.trim() !== "", "an entry needs a word"),
  reading: text,
  meaning: text,
  example: optionalText,
  translation: optionalText,
  context: optionalText,
  source: optionalText,
  added: text,
  used: z.preprocess((v) => (v == null ? [] : v), z.array(z.coerce.string())),
});

const OPTIONAL = ["example", "translation", "context", "source"] as const;

/** The entry as YAML, without empty optional fields; the id is the file name, so it isn't repeated. */
export function serializeVocab({ id: _id, ...entry }: VocabEntry): string {
  const fields: Record<string, unknown> = {
    word: entry.word,
    reading: entry.reading,
    meaning: entry.meaning,
    ...Object.fromEntries(OPTIONAL.flatMap((key) => (entry[key]?.trim() ? [[key, entry[key]!.trim()]] : []))),
    added: entry.added,
    used: entry.used,
  };
  const doc = new Document(fields);
  const used = doc.get("used", true);
  if (isSeq(used)) used.flow = true;
  return doc.toString({ lineWidth: 0 });
}

function clean(input: VocabInput): Omit<VocabEntry, "id" | "added" | "used"> {
  const entry: Omit<VocabEntry, "id" | "added" | "used"> = {
    word: input.word.trim(),
    reading: input.reading.trim(),
    meaning: input.meaning.trim(),
  };
  for (const key of OPTIONAL) if (input[key]?.trim()) entry[key] = input[key]!.trim();
  return entry;
}

/**
 * The vocab inbox: one small YAML file per word in <notes folder>/vocab, so two machines adding
 * words never touch the same file in git. Removing moves the file to vocab/.trash.
 */
export function createVocabStore(notesDir: string, { now = () => new Date() } = {}) {
  const dir = join(notesDir, VOCAB_DIR);
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };

  const fileOf = (id: string) => {
    if (!ID.test(id)) throw new VocabError("invalid-id", `"${id}" isn't a vocab entry`);
    return join(dir, `${id}.yaml`);
  };

  /** An entry, or null if its file is missing or can't be read. */
  async function read(id: string): Promise<VocabEntry | null> {
    const file = fileOf(id);
    try {
      const data = VocabFile.safeParse(parse(await readFile(file, "utf8")));
      return data.success ? { id, ...data.data } : null;
    } catch {
      return null;
    }
  }

  async function write(entry: VocabEntry): Promise<VocabEntry> {
    await mkdir(dir, { recursive: true });
    await writeAtomic(fileOf(entry.id), serializeVocab(entry));
    return entry;
  }

  async function existing(id: string): Promise<VocabEntry> {
    const entry = await read(id);
    if (!entry) throw new VocabError("not-found", "That word isn't in the vocab inbox anymore");
    return entry;
  }

  return {
    dir,

    /** Every entry, newest first. Files that can't be read are skipped. */
    async list(): Promise<VocabEntry[]> {
      if (!existsSync(dir)) return [];
      const ids = (await readdir(dir)).flatMap((name) => (name.endsWith(".yaml") && ID.test(name.slice(0, -5)) ? [name.slice(0, -5)] : []));
      const entries = (await Promise.all(ids.map(read))).filter((e): e is VocabEntry => e !== null);
      return entries.sort((a, b) => b.added.localeCompare(a.added) || b.id.localeCompare(a.id));
    },

    get: existing,

    create(input: VocabInput): Promise<VocabEntry> {
      return exclusive(async () => {
        const when = now();
        const id = `${stamp(when, "seconds")}-${randomBytes(2).toString("hex")}`;
        return write({ ...clean(input), id, added: when.toISOString(), used: input.used ?? [] });
      });
    },

    update(id: string, input: VocabInput): Promise<VocabEntry> {
      return exclusive(async () => {
        const current = await existing(id);
        return write({ ...clean(input), id, added: current.added, used: input.used ?? current.used });
      });
    },

    /** Notes that `slug` uses the word, e.g. after adding it to the note as a card. */
    markUsed(id: string, slug: string): Promise<VocabEntry> {
      return exclusive(async () => {
        const current = await existing(id);
        return current.used.includes(slug) ? current : write({ ...current, used: [...current.used, slug] });
      });
    },

    remove(id: string): Promise<{ trashedAs: string }> {
      return exclusive(async () => {
        const source = fileOf(id);
        if (!existsSync(source)) throw new VocabError("not-found", "That word isn't in the vocab inbox anymore");
        const trash = join(dir, TRASH_DIR);
        await mkdir(trash, { recursive: true });
        let name = `${id}.yaml`;
        for (let n = 2; existsSync(join(trash, name)); n++) name = `${id}-${n}.yaml`;
        await renameWithRetry(source, join(trash, name));
        return { trashedAs: `${VOCAB_DIR}/${TRASH_DIR}/${name}` };
      });
    },
  };
}

export type VocabStore = ReturnType<typeof createVocabStore>;
