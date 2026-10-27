import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { NOTE_TYPES, type CreateNoteRequest, type Note, type NoteType } from "../../shared/types.ts";
import { api } from "../api.ts";
import { TYPE_LABELS } from "../lib/labels.ts";

/** "+ New" button and its dialog: title and type, then straight to the new note. */
export function NewNote() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<NoteType>("note");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (body: CreateNoteRequest) => api<Note>("/notes", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (note) => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.setQueryData(["note", note.slug], note);
      dialog.current?.close();
      setTitle("");
      navigate(`/notes/${note.slug}`);
    },
  });

  return (
    <>
      <button className="btn-new" onClick={() => dialog.current?.showModal()}>
        + New<span lang="ja">新規</span>
      </button>
      <dialog ref={dialog} className="dialog" onClose={() => create.reset()} aria-labelledby="new-note-heading">
        <form
          className="dialog-form"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ title, type });
          }}
        >
          <p className="eyebrow" id="new-note-heading">
            <span className="dots">● ●</span>
            <span>
              New note<span lang="ja">新しいノート</span>
            </span>
          </p>
          <label className="field-group">
            <span className="flabel">
              Title<span lang="ja">題名</span>
            </span>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <div className="field-group">
            <span className="flabel">
              Type<span lang="ja">種類</span>
            </span>
            <div className="seg">
              {NOTE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={t === type ? "chip is-on" : "chip"}
                  data-type={t}
                  aria-pressed={t === type}
                  onClick={() => setType(t)}
                >
                  <i className="sw" />
                  {TYPE_LABELS[t].short}
                </button>
              ))}
            </div>
          </div>
          {create.isError && <p className="plate plate--error">{create.error.message}</p>}
          <div className="actions">
            <button className="btn" disabled={!title.trim() || create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
              <span lang="ja">作成</span>
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
