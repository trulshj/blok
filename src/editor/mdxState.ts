import { Facet, StateEffect, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { findFurigana, type FuriganaMatch } from "../../shared/furigana.ts";
import { scanMdx, type Region } from "../../shared/mdx.ts";
import { findVocabCards, type VocabCardBlock } from "../../shared/vocabcard.ts";

export type MdxInfo = { regions: Region[]; furigana: FuriganaMatch[]; cards: VocabCardBlock[] };

export function readMdx(text: string): MdxInfo {
  const regions = scanMdx(text);
  return { regions, furigana: findFurigana(text, regions), cards: findVocabCards(text, regions) };
}

/** Code, tags, furigana and vocab cards in the text, rescanned on every change (a note scans in well under a millisecond). */
export const mdxInfo = StateField.define<MdxInfo>({
  create: (state) => readMdx(state.doc.toString()),
  update: (info, tr) => (tr.docChanged ? readMdx(tr.state.doc.toString()) : info),
});

const setFocus = StateEffect.define<boolean>();

/** Whether the editor has focus, kept in the state so fields can show raw text only while you're editing. */
export const editorFocus = StateField.define<boolean>({
  create: () => false,
  update: (focused, tr) => tr.effects.reduce((value, e) => (e.is(setFocus) ? e.value : value), focused),
  provide: () => EditorView.focusChangeEffect.of((_state, focusing) => setFocus.of(focusing)),
});

/** What the editor asks the React side to do: open dialogs. */
export type EditorActions = {
  /** Furigana for the selection, or the paragraph at the cursor. */
  furigana(view: EditorView): void;
  /** Edit the vocab card that starts at `pos`. */
  editCard(view: EditorView, pos: number): void;
  /** A new vocab card after the selection's paragraph, with the selected word filled in. */
  newCard(view: EditorView): void;
  /** Add the selected word to the vocab inbox. */
  addToInbox(view: EditorView): void;
};

export const editorActions = Facet.define<EditorActions, EditorActions | null>({ combine: (values) => values[0] ?? null });
