import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { exampleSegments, serializeVocabCard, type VocabCard } from "../../shared/vocabcard.ts";
import { editorActions, editorFocus, mdxInfo } from "./mdxState.ts";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

function ruby(base: string, reading: string) {
  const node = document.createElement("ruby");
  const rt = document.createElement("rt");
  rt.textContent = reading;
  node.append(base, rt);
  return node;
}

/** The example sentence with highlights and furigana. Consecutive highlighted segments share one <mark>. */
export function exampleNodes(example: string, word: string): Node[] {
  const nodes: Node[] = [];
  let mark: HTMLElement | null = null;
  for (const segment of exampleSegments(example, word)) {
    const content = "text" in segment ? [segment.text] : segment.ruby.map((p) => ruby(p.base, p.reading));
    if (segment.mark) {
      if (!mark) nodes.push((mark = document.createElement("mark")));
      mark.append(...content);
    } else {
      mark = null;
      nodes.push(...content.map((c) => (typeof c === "string" ? document.createTextNode(c) : c)));
    }
  }
  return nodes;
}

/** A <VocabCard /> drawn as a card. Clicking it opens the vocab card dialog. */
class VocabCardWidget extends WidgetType {
  card: VocabCard;
  key: string;

  constructor(card: VocabCard) {
    super();
    this.card = card;
    this.key = serializeVocabCard(card);
  }

  eq(other: VocabCardWidget) {
    return other.key === this.key;
  }

  get estimatedHeight() {
    return 180;
  }

  toDOM(view: EditorView) {
    const { word, reading, definition, example, translation, context } = this.card;
    const box = el("div", "vocab-card");
    box.lang = "ja";
    box.title = "Edit vocab card · 編集";
    box.append(el("div", "vocab-card-word", reading ? ruby(word, reading) : word || "—"));

    const body = el("div", "vocab-card-body");
    body.append(el("p", "vocab-card-def", definition));
    if (example) body.append(el("p", "vocab-card-example", ...exampleNodes(example, word)));
    if (translation) body.append(el("p", "vocab-card-translation", translation));
    if (context) body.append(el("p", "vocab-card-context", `(${context})`));
    body.querySelectorAll("p:not(.vocab-card-example)").forEach((p) => p.setAttribute("lang", "en"));
    box.append(body, el("span", "vocab-card-tag", "VocabCard"));

    box.addEventListener("mousedown", (e) => e.preventDefault()); // don't move the cursor into the card
    box.addEventListener("click", () => view.state.facet(editorActions)?.editCard(view, view.posAtDOM(box)));
    return box;
  }

  ignoreEvent() {
    return true;
  }
}

/** Lines that are only a card, as one block each. Cards sharing a line with text stay as text. */
function cardDecorations(state: EditorState): DecorationSet {
  const focused = state.field(editorFocus, false) ?? false;
  const blocks: Range<Decoration>[] = [];
  for (const { from, to, card } of state.field(mdxInfo).cards) {
    if (!card) continue; // a card blok can't read shows as text
    const first = state.doc.lineAt(from);
    const last = state.doc.lineAt(to);
    if (state.sliceDoc(first.from, from).trim() || state.sliceDoc(to, last.to).trim()) continue;
    // the cursor in or next to the card shows its text
    if (focused && state.selection.ranges.some((r) => r.to >= first.from && r.from <= last.to)) continue;
    blocks.push(Decoration.replace({ widget: new VocabCardWidget(card), block: true }).range(first.from, last.to));
  }
  return Decoration.set(blocks);
}

/** Vocab cards as cards (block decorations have to come from a state field, not a view plugin). */
export const vocabCards = StateField.define<DecorationSet>({
  create: cardDecorations,
  update: (decorations, tr) =>
    tr.docChanged || tr.selection || tr.effects.length ? cardDecorations(tr.state) : decorations,
  provide: (field) => EditorView.decorations.from(field),
});
