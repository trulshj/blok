import { findFurigana, parseFurigana, rubyHtml, type RubyPart } from "./furigana.ts";
import { skipBraces, type Region } from "./mdx.ts";

/**
 * The <VocabCard … /> component from truls.dev, as blok reads and writes it. The attributes are
 * strings; in `example`, {word} highlights a word and furigana works as everywhere else.
 */

export const VOCAB_FIELDS = ["word", "reading", "definition", "example", "translation", "context"] as const;
export type VocabField = (typeof VOCAB_FIELDS)[number];
export type VocabCard = Record<VocabField, string> & {
  /** Other attributes, verbatim (`client:load`, `foo={bar}`), kept when blok rewrites the card. */
  extra: string[];
};

export const emptyVocabCard = (): VocabCard => ({
  word: "",
  reading: "",
  definition: "",
  example: "",
  translation: "",
  context: "",
  extra: [],
});

const ATTR_NAME = /[A-Za-z_:][\w:.-]*/y;
const ENTITIES: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", nbsp: " " };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ref.toLowerCase()] ?? whole;
  });
}

/** The value of a JavaScript string literal like {"…"} or {'…'}; null for any other expression. */
function stringLiteral(expr: string): string | null {
  const double = /^"(?:[^"\\\n]|\\.)*"$/s.test(expr) ? expr : null;
  const single = /^'(?:[^'\\\n]|\\.)*'$/s.test(expr) ? `"${expr.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"` : null;
  const literal = double ?? single;
  if (!literal) return null;
  try {
    return JSON.parse(literal) as string;
  } catch {
    return null;
  }
}

/** Reads a self-closing <VocabCard … />. Null if it isn't one, or a field isn't a plain string. */
export function parseVocabCard(tag: string): VocabCard | null {
  if (!/^<VocabCard[\s/]/.test(tag) || !tag.endsWith("/>")) return null;
  const card = emptyVocabCard();
  const end = tag.length - 2;
  let i = "<VocabCard".length;

  while (i < end) {
    while (i < end && /\s/.test(tag[i]!)) i++;
    if (i >= end) break;
    ATTR_NAME.lastIndex = i;
    const name = ATTR_NAME.exec(tag)?.[0];
    if (!name) return null;
    i += name.length;
    while (i < end && /\s/.test(tag[i]!)) i++;
    if (tag[i] !== "=") {
      card.extra.push(name);
      continue;
    }
    i++;
    while (i < end && /\s/.test(tag[i]!)) i++;

    const start = i;
    let value: string | null;
    if (tag[i] === '"' || tag[i] === "'") {
      const close = tag.indexOf(tag[i]!, i + 1);
      if (close < 0 || close >= end) return null;
      value = decodeEntities(tag.slice(i + 1, close));
      i = close + 1;
    } else if (tag[i] === "{") {
      const close = skipBraces(tag, i);
      if (close < 0 || close > end) return null;
      value = stringLiteral(tag.slice(i + 1, close - 1).trim());
      i = close;
    } else return null;

    if ((VOCAB_FIELDS as readonly string[]).includes(name)) {
      if (value === null) return null; // an expression blok can't edit
      card[name as VocabField] = value;
    } else {
      card.extra.push(`${name}=${tag.slice(start, i)}`);
    }
  }
  return card;
}

