import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, placeholder } from "@codemirror/view";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { hasKanji } from "../../shared/furigana.ts";
import type { NoteLang, UploadedImage } from "../../shared/types.ts";
import { emptyVocabCard, serializeVocabCard, type VocabCard } from "../../shared/vocabcard.ts";
import { FuriganaDialog } from "../components/FuriganaDialog.tsx";
import { VocabCardDialog } from "../components/VocabCardDialog.tsx";
import { imageFiles } from "../lib/images.ts";
import { wordFromSelection } from "../lib/vocab.ts";
import { livePreview, markdownStyle, noteSlug } from "./livePreview.ts";
import { editorActions, editorFocus, mdxInfo, type EditorActions } from "./mdxState.ts";
import { paragraphAt, selectionTools } from "./selectionTools.ts";
import { vocabCards } from "./vocabCards.ts";

export type EditorHandle = {
  /** Replace the whole text, e.g. with a version changed on disk. Doesn't count as an edit. */
  replaceDoc(text: string): void;
  /** Upload images and insert them at the cursor (or the end, if the text hasn't been touched). */
  addImages(files: File[]): void;
  /** Open the dialog for a new vocab card, inserted after the cursor's paragraph (or at the end). */
  newCard(): void;
  focus(): void;
};

/** A word picked in the text for the vocab inbox. */
export type InboxDraft = ReturnType<typeof wordFromSelection>;

/** The dialog open over the editor, with the text it will replace (checked again before replacing). */
type Dialog =
  | { kind: "furigana"; from: number; to: number; text: string }
  | { kind: "card"; from: number; to: number; text: string; card: VocabCard }
  | { kind: "new-card"; at: number; card: VocabCard };

export type UploadState = { pending: number; error: string | null };

type Props = {
  /** Only read on mount; key the component by note to load another one. */
  initialDoc: string;
  slug: string;
  /** Sets the lang attribute, for spellchecking and Japanese glyphs. */
  lang: NoteLang;
  label: string;
  onChange: (doc: string) => void;
  uploadImage: (file: File) => Promise<UploadedImage>;
  onUploads: (state: UploadState) => void;
  /** Save a selected word to the vocab inbox. */
  onAddToInbox?: (draft: InboxDraft) => void;
  ref?: Ref<EditorHandle>;
};

const fromOutside = Annotation.define<boolean>();
const contentLang = (lang: NoteLang) => EditorView.contentAttributes.of({ lang, spellcheck: "true" });

