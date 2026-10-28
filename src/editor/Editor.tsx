import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, placeholder } from "@codemirror/view";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import type { NoteLang } from "../../shared/types.ts";
import { livePreview, markdownStyle } from "./livePreview.ts";

export type EditorHandle = {
  /** Replace the whole text, e.g. with a version changed on disk. Doesn't count as an edit. */
  replaceDoc(text: string): void;
  focus(): void;
};

type Props = {
  /** Only read on mount; key the component by note to load another one. */
  initialDoc: string;
  /** Sets the lang attribute, for spellchecking and Japanese glyphs. */
  lang: NoteLang;
  label: string;
  onChange: (doc: string) => void;
  ref?: Ref<EditorHandle>;
};

const fromOutside = Annotation.define<boolean>();
const contentLang = (lang: NoteLang) => EditorView.contentAttributes.of({ lang, spellcheck: "true" });

/** CodeMirror markdown editor with live styling (see livePreview.ts). */
export function Editor({ initialDoc, lang, label, onChange, ref }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langSlot = useRef(new Compartment());
  const onChangeRef = useRef(onChange);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

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
          livePreview,
          placeholder("Start writing… · 書き始める"),
          langSlot.current.of(contentLang(lang)),
          EditorView.contentAttributes.of({ "aria-label": label }),
          keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(fromOutside))) {
              onChangeRef.current(update.state.doc.toString());
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
    // initialDoc, lang and label are only needed on mount; lang updates go through the compartment below
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
      focus() {
        view.current?.focus();
      },
    }),
    [],
  );

  return <div ref={host} className="editor" />;
}
