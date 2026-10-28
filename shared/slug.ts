// Note folder names are ASCII slugs. macOS and Windows can store non-ASCII filenames in
// different Unicode forms, which git then sees as different names.
// Shared so the editor can tell when a note's slug no longer matches its title.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_LENGTH = 60;

// letters that Unicode decomposition doesn't turn into ASCII
const SPECIAL: Record<string, string> = { æ: "ae", ø: "o", œ: "oe", ß: "ss", đ: "d", ł: "l", þ: "th", ð: "d" };

export function isValidSlug(slug: string): boolean {
  return slug.length <= 80 && SLUG.test(slug);
}

/**
 * "Hva er visualisering?" → "hva-er-visualisering", "Ærlig" → "aerlig".
 * Japanese characters are dropped; a title with nothing left falls back to note-YYYYMMDD-HHmm.
 */
export function slugify(title: string, when: Date): string {
  const ascii = foldLatin(title.toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const slug = trimToLength(ascii);
  return slug || `note-${stamp(when, "minutes")}`;
}

/** Lowercase Latin text to plain ASCII letters: "ærlig" → "aerlig", "pontochō" → "pontocho". */
export function foldLatin(lower: string): string {
  return lower
    .replace(/[æøœßđłþð]/g, (ch) => SPECIAL[ch] ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, ""); // combining marks: å → a, é → e
}

/** `base`, or `base-2`, `base-3`… if `taken` says it's in use. */
export function uniqueSlug(base: string, taken: (slug: string) => boolean): string {
  if (!taken(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${trimToLength(base, MAX_LENGTH - String(n).length - 1)}-${n}`;
    if (!taken(candidate)) return candidate;
  }
}

/** Local-time stamp: YYYYMMDD-HHmm, or YYYYMMDD-HHmmss. */
export function stamp(when: Date, precision: "minutes" | "seconds"): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${when.getFullYear()}${p(when.getMonth() + 1)}${p(when.getDate())}`;
  const time = `${p(when.getHours())}${p(when.getMinutes())}${precision === "seconds" ? p(when.getSeconds()) : ""}`;
  return `${date}-${time}`;
}

function trimToLength(slug: string, max = MAX_LENGTH): string {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > max / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}
