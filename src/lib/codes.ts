import type { NoteSummary, NoteType } from "../../shared/types.ts";
import { TYPE_LABELS } from "./labels.ts";

export type StationCode = { letter: string; number: string };

/**
 * Station-style codes like A·01: the type's letter, numbered in the order notes were created.
 * They're derived, not stored, so they shift when notes are trashed or change type.
 */
export function stationCodes(notes: NoteSummary[]): Map<string, StationCode> {
  const byType = new Map<NoteType, NoteSummary[]>();
  for (const note of notes) {
    const list = byType.get(note.meta.type) ?? [];
    list.push(note);
    byType.set(note.meta.type, list);
  }

  const codes = new Map<string, StationCode>();
  for (const [type, list] of byType) {
    list
      .sort((a, b) => a.meta.created.localeCompare(b.meta.created) || a.slug.localeCompare(b.slug))
      .forEach((note, i) => {
        codes.set(note.slug, { letter: TYPE_LABELS[type].letter, number: String(i + 1).padStart(2, "0") });
      });
  }
  return codes;
}
