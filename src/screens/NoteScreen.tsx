import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { scanMdx } from "../../shared/mdx.ts";
import type { Note, VocabEntry } from "../../shared/types.ts";
import { emptyVocabCard, findVocabCards } from "../../shared/vocabcard.ts";
import { api, uploadImage } from "../api.ts";
import { CodeBadge } from "../components/CodeBadge.tsx";
import { MetaPanel } from "../components/MetaPanel.tsx";
import { Mosaic } from "../components/Mosaic.tsx";
import { Stamp } from "../components/Stamp.tsx";
import { StatusLine } from "../components/StatusLine.tsx";
import { TitleBlock } from "../components/TitleBlock.tsx";
import { VerticalPreview } from "../components/VerticalPreview.tsx";
import { VocabCardDialog } from "../components/VocabCardDialog.tsx";
import { Editor, type EditorHandle, type InboxDraft, type UploadState } from "../editor/Editor.tsx";
import { useNoteDraft } from "../editor/useNoteDraft.ts";
import { downloadAnki } from "../lib/anki.ts";
import { stationCodes } from "../lib/codes.ts";
import { splitTitle, titleSize } from "../lib/format.ts";
import { imageFiles } from "../lib/images.ts";
import { TYPE_LABELS } from "../lib/labels.ts";
import { cardToInput } from "../lib/vocab.ts";
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
  const [uploads, setUploads] = useState<UploadState>({ pending: 0, error: null });
  const [inboxDraft, setInboxDraft] = useState<InboxDraft | null>(null);
  /** The text shown in the vertical preview, taken when it opens; null while editing. */
  const [vertical, setVertical] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const vocabCards = useMemo(() => findVocabCards(saved.body, scanMdx(saved.body)).length, [saved.body]);
  const exportAnki = () => {
    const body = draft.currentBody();
    const rows = findVocabCards(body, scanMdx(body)).flatMap(({ card }) =>
      card ? [{ ...card, meaning: card.definition, source: meta.title }] : [],
    );
    downloadAnki(rows);
  };

  const upload = async (file: File) => {
    const image = await uploadImage(note.slug, file);
    void queryClient.invalidateQueries({ queryKey: ["images", note.slug] });
    return image;
  };

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

          <div className="view-toggle" role="group" aria-label="View">
            <button
              type="button"
              className={vertical === null ? "chip is-on" : "chip"}
              aria-pressed={vertical === null}
              onClick={() => setVertical(null)}
            >
              Edit<span lang="ja">編集</span>
            </button>
            <button
              type="button"
              className={vertical !== null ? "chip is-on" : "chip"}
              aria-pressed={vertical !== null}
              title="Read the note set vertically, right to left"
              onClick={() => setVertical(draft.currentBody())}
            >
              Vertical<span lang="ja">縦書き</span>
            </button>
          </div>

          {vertical !== null && <VerticalPreview body={vertical} slug={note.slug} lang={meta.lang} />}

          {/* stays mounted while the vertical preview shows, so the editor keeps its place and history */}
          <div className="note-text" hidden={vertical !== null}>
            <Editor
              ref={editor}
              initialDoc={note.body}
              slug={note.slug}
              lang={meta.lang}
              label={`Text of ${meta.title || "the note"}`}
              onChange={draft.setBody}
              uploadImage={upload}
              onUploads={setUploads}
              onAddToInbox={setInboxDraft}
            />

            {uploads.error && (
              <p className="plate plate--error">
                Couldn't add {uploads.error}
              </p>
            )}
            <div className="add-tools">
              <ImageDrop onFiles={(files) => editor.current?.addImages(files)} />
              <button type="button" className="add-card" onClick={() => editor.current?.newCard()}>
                + Vocab card<span lang="ja">単語カード</span>
              </button>
            </div>
          </div>
        </div>

        <MetaPanel
          slug={note.slug}
          meta={meta}
          dates={saved.meta}
          code={code}
          onChange={draft.setMeta}
          onRename={rename}
          onTrash={trash}
          published={saved.meta.published}
          vocabCards={vocabCards}
          onExportAnki={exportAnki}
          beforePublish={async () => {
            await draft.saveNow();
          }}
          publishBlocked={
            draft.status.state === "conflict"
              ? "Sort out the change made elsewhere first."
              : draft.status.state === "error" || draft.status.state === "blocked"
                ? `Save the note first: ${draft.status.message}`
                : null
          }
        />
      </div>

      {inboxDraft && (
        <VocabCardDialog
          mode="new"
          inbox={{ source: meta.title }}
          initial={{ ...emptyVocabCard(), ...inboxDraft }}
          onSave={async (card, source) => {
            const entry = await api<VocabEntry>("/vocab", { method: "POST", body: JSON.stringify(cardToInput(card, source)) });
            void queryClient.invalidateQueries({ queryKey: ["vocab"] });
            setNotice(`Saved ${entry.word} to the vocab inbox`);
          }}
          onClose={(saved) => {
            setInboxDraft(null);
            if (!saved) editor.current?.focus();
          }}
        />
      )}
      {notice && (
        <p className="toast" role="status">
          {notice}
          <Link href="/vocab">
            Open<span lang="ja">単語帳</span>
          </Link>
        </p>
      )}

      <StatusLine
        status={draft.status}
        stats={draft.stats}
        slug={note.slug}
        converting={uploads.pending}
        onRetry={() => void draft.saveNow()}
      />
    </main>
  );
}

/** "Drop renders here" below the editor: a drop target that's also a button for picking files. */
function ImageDrop({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <>
      <button
        type="button"
        className={over ? "dropzone is-over" : "dropzone"}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes("Files")) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onFiles(imageFiles(e.dataTransfer));
        }}
      >
        Drop renders here, or click to pick<span lang="ja">ここに画像をドロップ</span>
        <span className="mono">PNG · JPG · WebP → AVIF</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );
}
