import { useEffect, useRef, useState } from "react";
import type { Note, NoteSummary, UpdateNoteRequest, VocabEntry } from "../../shared/types.ts";
import { serializeVocabCard } from "../../shared/vocabcard.ts";
import { api } from "../api.ts";
import { relativeTime } from "../lib/format.ts";
import { entryToCard } from "../lib/vocab.ts";
import { useNotes } from "../queries.ts";

/** Appends the entry to the note as a vocab card, then marks the entry as used there. */
export async function addCardToNote(slug: string, entry: VocabEntry): Promise<void> {
  const path = `/notes/${encodeURIComponent(slug)}`;
  const note = await api<Note>(path);
  const { created: _created, updated, published: _published, ...meta } = note.meta;
  const card = serializeVocabCard(entryToCard(entry));
  const body = note.body.trim() ? `${note.body.trimEnd()}\n\n${card}\n` : `${card}\n`;
  const request: UpdateNoteRequest = { meta, body, baseUpdated: updated };
  await api(path, { method: "PUT", body: JSON.stringify(request) });
  await api(`/vocab/${entry.id}/used`, { method: "POST", body: JSON.stringify({ slug }) });
}

type Props = {
  entry: VocabEntry;
  onAdded: (note: NoteSummary) => void;
  onClose: () => void;
};

/** Pick a note to add a word to; it goes at the end of the note as a vocab card. */
export function AddToNoteDialog({ entry, onAdded, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const notes = useNotes();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const query = q.trim().toLowerCase();
  const list = (notes.data ?? [])
    .filter((n) => !query || `${n.meta.title} ${n.meta.titleJa ?? ""} ${n.slug} ${n.meta.tags.join(" ")}`.toLowerCase().includes(query))
    .sort((a, b) => b.meta.updated.localeCompare(a.meta.updated))
    .slice(0, 40);

  const add = async (note: NoteSummary) => {
    setBusy(note.slug);
    setError(null);
    try {
      await addCardToNote(note.slug, entry);
      onAdded(note);
      dialog.current?.close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <dialog ref={dialog} className="dialog" onClose={(e) => e.target === e.currentTarget && onClose()} aria-labelledby="add-to-note-heading">
      <div className="dialog-form">
        <p className="eyebrow" id="add-to-note-heading">
          <span className="dots">● ●</span>
          <span>
            Add {entry.word} to a note<span lang="ja">ノートに追加</span>
          </span>
        </p>
        <p className="hint">It goes at the end of the note as a vocab card, ready to move where you want it.</p>
        <input
          className="field"
          type="search"
          placeholder="Find a note · ノートを探す"
          aria-label="Find a note"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && list[0]) {
              e.preventDefault();
              void add(list[0]);
            }
          }}
        />
        <ul className="note-pick" aria-label="Notes">
          {list.map((note) => (
            <li key={note.slug}>
              <button type="button" disabled={busy !== null} onClick={() => void add(note)}>
                <span className="note-pick-title">
                  {note.meta.title}
                  {note.meta.titleJa && <span lang="ja">{note.meta.titleJa}</span>}
                </span>
                <span className="mono">{busy === note.slug ? "Adding…" : relativeTime(note.meta.updated)}</span>
              </button>
            </li>
          ))}
          {notes.isSuccess && list.length === 0 && <li className="hint">No notes match.</li>}
        </ul>
        {error && <p className="plate plate--error">{error}</p>}
        <div className="actions">
          <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
