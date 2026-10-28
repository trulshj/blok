/**
 * Where a note's text isn't prose: code, JSX and HTML tags, and MDX import/export lines.
 * Furigana is rendered and converted only outside these regions, and in .mdx posts only braces
 * outside them are escaped, so the editor and publishing always agree on what's text.
 */

export type RegionKind = "code" | "jsx" | "html" | "esm";
export type Region = { from: number; to: number; kind: RegionKind };

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const BLANK = /^\s*$/;
const TAG_NAME = /[A-Za-z][\w.:-]*/y;

/** Lines of `text` as [from, to, next] (`to` excludes the newline). */
function* lines(text: string, from = 0): Generator<[number, number, number]> {
  for (let pos = from; pos < text.length; ) {
    const eol = text.indexOf("\n", pos);
    const to = eol === -1 ? text.length : eol;
    const next = eol === -1 ? text.length : eol + 1;
    yield [pos, to, next];
    pos = next;
  }
}

/** Fenced code blocks and import/export blocks, in order. */
function blockRegions(text: string): Region[] {
  const regions: Region[] = [];
  let prevBlank = true;
  const iter = lines(text);

  for (let step = iter.next(); !step.done; step = iter.next()) {
    const [from, to] = step.value;
    const line = text.slice(from, to);

    const fence = FENCE.exec(line);
    if (fence?.[1]) {
      const marker = fence[1];
      const closing = new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`);
      let end = text.length;
      for (step = iter.next(); !step.done; step = iter.next()) {
        const [lineFrom, lineTo] = step.value;
        if (closing.test(text.slice(lineFrom, lineTo))) {
          end = lineTo;
          break;
        }
      }
      regions.push({ from, to: end, kind: "code" });
      prevBlank = false;
      continue;
    }

    // MDX: import/export at the start of a paragraph, until the next blank line
    if (prevBlank && /^(import|export)\s/.test(line)) {
      let end = to;
      for (step = iter.next(); !step.done; step = iter.next()) {
        const [lineFrom, lineTo] = step.value;
        if (BLANK.test(text.slice(lineFrom, lineTo))) break;
        end = lineTo;
      }
      regions.push({ from, to: end, kind: "esm" });
      prevBlank = true; // the loop stopped on a blank line (or the end)
      continue;
    }

    prevBlank = BLANK.test(line);
  }
  return regions;
}

/**
 * Skips a quoted string starting at `i`; returns the index after it, or -1 if it never closes.
 * JSX attribute strings have no escapes; JavaScript strings inside {…} do.
 */
function skipString(text: string, i: number, escapes: boolean): number {
  const quote = text[i];
  for (let j = i + 1; j < text.length; j++) {
    if (escapes && text[j] === "\\") j++;
    else if (text[j] === quote) return j + 1;
  }
  return -1;
}

/** Skips a balanced {…} expression starting at `i`, with strings inside it; -1 if it never closes. */
export function skipBraces(text: string, i: number): number {
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = skipString(text, j, true);
      if (end < 0) return -1;
      j = end - 1;
    } else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return j + 1;
  }
  return -1;
}

/**
 * The end of a tag starting at `i` (`<VocabCard …/>`, `</b>`, `<>`, `<!-- … -->`), honouring quoted
 * attribute values and {…} expressions. -1 if there's no tag here, e.g. "a < b" or "<3".
 */
function tagEnd(text: string, i: number): { end: number; kind: "jsx" | "html" } | null {
  if (text.startsWith("<!--", i)) {
    const close = text.indexOf("-->", i + 4);
    return close < 0 ? null : { end: close + 3, kind: "html" };
  }
  let j = i + 1;
  if (text[j] === "/") j++;
  if (text[j] === ">") return { end: j + 1, kind: "jsx" }; // fragment

  TAG_NAME.lastIndex = j;
  const name = TAG_NAME.exec(text)?.[0];
  if (!name) return null;
  j += name.length;
  if (!/[\s/>]/.test(text[j] ?? "")) return null;
  const kind = /^[A-Z]/.test(name) || name.includes(".") ? "jsx" : "html";

  for (; j < text.length; j++) {
    const ch = text[j];
    if (ch === ">") return { end: j + 1, kind };
    if (ch === '"' || ch === "'") {
      const end = skipString(text, j, false);
      if (end < 0) return null;
      j = end - 1;
    } else if (ch === "{") {
      const end = skipBraces(text, j);
      if (end < 0) return null;
      j = end - 1;
    } else if (ch === "<") return null;
    else if (ch === "\n") {
      const next = text.indexOf("\n", j + 1);
      if (BLANK.test(text.slice(j + 1, next < 0 ? text.length : next))) return null; // a blank line ends it
    }
  }
  return null;
}

/** The text up to the end of the paragraph that `i` is in (the next blank line). */
function paragraphEnd(text: string, i: number, limit: number): number {
  const blank = /\n[ \t]*\n/g;
  blank.lastIndex = i;
  const match = blank.exec(text);
  return Math.min(match ? match.index : text.length, limit);
}

/** Inline code spans and tags between `from` and `to`. */
function inlineRegions(text: string, from: number, to: number, out: Region[]) {
  for (let i = from; i < to; ) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") {
      let n = 1;
      while (text[i + n] === "`") n++;
      const end = paragraphEnd(text, i, to);
      let close = -1;
      for (let j = i + n; j < end; ) {
        if (text[j] !== "`") {
          j++;
          continue;
        }
        let m = 1;
        while (text[j + m] === "`") m++;
        if (m === n) {
          close = j;
          break;
        }
        j += m;
      }
      if (close >= 0) {
        out.push({ from: i, to: close + n, kind: "code" });
        i = close + n;
      } else i += n;
      continue;
    }
    if (ch === "<") {
      const tag = tagEnd(text, i);
      if (tag && tag.end <= to) {
        out.push({ from: i, to: tag.end, kind: tag.kind });
        i = tag.end;
        continue;
      }
    }
    i++;
  }
}

/** Every non-prose region of a markdown/MDX body, sorted and non-overlapping. */
export function scanMdx(text: string): Region[] {
  const regions: Region[] = [];
  let pos = 0;
  for (const block of blockRegions(text)) {
    inlineRegions(text, pos, block.from, regions);
    regions.push(block);
    pos = block.to;
  }
  inlineRegions(text, pos, text.length, regions);
  return regions;
}

/** The region containing `pos` (from inclusive, to exclusive), if any. */
export function regionAt(regions: readonly Region[], pos: number): Region | undefined {
  let lo = 0;
  let hi = regions.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = regions[mid]!;
    if (pos < r.from) hi = mid - 1;
    else if (pos >= r.to) lo = mid + 1;
    else return r;
  }
  return undefined;
}

/** Rewrites the prose between regions with `fn`, keeping the regions as they are. */
export function mapProse(text: string, regions: readonly Region[], fn: (prose: string) => string): string {
  let out = "";
  let pos = 0;
  for (const region of regions) {
    out += fn(text.slice(pos, region.from)) + text.slice(region.from, region.to);
    pos = region.to;
  }
  return out + fn(text.slice(pos));
}

/** Escapes { and } so MDX shows them as text instead of reading a JavaScript expression. */
export function escapeBraces(prose: string): string {
  return prose.replace(/\\[\s\S]|[{}]/g, (m) => (m.length === 2 ? m : `\\${m}`));
}
