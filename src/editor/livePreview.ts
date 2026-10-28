import { HighlightStyle, syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * Live styling for markdown: headings, emphasis, code and links are styled by the highlighter below,
 * and their markup (##, **, `, [..](..)) is hidden on every line except the one being edited.
 * The edited line always shows its raw text, so typing, including with a Japanese IME, is never disturbed.
 */

export const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, class: "md-h1" },
  { tag: tags.heading2, class: "md-h2" },
  { tag: tags.heading3, class: "md-h3" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], class: "md-h4" },
  { tag: tags.strong, class: "md-strong" },
  { tag: tags.emphasis, class: "md-em" },
  { tag: tags.strikethrough, class: "md-strike" },
  { tag: tags.link, class: "md-link" },
  { tag: tags.url, class: "md-url" },
  { tag: tags.monospace, class: "md-code" },
  { tag: tags.quote, class: "md-quote" },
  { tag: tags.processingInstruction, class: "md-mark" }, // markup that stays visible: list bullets, > and the edited line's marks
  { tag: tags.contentSeparator, class: "md-hr" },
]);

/** Markup hidden away from the edited line. HeaderMark is handled separately to take its space with it. */
const HIDDEN_MARKS = new Set(["EmphasisMark", "CodeMark", "StrikethroughMark"]);

const LINE_CLASS: Record<string, string> = {
  ATXHeading1: "md-hline md-hline-1",
  ATXHeading2: "md-hline md-hline-2",
  ATXHeading3: "md-hline md-hline-3",
  Blockquote: "md-quote-line",
  FencedCode: "md-code-line",
  CodeBlock: "md-code-line",
};

const hide = Decoration.replace({});
const lineDecorations = new Map<string, Decoration>();
const lineDecoration = (cls: string) => {
  let deco = lineDecorations.get(cls);
  if (!deco) lineDecorations.set(cls, (deco = Decoration.line({ class: cls })));
  return deco;
};

/** Line numbers that hold a cursor or selection. Empty when the editor isn't focused, so everything reads clean. */
function editedLines(state: EditorState, focused: boolean): Set<number> {
  const lines = new Set<number>();
  if (!focused) return lines;
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number;
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++) lines.add(n);
  }
  return lines;
}

/** The decorations for `ranges` of the document (exported for tests). */
export function liveDecorations(
  state: EditorState,
  { focused = true, ranges = [{ from: 0, to: state.doc.length }] }: { focused?: boolean; ranges?: readonly { from: number; to: number }[] } = {},
): DecorationSet {
  const edited = editedLines(state, focused);
  const isEdited = (pos: number) => edited.has(state.doc.lineAt(pos).number);
  const decorations: Range<Decoration>[] = [];
  const seenLines = new Set<string>();

  for (const { from, to } of ranges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const lineClass = LINE_CLASS[node.name];
        if (lineClass) {
          for (let pos = node.from; pos <= node.to; ) {
            const line = state.doc.lineAt(pos);
            const key = `${lineClass}@${line.from}`;
            if (!seenLines.has(key)) {
              seenLines.add(key);
              decorations.push(lineDecoration(lineClass).range(line.from));
            }
            pos = line.to + 1;
          }
        }

        if (node.name === "Image") return false; // shown as written until image previews arrive

        if (node.name === "HeaderMark" && !isEdited(node.from)) {
          // "## Title": hide the hashes and the space after them
          const end = state.doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
          if (end > node.from) decorations.push(hide.range(node.from, end));
        } else if (HIDDEN_MARKS.has(node.name) && !isEdited(node.from)) {
          decorations.push(hide.range(node.from, node.to));
        } else if (node.name === "Link" && !isEdited(node.from)) {
          // [text](url): keep the text, hide "[" and "](url)"
          const marks = node.node.getChildren("LinkMark");
          const open = marks[0];
          const close = marks[1];
          if (open && close && state.doc.sliceString(open.from, open.to) === "[") {
            decorations.push(hide.range(open.from, open.to));
            if (node.to > close.from) decorations.push(hide.range(close.from, node.to));
          }
        }
        return undefined;
      },
    });
  }

  return Decoration.set(decorations, true);
}

/** The editor extension that keeps the live decorations up to date. */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = liveDecorations(view.state, { focused: view.hasFocus, ranges: view.visibleRanges });
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.focusChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = liveDecorations(update.state, { focused: update.view.hasFocus, ranges: update.view.visibleRanges });
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
