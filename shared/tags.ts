/** Lowercase, no leading #, spaces to dashes, no duplicates or empties. Shared so the tag field shows what gets saved. */
export function normalizeTags(tags: string[]): string[] {
  const clean = tags.map((t) => t.trim().replace(/^#+/, "").trim().replace(/\s+/g, "-").toLowerCase()).filter(Boolean);
  return [...new Set(clean)];
}
