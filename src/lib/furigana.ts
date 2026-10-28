import { annotate, findFurigana, hasKanji } from "../../shared/furigana.ts";
import { scanMdx } from "../../shared/mdx.ts";
import type { ReadingToken } from "../../shared/types.ts";

/**
 * Text split for the furigana dialog:
 * - prose: sent to the reading service.
 * - furigana: already there; its reading shows up to edit.
 * - keep: code, tags and other {…}, left as they are.
 */
export type Chunk = { kind: "prose"; text: string } | { kind: "furigana"; base: string; reading: string } | { kind: "keep"; text: string };

/** The index after the } closing the { at `i`, or -1. */
function closeBrace(text: string, i: number): number {
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === "\\") j++;
    else if (text[j] === "{") depth++;
    else if (text[j] === "}" && --depth === 0) return j + 1;
  }
  return -1;
}

export function furiganaChunks(text: string): Chunk[] {
  const regions = scanMdx(text);
  const furigana = new Map(findFurigana(text, regions).map((m) => [m.from, m]));
  const chunks: Chunk[] = [];
  let prose = "";
  const flush = () => {
    if (prose) chunks.push({ kind: "prose", text: prose });
    prose = "";
  };

  let r = 0;
  for (let i = 0; i < text.length; ) {
    const region = regions[r];
    if (region && i >= region.from) {
      flush();
      chunks.push({ kind: "keep", text: text.slice(region.from, region.to) });
      i = region.to;
      r++;
      continue;
    }
    const match = furigana.get(i);
    if (match) {
      flush();
      chunks.push({ kind: "furigana", base: match.base, reading: text.slice(match.from + match.base.length + 2, match.to - 1) });
      i = match.to;
      continue;
    }
    if (text[i] === "\\") {
      prose += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (text[i] === "{") {
      const end = closeBrace(text, i);
      if (end > 0 && (!region || end <= region.from)) {
        flush();
        chunks.push({ kind: "keep", text: text.slice(i, end) });
        i = end;
        continue;
      }
    }
    prose += text[i];
    i++;
  }
  flush();
  return chunks;
}

export type ReadingRow = { word: string; reading: string; include: boolean };

/** One row per word with kanji, in order of first appearance: existing furigana, then suggestions. */
export function readingRows(chunks: Chunk[], tokens: ReadingToken[][]): ReadingRow[] {
  const rows = new Map<string, ReadingRow>();
  let p = 0;
  for (const chunk of chunks) {
    if (chunk.kind === "furigana" && !rows.has(chunk.base)) {
      rows.set(chunk.base, { word: chunk.base, reading: chunk.reading, include: true });
    } else if (chunk.kind === "prose") {
      for (const token of tokens[p++] ?? []) {
        if (token.reading && hasKanji(token.surface) && !rows.has(token.surface)) {
          rows.set(token.surface, { word: token.surface, reading: token.reading, include: true });
        }
      }
    }
  }
  return [...rows.values()];
}

/**
 * The text with furigana from the rows. Unticked rows lose their furigana; with `firstOnly`, only a
 * word's first appearance gets it.
 */
export function applyReadings(chunks: Chunk[], tokens: ReadingToken[][], rows: ReadingRow[], { firstOnly = false } = {}): string {
  const byWord = new Map(rows.map((row) => [row.word, row]));
  const seen = new Set<string>();
  const word = (surface: string) => {
    const row = byWord.get(surface);
    const reading = row?.reading.trim();
    if (!row?.include || !reading || (firstOnly && seen.has(surface))) return surface;
    seen.add(surface);
    return annotate(surface, reading);
  };

  let p = 0;
  return chunks
    .map((chunk) => {
      if (chunk.kind === "keep") return chunk.text;
      if (chunk.kind === "furigana") return word(chunk.base);
      const list = tokens[p++];
      return list ? list.map((t) => word(t.surface)).join("") : chunk.text;
    })
    .join("");
}

/** The text of the prose chunks, for the reading service. */
export const proseTexts = (chunks: Chunk[]) => chunks.flatMap((c) => (c.kind === "prose" ? [c.text] : []));
