import { regionAt, type Region } from "./mdx.ts";

/**
 * Furigana in a note: {漢字|かんじ} puts one reading over the word, {漢字|かん|じ} one reading
 * per character. There are no spaces inside, so a JavaScript expression like {a || b} is never
 * furigana, and the base needs a non-ASCII character, so {x|y} isn't either.
 */
const FURIGANA = /\{([^\s{}|<>`\\]+)\|([^\s{}<>`\\]+)\}/g;
const NON_ASCII = /[^\x00-\x7f]/;

export type RubyPart = { base: string; reading: string };
export type FuriganaMatch = { from: number; to: number; base: string; parts: RubyPart[] };

/** One part per character when there's a reading for each, otherwise one part for the whole base. */
export function rubyParts(base: string, readings: string[]): RubyPart[] {
  const chars = [...base];
  if (readings.length > 1 && readings.length === chars.length) {
    return chars.map((ch, i) => ({ base: ch, reading: readings[i]! }));
  }
  return [{ base, reading: readings.join("") }];
}

/** The ruby parts of `{base|readings}`, or null if it isn't furigana. */
export function parseFurigana(base: string, readings: string): RubyPart[] | null {
  if (!NON_ASCII.test(base)) return null;
  const list = readings.split("|");
  if (list.some((r) => !r)) return null;
  return rubyParts(base, list);
}

/** True when the character at `i` has an odd number of backslashes before it. */
function isEscaped(text: string, i: number): boolean {
  let n = 0;
  while (i - n - 1 >= 0 && text[i - n - 1] === "\\") n++;
  return n % 2 === 1;
}

/** Furigana in `text` outside `regions` (code, tags), skipping escaped ones like \{漢字|かんじ}. */
export function findFurigana(text: string, regions: readonly Region[] = []): FuriganaMatch[] {
  const found: FuriganaMatch[] = [];
  for (const m of text.matchAll(FURIGANA)) {
    const from = m.index;
    if (isEscaped(text, from) || regionAt(regions, from)) continue;
    const parts = parseFurigana(m[1]!, m[2]!);
    if (parts) found.push({ from, to: from + m[0].length, base: m[1]!, parts });
  }
  return found;
}

/** Replaces each furigana outside `regions` with `fn(match)`. */
export function replaceFurigana(text: string, fn: (match: FuriganaMatch) => string, regions: readonly Region[] = []): string {
  let out = "";
  let pos = 0;
  for (const match of findFurigana(text, regions)) {
    out += text.slice(pos, match.from) + fn(match);
    pos = match.to;
  }
  return out + text.slice(pos);
}

/** The text without readings: {漢字|かんじ}を → 漢字を. For previews, word counts and search. */
export const stripFurigana = (text: string) => replaceFurigana(text, (m) => m.base);

/** Every reading in the text, for search. */
export const furiganaReadings = (text: string) => findFurigana(text).map((m) => m.parts.map((p) => p.reading).join(""));

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** <ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp>…</ruby>; the parentheses show where ruby isn't supported (RSS readers). */
export function rubyHtml(parts: RubyPart[]): string {
  const inner = parts.map((p) => `${escapeHtml(p.base)}<rp>(</rp><rt>${escapeHtml(p.reading)}</rt><rp>)</rp>`).join("");
  return `<ruby>${inner}</ruby>`;
}

/** Furigana in prose as <ruby> HTML. */
export const furiganaToHtml = (prose: string) => replaceFurigana(prose, (m) => rubyHtml(m.parts));

/** Markup for a base with one reading, or one per character when written with |: かん|じ. */
export function furiganaMarkup(base: string, reading: string): string {
  return `{${base}|${reading}}`;
}

// ---------- readings and okurigana ----------

const KANJI_CHARS = "\\p{Script=Han}々〆ヵヶ";
const KANJI = new RegExp(`[${KANJI_CHARS}]`, "u");
const RUNS = new RegExp(`[${KANJI_CHARS}]+|[^${KANJI_CHARS}]+`, "gu");

export const hasKanji = (text: string) => KANJI.test(text);

/** Katakana to hiragana (ァ–ヶ shift down to ぁ–ゖ); everything else stays. */
export const toHiragana = (text: string) =>
  text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

export type ReadingPart = { text: string; reading?: string };

/**
 * Splits a word into kanji runs with their readings and the kana between them, so okurigana stays
 * outside the ruby: 取り扱い + とりあつかい → 取(と) り 扱(あつか) い. Null when the reading doesn't fit
 * the kana in the word.
 */
export function splitOkurigana(word: string, reading: string): ReadingPart[] | null {
  const runs = word.match(RUNS) ?? [];
  if (!runs.some((run) => KANJI.test(run))) return [{ text: word }];
  const pattern = runs
    .map((run) => (KANJI.test(run) ? "(.+?)" : toHiragana(run).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  // match in hiragana, but slice the reading as written (the conversion keeps every position)
  const match = new RegExp(`^${pattern}$`, "sud").exec(toHiragana(reading));
  if (!match?.indices) return null;
  const { indices } = match;
  let group = 1;
  return runs.map((run) => {
    if (!KANJI.test(run)) return { text: run };
    const [from, to] = indices[group++]!;
    return { text: run, reading: reading.slice(from, to) };
  });
}

/** Furigana markup for a word and its reading, with okurigana outside: 覚えた + おぼえた → {覚|おぼ}えた. */
export function annotate(word: string, reading: string): string {
  if (!reading || !hasKanji(word)) return word;
  if (reading.includes("|")) return furiganaMarkup(word, reading); // per-character readings, as written
  const parts = splitOkurigana(word, reading);
  if (!parts) return furiganaMarkup(word, reading);
  return parts.map((p) => (p.reading ? furiganaMarkup(p.text, p.reading) : p.text)).join("");
}
