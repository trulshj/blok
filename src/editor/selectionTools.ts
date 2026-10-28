import { EditorSelection, StateField, type EditorState } from "@codemirror/state";
import { EditorView, keymap, showTooltip, type Tooltip } from "@codemirror/view";
import { hasKanji } from "../../shared/furigana.ts";
import { modShortcut } from "../lib/platform.ts";
import { editorActions, editorFocus, type EditorActions } from "./mdxState.ts";

/** The paragraph around `pos`: the lines between blank lines. */
export function paragraphAt(state: EditorState, pos: number): { from: number; to: number } {
  let first = state.doc.lineAt(pos);
  let last = first;
  if (!first.text.trim()) return { from: first.from, to: first.to };
  while (first.number > 1) {
    const prev = state.doc.line(first.number - 1);
    if (!prev.text.trim()) break;
    first = prev;
  }
  while (last.number < state.doc.lines) {
    const next = state.doc.line(last.number + 1);
    if (!next.text.trim()) break;
    last = next;
  }
  return { from: first.from, to: last.to };
}

const run = (action: Exclude<keyof EditorActions, "editCard">) => (view: EditorView) => {
  const actions = view.state.facet(editorActions);
  if (!actions) return false;
  actions[action](view);
  return true;
};

function button(label: string, ja: string, title: string, onClick: () => void) {
  const node = document.createElement("button");
  node.type = "button";
  node.title = title;
  node.append(label);
  if (ja) {
    const small = document.createElement("span");
    small.lang = "ja";
    small.textContent = ja;
    node.append(small);
  }
  node.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection and focus
  node.addEventListener("click", onClick);
  return node;
}

/** Small buttons above a selection with kanji: furigana, a vocab card, the inbox. */
function selectionTooltip(state: EditorState): Tooltip | null {
  const range = state.selection.main;
  if (!state.field(editorFocus, false) || range.empty || range.to - range.from > 2000) return null;
  if (!hasKanji(state.sliceDoc(range.from, range.to))) return null;
  return {
    pos: range.from,
    above: true,
    arrow: false,
    create: (view) => {
      const dom = document.createElement("div");
      dom.className = "sel-tools";
      dom.append(
        button("ふりがな", "", `Add furigana (${modShortcut("Shift+F")})`, () => run("furigana")(view)),
        button("+ Card", "カード", "Add a vocab card for this word", () => run("newCard")(view)),
        button("+ Inbox", "単語帳", "Save this word to the vocab inbox", () => run("addToInbox")(view)),
      );
      return { dom };
    },
  };
}

const tooltipField = StateField.define<Tooltip | null>({
  create: selectionTooltip,
  update: (tooltip, tr) => (tr.docChanged || tr.selection || tr.effects.length ? selectionTooltip(tr.state) : tooltip),
  provide: (field) => showTooltip.from(field),
});

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]/u;
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("ja", { granularity: "word" }) : null;

/** The word around `offset` in Japanese text, by the browser's dictionary: 石畳 in 光が石畳に映って. */
export function japaneseWordAt(text: string, offset: number): { from: number; to: number } | null {
  if (!segmenter || !JAPANESE.test(text[offset] ?? "")) return null;
  for (const { index, segment } of segmenter.segment(text)) {
    if (offset >= index && offset < index + segment.length) return { from: index, to: index + segment.length };
  }
  return null;
}

/**
 * Double-clicking Japanese selects one word. CodeMirror would select the whole run of kanji and kana,
 * since there are no spaces.
 */
const japaneseDoubleClick = EditorView.mouseSelectionStyle.of((view, event) => {
  if (event.detail !== 2 || event.button !== 0 || event.shiftKey) return null;
  const pos = view.posAtCoords(event);
  if (pos === null) return null;
  const line = view.state.doc.lineAt(pos);
  const word = japaneseWordAt(line.text, pos - line.from);
  if (!word) return null;
  const selection = EditorSelection.create([EditorSelection.range(line.from + word.from, line.from + word.to)]);
  return { get: () => selection, update: () => false };
});

/** The selection buttons, Mod-Shift-F for furigana, and double-click on Japanese words. */
export const selectionTools = [
  tooltipField,
  japaneseDoubleClick,
  keymap.of([{ key: "Mod-Shift-f", run: run("furigana"), preventDefault: true }]),
];
