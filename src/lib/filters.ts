import {
  NOTE_LANGS,
  NOTE_STATUSES,
  NOTE_TYPES,
  type NoteLang,
  type NoteStatus,
  type NoteSummary,
  type NoteType,
  type SearchResult,
} from "../../shared/types.ts";

export type SortKey = "updated" | "created" | "title";

/** Index filters. Empty lists mean "all". They live in the URL, e.g. ?type=art,note&tag=blender&q=kyoto */
export type Filters = {
  types: NoteType[];
  langs: NoteLang[];
  statuses: NoteStatus[];
  tag: string | null;
  q: string;
  sort: SortKey;
};

export function readFilters(params: URLSearchParams): Filters {
  const list = <T extends string>(key: string, allowed: readonly T[]): T[] =>
    (params.get(key)?.split(",") ?? []).filter((v): v is T => (allowed as readonly string[]).includes(v));
  const sort = params.get("sort");
  return {
    types: list("type", NOTE_TYPES),
    langs: list("lang", NOTE_LANGS),
    statuses: list("status", NOTE_STATUSES),
    tag: params.get("tag") || null,
    q: params.get("q") ?? "",
    sort: sort === "created" || sort === "title" ? sort : "updated",
  };
}

export function writeFilters(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.types.length) params.set("type", filters.types.join(","));
  if (filters.langs.length) params.set("lang", filters.langs.join(","));
  if (filters.statuses.length) params.set("status", filters.statuses.join(","));
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.sort !== "updated") params.set("sort", filters.sort);
  return params;
}

export function isFiltered(f: Filters): boolean {
  return Boolean(f.types.length || f.langs.length || f.statuses.length || f.tag || f.q.trim());
}

/** Adds `value` to the list, or removes it if it's there. */
export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const COMPARE: Record<SortKey, (a: NoteSummary, b: NoteSummary) => number> = {
  updated: (a, b) => b.meta.updated.localeCompare(a.meta.updated),
  created: (a, b) => b.meta.created.localeCompare(a.meta.created),
  title: (a, b) => a.meta.title.localeCompare(b.meta.title, "en", { sensitivity: "base", numeric: true }),
};

/**
 * Notes that pass the filters. With a search query and its results, only matches, best first;
 * while results are still loading, the query is ignored rather than showing nothing.
 */
export function applyFilters(notes: NoteSummary[], f: Filters, results?: SearchResult[]): NoteSummary[] {
  const kept = notes.filter(
    (n) =>
      (!f.types.length || f.types.includes(n.meta.type)) &&
      (!f.langs.length || f.langs.includes(n.meta.lang)) &&
      (!f.statuses.length || f.statuses.includes(n.meta.status)) &&
      (!f.tag || n.meta.tags.includes(f.tag)),
  );

  if (f.q.trim() && results) {
    const rank = new Map(results.map((r, i) => [r.slug, i]));
    return kept.filter((n) => rank.has(n.slug)).sort((a, b) => rank.get(a.slug)! - rank.get(b.slug)!);
  }
  return kept.sort(COMPARE[f.sort]);
}

/** Every tag with how many notes use it, most used first. */
export function tagCounts(notes: NoteSummary[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const note of notes) for (const tag of note.meta.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