/** An attribute value: "…" when possible, '…' when it has double quotes, else a JS string {"…"}. */
function attribute(value: string): string {
  const plain = !value.includes("\n") && !/&(#?\w+);/.test(value);
  if (plain && !value.includes('"')) return `"${value}"`;
  if (plain && !value.includes("'")) return `'${value}'`;
  return `{${JSON.stringify(value)}}`;
}

/** The card as MDX, one attribute per line like the posts on truls.dev. Empty optional fields are left out. */
export function serializeVocabCard(card: VocabCard): string {
  const lines = ["<VocabCard"];
  for (const field of VOCAB_FIELDS) {
    const value = card[field].trim();
    if (value || field === "word" || field === "definition") lines.push(`  ${field}=${attribute(value)}`);
  }
  for (const extra of card.extra) lines.push(`  ${extra}`);
  lines.push("/>");
  return lines.join("\n");
}

export type VocabCardBlock = { from: number; to: number; card: VocabCard | null };

/** The <VocabCard /> tags among the regions of a body (see scanMdx). */
export function findVocabCards(text: string, regions: readonly Region[]): VocabCardBlock[] {
  return regions
    .filter((r) => r.kind === "jsx" && text.startsWith("<VocabCard", r.from))
    .map((r) => ({ from: r.from, to: r.to, card: parseVocabCard(text.slice(r.from, r.to)) }));
}

// ---------- examples ----------

export type ExampleSegment = { mark: boolean } & ({ text: string } | { ruby: RubyPart[] });

/** The index after the } that closes the { at `i`, or -1. */
function closeBrace(text: string, i: number): number {
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}" && --depth === 0) return j + 1;
  }
  return -1;
}

/** Text with furigana inside, as segments. */
function withFurigana(text: string, mark: boolean, out: ExampleSegment[]) {
  let pos = 0;
  for (const match of findFurigana(text)) {
    if (match.from > pos) out.push({ text: text.slice(pos, match.from), mark });
    out.push({ ruby: match.parts, mark });
    pos = match.to;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), mark });
}

/**
 * An example sentence as segments:
 * - {松明} highlights the word, as before.
 * - {洞窟|どうくつ} is furigana, highlighted when it's the card's word.
 * - {{覚|おぼ}えた} highlights a word that has furigana inside.
 */
export function exampleSegments(example: string, word = ""): ExampleSegment[] {
  const out: ExampleSegment[] = [];
  let pos = 0;
  for (let i = example.indexOf("{"); i >= 0; i = example.indexOf("{", pos)) {
    const close = closeBrace(example, i);
    if (close < 0) break;
    if (i > pos) out.push({ text: example.slice(pos, i), mark: false });
    const inner = example.slice(i + 1, close - 1);
    const furigana = /^([^{}|]+)\|([^{}]+)$/.exec(inner);
    const parts = furigana && parseFurigana(furigana[1]!, furigana[2]!);
    if (parts && !/\s/.test(inner)) out.push({ ruby: parts, mark: furigana![1] === word.trim() });
    else withFurigana(inner, true, out);
    pos = close;
  }
  if (pos < example.length) out.push({ text: example.slice(pos), mark: false });
  return out;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The example as HTML: highlights in <mark>, furigana as <ruby>, everything else escaped. */
export function exampleHtml(example: string, word: string): string {
  let out = "";
  let open = false;
  for (const segment of exampleSegments(example, word)) {
    if (segment.mark !== open) {
      out += segment.mark ? "<mark>" : "</mark>";
      open = segment.mark;
    }
    out += "text" in segment ? escapeHtml(segment.text) : rubyHtml(segment.ruby);
  }
  return open ? `${out}</mark>` : out;
}

/** A card as one line of HTML (no blank lines, so markdown keeps it as one block). */
export function vocabCardHtml({ word, reading, definition, example, translation, context }: VocabCard): string {
  const head = reading ? rubyHtml([{ base: word, reading }]) : escapeHtml(word);
  const parts = [
    `<p class="vocab-card-word" lang="ja">${head}</p>`,
    definition && `<p class="vocab-card-def">${escapeHtml(definition)}</p>`,
    example && `<p class="vocab-card-example" lang="ja">${exampleHtml(example, word)}</p>`,
    translation && `<p class="vocab-card-translation">${escapeHtml(translation)}</p>`,
    context && `<p class="vocab-card-context">(${escapeHtml(context)})</p>`,
  ];
  return `<figure class="vocab-card">${parts.filter(Boolean).join("")}</figure>`;
}

/** The example as plain text, without braces or readings. */
export const exampleText = (example: string) =>
  exampleSegments(example)
    .map((s) => ("text" in s ? s.text : s.ruby.map((p) => p.base).join("")))
    .join("");
