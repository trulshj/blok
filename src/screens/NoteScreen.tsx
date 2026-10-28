import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "wouter";
import type { Note } from "../../shared/types.ts";
import { api } from "../api.ts";
import { CodeBadge } from "../components/CodeBadge.tsx";
import { MetaPanel } from "../components/MetaPanel.tsx";
import { Mosaic } from "../components/Mosaic.tsx";
import { Stamp } from "../components/Stamp.tsx";
import { StatusLine } from "../components/StatusLine.tsx";
import { TitleBlock } from "../components/TitleBlock.tsx";
import { Editor, type EditorHandle } from "../editor/Editor.tsx";
import { useNoteDraft } from "../editor/useNoteDraft.ts";
import { stationCodes } from "../lib/codes.ts";
import { splitTitle, titleSize } from "../lib/format.ts";
import { TYPE_LABELS } from "../lib/labels.ts";
import { useNote, useNotes } from "../queries.ts";

const back = (
  <Link href="/" className="back">
    ← All notes<span lang="ja">ノート一覧</span>
  </Link>
);

/** Loads the note, then keeps the editor mounted even if a later refetch fails, so unsaved text is never lost. */
export function NoteScreen({ slug }: { slug: string }) {
  const note = useNote(slug);

  if (note.data) return <NoteEditor note={note.data} />;
  return (
    <main className="screen">
      {back}
      {note.isError ? (
        <p className="plate plate--error">{note.error.message}</p>
      ) : (
        <p className="loading">
          Loading <span lang="ja">読み込み中</span>
        </p>
      )}
    </main>
  );
}

function NoteEditor({ note }: { note: Note }) {
  const editor = useRef<EditorHandle>(null);
  const draft = useNoteDraft(note, editor);
  const { meta } = draft;
  const saved = useNote(note.slug).data ?? note;
  const notes = useNotes();
  const code = useMemo(() => stationCodes(notes.data ?? []).get(note.slug), [notes.data, note.slug]);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // Ctrl/⌘+S saves right away, wherever the focus is
  const { saveNow } = draft;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow]);

  const rename = async () => {
    await draft.saveNow();
    const renamed = await api<Note>(`/notes/${note.slug}/rename`, { method: "POST", body: "{}" });
    queryClient.setQueryData(["note", renamed.slug], renamed);
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    navigate(`/notes/${renamed.slug}`, { replace: true });
  };

  const trash = async () => {
    draft.discard();
    await api(`/notes/${note.slug}`, { method: "DELETE" });
    queryClient.removeQueries({ queryKey: ["note", note.slug] });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    navigate("/");
  };

  const lines = splitTitle(meta.title || "Untitled");
  const type = TYPE_LABELS[meta.type];

  return (
    <main className="note-screen" data-type={meta.type}>
      <div className="note-layout">
        <div className="note-main">
          {back}

          <div className="note-head">
            {/* clicking the title jumps to its field in the panel */}
            <div className="note-title-click" onClick={() => document.getElementById("note-title")?.focus()}>
              <TitleBlock
                lines={lines}
                size={titleSize(lines, 820, 118)}
                slab={meta.titleJa?.trim() || undefined}
                stamp={<Stamp status={meta.status} size={104} />}
                plateBottomSide="left"
                plateBottom={
                  <>
                    <CodeBadge code={code} />
                    {type.en}
                    <span lang="ja">{type.ja}</span>
                  </>
                }
              />
            </div>
            <Mosaic
              className="note-mosaic"
              seed={note.slug}
              cols={7}
              rows={7}
              tile={22}
              density={0.8}
              anchor={[0.15, 0.5]}
              colors={["ink", "t", "taupe", "cream"]}
            />
          </div>

          {draft.status.state === "conflict" && (
            <div className="banner" role="alert">
              <p>
                This note changed outside blok (on another machine, or in a git pull) while you had unsaved edits.
                <span lang="ja">別の場所で変更されました。</span>
              </p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => void draft.keepMine()}>
                  Keep mine<span lang="ja">自分の版</span>
                </button>
                <button type="button" className="btn btn--ghost" onClick={draft.loadTheirs}>
                  Load the version on disk
                </button>
              </div>
            </div>
          )}
          {draft.missing && (
            <p className="plate plate--error">
              This note was renamed or moved to the trash outside blok. Your text is still here, so copy it before you
              leave.
            </p>
          )}
          {saved.problems.map((problem) => (
            <p key={problem} className="plate plate--error">
              {problem}
            </p>
          ))}

          <Editor
            ref={editor}
            initialDoc={note.body}
            lang={meta.lang}
            label={`Text of ${meta.title || "the note"}`}
            onChange={draft.setBody}
          />
        </div>

        <MetaPanel
          slug={note.slug}
          meta={meta}
          dates={saved.meta}
          code={code}
          onChange={draft.setMeta}
          onRename={rename}
          onTrash={trash}
        />
      </div>

      <StatusLine status={draft.status} stats={draft.stats} slug={note.slug} onRetry={() => void draft.saveNow()} />
    </main>
  );
}
