import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Note, NoteMeta, NoteMetaInput, UpdateNoteRequest } from "../../shared/types.ts";
import { api, ApiError } from "../api.ts";
import { countText } from "../lib/format.ts";
import { useNote } from "../queries.ts";
import { ConflictError, createAutosaver, type SaveStatus } from "./autosave.ts";
import type { EditorHandle } from "./Editor.tsx";

const toInput = ({ created, updated, published, ...input }: NoteMeta): NoteMetaInput => input;

/**
 * The editable copy of a note: metadata in state, body in a ref (the editor owns the text),
 * autosaved through createAutosaver. Changes that arrive from disk (another machine, a git pull)
 * load into the editor when there are no unsaved edits, and raise a conflict when there are.
 */
export function useNoteDraft(note: Note, editor: RefObject<EditorHandle | null>) {
  const slug = note.slug;
  const queryClient = useQueryClient();
  const remote = useNote(slug); // refetched on server events

  const [meta, setMetaState] = useState<NoteMetaInput>(() => toInput(note.meta));
  const [status, setStatus] = useState<SaveStatus>({ state: "saved", at: note.meta.updated });
  const [stats, setStats] = useState(() => countText(note.body));
  const metaRef = useRef(meta);
  const bodyRef = useRef(note.body);
  const statsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const request = (base: string | undefined): UpdateNoteRequest => ({
    meta: metaRef.current,
    body: bodyRef.current,
    baseUpdated: base,
  });

  const [saver] = useState(() =>
    createAutosaver({
      base: note.meta.updated,
      onStatus: setStatus,
      blocked: () => (metaRef.current.title.trim() ? null : "Give the note a title to save it"),
      save: async (base) => {
        try {
          const saved = await api<Note>(`/notes/${slug}`, { method: "PUT", body: JSON.stringify(request(base)) });
          queryClient.setQueryData(["note", slug], saved);
          void queryClient.invalidateQueries({ queryKey: ["notes"] });
          return saved.meta.updated;
        } catch (err) {
          if (err instanceof ApiError && err.code === "conflict") {
            void queryClient.invalidateQueries({ queryKey: ["note", slug] }); // fetch what's on disk
            throw new ConflictError(err.message);
          }
          throw err;
        }
      },
    }),
  );

  function load(version: Note) {
    bodyRef.current = version.body;
    editor.current?.replaceDoc(version.body);
    metaRef.current = toInput(version.meta);
    setMetaState(metaRef.current);
    setStats(countText(version.body));
    saver.reset(version.meta.updated);
  }

  // a newer version on disk: load it, or flag a conflict if there are unsaved edits
  useEffect(() => {
    const latest = remote.data;
    if (!latest || status.state === "saving" || latest.meta.updated === saver.base()) return;
    if (saver.hasUnsaved()) saver.markConflict();
    else load(latest);
    // load() only touches refs and setters
  }, [remote.data, status.state, saver]);

  // flush unsaved edits when leaving the note or closing the tab
  useEffect(() => {
    const flush = () => {
      if (!saver.hasUnsaved() || !metaRef.current.title.trim()) return;
      void fetch(`/api/notes/${slug}`, {
        method: "PUT",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request(saver.base())),
      });
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      saver.cancel();
      flush();
    };
    // request() reads refs only
  }, [saver, slug]);

  // stable across renders, so they're safe in effect dependencies and editor callbacks
  const [actions] = useState(() => ({
    setMeta(patch: Partial<NoteMetaInput>) {
      metaRef.current = { ...metaRef.current, ...patch };
      setMetaState(metaRef.current);
      saver.change();
    },
    setBody(text: string) {
      bodyRef.current = text;
      saver.change();
      clearTimeout(statsTimer.current);
      statsTimer.current = setTimeout(() => setStats(countText(bodyRef.current)), 400);
    },
    saveNow: () => saver.saveNow(),
  }));

  return {
    slug,
    meta,
    status,
    stats,
    /** The note is gone on disk (renamed or trashed elsewhere). */
    missing: remote.isError && remote.error instanceof ApiError && remote.error.status === 404,
    ...actions,
    /** Resolve a conflict by saving this draft over the version on disk. */
    keepMine: () => saver.overwrite(),
    /** Resolve a conflict by loading the version on disk. */
    loadTheirs: () => remote.data && load(remote.data),
    /** Stop saving, e.g. before moving the note to the trash. */
    discard: () => {
      saver.cancel();
      saver.reset(saver.base());
    },
  };
}

export type NoteDraft = ReturnType<typeof useNoteDraft>;
