import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, placeholder } from "@codemirror/view";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import type { NoteLang, UploadedImage } from "../../shared/types.ts";
import { imageFiles } from "../lib/images.ts";
import { livePreview, markdownStyle, noteSlug } from "./livePreview.ts";

export type EditorHandle = {
  /** Replace the whole text, e.g. with a version changed on disk. Doesn't count as an edit. */
  replaceDoc(text: string): void;
  /** Upload images and insert them at the cursor (or the end, if the text hasn't been touched). */
  addImages(files: File[]): void;
  focus(): void;
};

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
  ref?: Ref<EditorHandle>;
};

const fromOutside = Annotation.define<boolean>();
const contentLang = (lang: NoteLang) => EditorView.contentAttributes.of({ lang, spellcheck: "true" });

/** CodeMirror markdown editor with live styling (see livePreview.ts) and image drop/paste. */
export function Editor({ initialDoc, slug, lang, label, onChange, uploadImage, onUploads, ref }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langSlot = useRef(new Compartment());
  const callbacks = useRef({ onChange, uploadImage, onUploads });
  const uploads = useRef<UploadState>({ pending: 0, error: null });
  const touched = useRef(false);

  useLayoutEffect(() => {
    callbacks.current = { onChange, uploadImage, onUploads };
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
          livePreview,
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
      focus() {
        view.current?.focus();
      },
    }),
    [],
  );

  return <div ref={host} className="editor" />;
}
