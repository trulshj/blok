import { Document, isSeq, parse } from "yaml";
import { z } from "zod";
import { normalizeTags } from "../../shared/tags.ts";
import { NOTE_LANGS, NOTE_STATUSES, NOTE_TYPES, type NoteMeta } from "../../shared/types.ts";

/**
 * A note file is YAML frontmatter between --- fences, a blank line, then the markdown body.
 * Keys blok doesn't know are kept and written back after the known ones.
 */
export type ParsedNote = {
  meta: NoteMeta;
  body: string;
  /** Frontmatter keys blok doesn't use, in their original order. */
  extra: Record<string, unknown>;
  problems: string[];
  /** False when the frontmatter isn't valid YAML. Such a file must not be overwritten. */
  readable: boolean;
};

/** Used for fields that are missing or invalid. */
export type Fallbacks = { title: string; created: Date; updated: Date };

/** Defaults for new notes and for files that leave these out. */
export const DEFAULTS = { type: "note", lang: "en", status: "seedling" } as const satisfies Partial<NoteMeta>;

const KEY_ORDER = ["title", "titleJa", "type", "lang", "status", "tags", "excerpt", "image", "created", "updated"] as const;
const KNOWN = new Set<string>(KEY_ORDER);

const timestamp = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);

const FIELDS = {
  title: z.string().trim().min(1),
  titleJa: z.string().trim().min(1),
  type: z.enum(NOTE_TYPES),
  lang: z.enum(NOTE_LANGS),
  status: z.enum(NOTE_STATUSES),
  // also accept a single string or a comma-separated list
  tags: z
    .union([z.array(z.union([z.string(), z.number()])), z.string()])
    .transform((v) => normalizeTags(typeof v === "string" ? v.split(",") : v.map(String))),
  excerpt: z.string().trim().min(1),
  image: z.object({ src: z.string().min(1), alt: z.string() }),
  created: timestamp,
  updated: timestamp,
} satisfies Record<(typeof KEY_ORDER)[number], z.ZodType>;

export function parseNoteFile(text: string, fallbacks: Fallbacks): ParsedNote {
  const { frontmatter, body } = split(text.replace(/^﻿/, "").replace(/\r\n?/g, "\n"));
  const problems: string[] = [];

  let data: Record<string, unknown> = {};
  let readable = true;
  if (frontmatter !== null) {
    try {
      const parsed: unknown = parse(frontmatter);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      } else if (parsed !== null) {
        throw new Error("expected key: value pairs");
      }
    } catch (err) {
      readable = false;
      problems.push(`Frontmatter isn't valid YAML: ${(err as Error).message.split("\n")[0]}`);
    }
  }

  const value = <K extends keyof typeof FIELDS>(key: K): z.output<(typeof FIELDS)[K]> | undefined => {
    if (data[key] === undefined || data[key] === null || data[key] === "") return undefined;
    const result = FIELDS[key].safeParse(data[key]);
    if (result.success) return result.data as z.output<(typeof FIELDS)[K]>;
    problems.push(`${key}: ${describe(data[key])} isn't valid, using the default`);
    return undefined;
  };

  const meta: NoteMeta = {
    title: value("title") ?? fallbacks.title,
    type: value("type") ?? DEFAULTS.type,
    lang: value("lang") ?? DEFAULTS.lang,
    status: value("status") ?? DEFAULTS.status,
    tags: value("tags") ?? [],
    created: value("created") ?? fallbacks.created.toISOString(),
    updated: value("updated") ?? fallbacks.updated.toISOString(),
  };
  const titleJa = value("titleJa");
  const excerpt = value("excerpt");
  const image = value("image");
  if (titleJa) meta.titleJa = titleJa;
  if (excerpt) meta.excerpt = excerpt;
  if (image) meta.image = image;

  const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !KNOWN.has(key)));
  return { meta, body, extra, problems, readable };
}

export function serializeNote(meta: NoteMeta, extra: Record<string, unknown>, body: string): string {
  const ordered: Record<string, unknown> = {};
  for (const key of KEY_ORDER) {
    const v = meta[key];
    if (v !== undefined && v !== "") ordered[key] = v;
  }
  for (const [key, v] of Object.entries(extra)) {
    if (!KNOWN.has(key)) ordered[key] = v;
  }

  const doc = new Document(ordered);
  const tags = doc.get("tags", true);
  if (isSeq(tags)) tags.flow = true; // tags: [a, b]

  // always one trailing newline; parse strips exactly one, so bodies round-trip
  return `---\n${doc.toString({ lineWidth: 0 })}---\n\n${body}\n`;
}

function split(text: string): { frontmatter: string | null; body: string } {
  const stripOne = (s: string) => (s.startsWith("\n") ? s.slice(1) : s);
  const stripTrailing = (s: string) => (s.endsWith("\n") ? s.slice(0, -1) : s);

  if (!text.startsWith("---\n")) return { frontmatter: null, body: stripTrailing(text) };
  const rest = text.slice(4);
  const fence = /^---[ \t]*$/m.exec(rest);
  if (!fence) return { frontmatter: null, body: stripTrailing(text) };

  const frontmatter = rest.slice(0, fence.index);
  // drop the end of the fence line, then the blank line after it
  const body = stripOne(stripOne(rest.slice(fence.index + fence[0].length)));
  return { frontmatter, body: stripTrailing(body) };
}

function describe(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.length > 40 ? `${text.slice(0, 40)}…` : text}"`;
}