/** CodeMirror markdown editor with live styling (see livePreview.ts) and image drop/paste. */
export function Editor({ initialDoc, slug, lang, label, onChange, uploadImage, onUploads, onAddToInbox, ref }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langSlot = useRef(new Compartment());
  const callbacks = useRef({ onChange, uploadImage, onUploads, onAddToInbox });
  const uploads = useRef<UploadState>({ pending: 0, error: null });
  const touched = useRef(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  useLayoutEffect(() => {
    callbacks.current = { onChange, uploadImage, onUploads, onAddToInbox };
  });

  /**
   * Opens a dialog. The editor lets go of focus first, so when the dialog changes the text you see
   * the result (ruby, the card) instead of the markup on the edited line.
   */
  function open(editor: EditorView, next: Dialog) {
    setDialogError(null);
    editor.contentDOM.blur();
    setDialog(next);
  }

  /** Replaces what the dialog was opened for, unless the text changed underneath it meanwhile. */
  function replace(from: number, to: number, expected: string, insert: string) {
    const editor = view.current;
    if (!editor) return;
    if (editor.state.sliceDoc(from, to) !== expected) {
      setDialogError("The text changed while the dialog was open, so nothing was replaced. Try again.");
      return;
    }
    editor.dispatch({ changes: { from, to, insert }, userEvent: "input.dialog" });
  }

  function closeDialog(changed: boolean) {
    setDialog(null);
    if (!changed) view.current?.focus();
  }

  /** A new card as a paragraph of its own after the line at `at`, or on it if it's empty. */
  function insertCard(editor: EditorView, at: number, card: VocabCard) {
    const line = editor.state.doc.lineAt(at);
    const text = serializeVocabCard(card);
    const after = line.to < editor.state.doc.length ? "" : "\n";
    editor.dispatch(
      line.text.trim()
        ? { changes: { from: line.to, insert: `\n\n${text}${after}` }, userEvent: "input.dialog" }
        : { changes: { from: line.from, to: line.to, insert: text }, userEvent: "input.dialog" },
    );
  }

  function removeCard(from: number, to: number, expected: string) {
    const editor = view.current;
    if (!editor) return;
    if (editor.state.sliceDoc(from, to) !== expected) {
      setDialogError("The card changed while the dialog was open, so it wasn't removed.");
      return;
    }
    // the card's lines, and one blank line next to them
    const { doc } = editor.state;
    let start = doc.lineAt(from).from;
    let end = doc.lineAt(to).to;
    const after = doc.sliceString(end, end + 2);
    if (after === "\n\n") end += 2;
    else if (after.startsWith("\n")) end += 1;
    else if (start > 0) start -= doc.sliceString(start - 2, start) === "\n\n" ? 2 : 1;
    editor.dispatch({ changes: { from: start, to: end }, userEvent: "delete.dialog" });
  }

  const actions: EditorActions = {
    furigana(editor) {
      const { state } = editor;
      const range = state.selection.main;
      let { from, to } = range.empty ? paragraphAt(state, range.head) : range;
      // take in furigana the selection only partly covers
      for (const match of state.field(mdxInfo).furigana) {
        if (match.from < to && match.to > from) {
          from = Math.min(from, match.from);
          to = Math.max(to, match.to);
        }
      }
      const text = state.sliceDoc(from, to);
      if (hasKanji(text)) open(editor, { kind: "furigana", from, to, text });
    },
    editCard(editor, pos) {
      const { state } = editor;
      const block = state.field(mdxInfo).cards.find((c) => state.doc.lineAt(c.from).from === pos);
      if (!block?.card) return;
      open(editor, { kind: "card", from: block.from, to: block.to, text: state.sliceDoc(block.from, block.to), card: block.card });
    },
    newCard(editor) {
      const range = editor.state.selection.main;
      const selected = editor.state.sliceDoc(range.from, range.to).trim();
      const word = selected.length <= 40 && !selected.includes("\n") ? selected : "";
      open(editor, { kind: "new-card", at: paragraphAt(editor.state, range.to).to, card: { ...emptyVocabCard(), word } });
    },
    addToInbox(editor) {
      const range = editor.state.selection.main;
      if (range.empty || !callbacks.current.onAddToInbox) return;
      // the word, and the sentence around it (on the selection's first line) as an example
      const line = editor.state.doc.lineAt(range.from);
      const draft = wordFromSelection(line.text, range.from - line.from, Math.min(range.to, line.to) - line.from);
      if (!draft.word) return;
      editor.contentDOM.blur();
      callbacks.current.onAddToInbox(draft);
    },
  };
  const actionsRef = useRef(actions);
  useLayoutEffect(() => {
    actionsRef.current = actions;
  });

  function reportUploads(change: Partial<UploadState>) {
    uploads.current = { ...uploads.current, ...change };
    callbacks.current.onUploads(uploads.current);
  }

  /**
   * Inserts a "Converting…" placeholder per file as its own paragraph at `pos`, uploads the files one
   * by one, and swaps each placeholder for the final markdown. The cursor stays where it was.
   */
  async function insertImages(editor: EditorView, files: File[], pos: number) {
    const items = files.map((file) => ({
      file,
      placeholder: `![Converting ${file.name.replace(/[[\]()]/g, "")}…](uploading-${Math.random().toString(36).slice(2, 10)})`,
    }));
    const line = editor.state.doc.lineAt(pos);
    const block = items.map((item) => item.placeholder).join("\n\n");
    editor.dispatch(
      line.length === 0
        ? { changes: { from: line.from, insert: block } }
        : { changes: { from: line.to, insert: `\n\n${block}` } },
    );
    reportUploads({ pending: uploads.current.pending + items.length, error: null });

    for (const item of items) {
      let markdown = "";
      try {
        markdown = (await callbacks.current.uploadImage(item.file)).markdown;
      } catch (err) {
        reportUploads({ error: `${item.file.name}: ${(err as Error).message}` });
      }
      const current = view.current;
      if (current) {
        const at = current.state.doc.toString().indexOf(item.placeholder);
        if (at >= 0) current.dispatch({ changes: { from: at, to: at + item.placeholder.length, insert: markdown } });
      }
      reportUploads({ pending: uploads.current.pending - 1 });
    }
  }

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          history(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(markdownStyle),
          noteSlug.of(slug),
          mdxInfo,
          editorFocus,
          livePreview,
          vocabCards,
          selectionTools,
          editorActions.of({
            furigana: (v) => actionsRef.current.furigana(v),
            editCard: (v, pos) => actionsRef.current.editCard(v, pos),
            newCard: (v) => actionsRef.current.newCard(v),
            addToInbox: (v) => actionsRef.current.addToInbox(v),
          }),
          placeholder("Start writing… · 書き始める"),
          langSlot.current.of(contentLang(lang)),
          EditorView.contentAttributes.of({ "aria-label": label }),
          keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
          EditorView.domEventHandlers({
            focus: () => {
              touched.current = true;
            },
            dragover: (event, v) => {
              if (![...(event.dataTransfer?.types ?? [])].includes("Files")) return false;
              event.preventDefault();
              v.dom.classList.add("is-dropping");
              return true;
            },
            dragleave: (_event, v) => {
              v.dom.classList.remove("is-dropping");
              return false;
            },
            drop: (event, v) => {
              v.dom.classList.remove("is-dropping");
              const files = imageFiles(event.dataTransfer);
              if (!files.length) return false;
              event.preventDefault();
              const pos = v.posAtCoords({ x: event.clientX, y: event.clientY }) ?? v.state.selection.main.head;
              void insertImages(v, files, pos);
              return true;
            },
            paste: (event, v) => {
              const files = imageFiles(event.clipboardData);
              if (!files.length) return false;
              event.preventDefault();
              void insertImages(v, files, v.state.selection.main.head);
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(fromOutside))) {
              callbacks.current.onChange(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // initialDoc, slug, lang and label are only needed on mount (the component is keyed by note);
    // lang updates go through the compartment below
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: langSlot.current.reconfigure(contentLang(lang)) });
  }, [lang]);

  useImperativeHandle(
    ref,
    () => ({
      replaceDoc(text) {
        const editor = view.current;
        if (!editor || editor.state.doc.toString() === text) return;
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: text },
          annotations: fromOutside.of(true),
        });
      },
      addImages(files) {
        const editor = view.current;
        if (!editor || !files.length) return;
        void insertImages(editor, files, touched.current ? editor.state.selection.main.head : editor.state.doc.length);
      },
      newCard() {
        const editor = view.current;
        if (!editor) return;
        const at = touched.current ? paragraphAt(editor.state, editor.state.selection.main.head).to : editor.state.doc.length;
        open(editor, { kind: "new-card", at, card: emptyVocabCard() });
      },
      focus() {
        view.current?.focus();
      },
    }),
    [],
  );

  return (
    <>
      <div ref={host} className="editor" />
      {dialogError && <p className="plate plate--error">{dialogError}</p>}

      {dialog?.kind === "furigana" && (
        <FuriganaDialog
          text={dialog.text}
          onApply={(text) => replace(dialog.from, dialog.to, dialog.text, text)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "card" && (
        <VocabCardDialog
          mode="edit"
          initial={dialog.card}
          onSave={(card) => replace(dialog.from, dialog.to, dialog.text, serializeVocabCard(card))}
          onRemove={() => removeCard(dialog.from, dialog.to, dialog.text)}
          onEditText={() => {
            const editor = view.current;
            if (!editor) return;
            editor.focus();
            editor.dispatch({ selection: { anchor: Math.min(dialog.from + "<VocabCard".length, dialog.to) }, scrollIntoView: true });
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "new-card" && (
        <VocabCardDialog
          mode="new"
          initial={dialog.card}
          onSave={(card) => view.current && insertCard(view.current, dialog.at, card)}
          onClose={closeDialog}
        />
      )}
    </>
  );
}
