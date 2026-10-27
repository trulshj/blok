import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Note, NoteSummary, SearchResult } from "../shared/types.ts";
import { api } from "./api.ts";

/** All notes, kept current by useServerEvents. */
export function useNotes() {
  return useQuery({
    queryKey: ["notes"],
    queryFn: () => api<{ notes: NoteSummary[] }>("/notes"),
    select: (data) => data.notes,
  });
}

export function useNote(slug: string) {
  return useQuery({ queryKey: ["note", slug], queryFn: () => api<Note>(`/notes/${encodeURIComponent(slug)}`) });
}

/** Full-text results for `q`; keeps the previous results on screen while typing. */
export function useSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: ["search", query],
    queryFn: () => api<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(query)}`),
    select: (data) => data.results,
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
  });
}
