import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Note, NoteImage, NoteSummary, SearchResult, SyncStatus } from "../shared/types.ts";
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

/** Git state of the notes folder. Also checks the remote, which the server limits to once a minute. */
export function useSyncStatus() {
  return useQuery({
    queryKey: ["sync"],
    queryFn: () => api<SyncStatus>("/sync?fetch=1"),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Images in a note's folder, for the cover picker. */
export function useNoteImages(slug: string) {
  return useQuery({
    queryKey: ["images", slug],
    queryFn: () => api<{ images: NoteImage[] }>(`/notes/${encodeURIComponent(slug)}/images`),
    select: (data) => data.images,
  });
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
