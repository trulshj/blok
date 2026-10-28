import { HighlightStyle, syntaxTree } from "@codemirror/language";
import { Facet, type EditorState, type Range } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { SyntaxNode } from "@lezer/common";
import type { RubyPart } from "../../shared/furigana.ts";
import { imageUrl } from "../lib/images.ts";
import { mdxInfo, readMdx } from "./mdxState.ts";

/** The slug of the note being edited, so image previews can find files in its folder. */
export const noteSlug = Facet.define<string, string>({ combine: (values) => values[0] ?? "" });

/** Markdown images like ![alt](./render-01.avif) shown as the image itself, with a caption. */
export class ImageWidget extends WidgetType {
  src: string;
  alt: string;
  slug: string;

  constructor(src: string, alt: string, slug: string) {
    super();
    this.src = src;
    this.alt = alt;
    this.slug = slug;
  }

  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt && other.slug === this.slug;
  }

  get estimatedHeight() {
    return 320;
  }

  toDOM(view: EditorView) {
    const figure = document.createElement("span");
    figure.className = "md-image";
    const caption = document.createElement("span");
    caption.className = "md-image-caption";
    const name = this.src.split("/").pop() ?? this.src;

    // placeholder while an upload converts: ![Converting render-01.png…](uploading-<id>)
    if (this.src.startsWith("uploading-")) {
      figure.classList.add("md-image--pending");
      caption.textContent = this.alt;
      figure.append(caption);
      return figure;
    }

    const url = imageUrl(this.slug, this.src);
    if (!url) {
      figure.classList.add("md-image--missing");
      caption.textContent = `${this.src} can't be shown in blok`;
      figure.append(caption);
      return figure;
    }

    const img = document.createElement("img");
    img.alt = this.alt;
    img.decoding = "async";
    img.onload = () => {
      caption.textContent = `${name} · ${img.naturalWidth} × ${img.naturalHeight}`;
      view.requestMeasure();
    };
    img.onerror = () => {
      figure.classList.add("md-image--missing");
      caption.textContent = `Image not found: ${this.src}`;
      view.requestMeasure();
    };
    img.src = url;
    caption.textContent = name;
    figure.append(img, caption);
    return figure;
  }

  // let clicks through, so clicking an image puts the cursor there and shows its markdown
  ignoreEvent() {
    return false;
  }
}

/** Furigana like {漢字|かんじ} shown as ruby. */
export class RubyWidget extends WidgetType {
  parts: RubyPart[];
  /** The styling around it (md-h2, md-strong…), which CodeMirror doesn't wrap around widgets. */
  styles: string;

  constructor(parts: RubyPart[], styles = "") {
    super();
    this.parts = parts;
    this.styles = styles;
  }

  eq(other: RubyWidget) {
    return (
      other.styles === this.styles &&
      other.parts.length === this.parts.length &&
      other.parts.every((p, i) => p.base === this.parts[i]!.base && p.reading === this.parts[i]!.reading)
    );
  }

  toDOM() {
    const ruby = document.createElement("ruby");
    ruby.className = `md-ruby ${this.styles}`.trim();
    for (const part of this.parts) {
      const rt = document.createElement("rt");
      rt.textContent = part.reading;
      ruby.append(part.base, rt);
    }
    return ruby;
  }

  // clicking puts the cursor there, which shows the {…|…} markup to edit
  ignoreEvent() {
    return false;
  }
}

/** The alt text and URL of an Image node: ![alt](url). */
function readImage(state: EditorState, node: SyntaxNode): { alt: string; src: string } | null {
  const marks = node.getChildren("LinkMark");
  const url = node.getChild("URL");
  const open = marks[0];
  const close = marks[1];
  if (!open || !close || !url) return null;
  return { alt: state.doc.sliceString(open.to, close.from), src: state.doc.sliceString(url.from, url.to) };
}

/**
 * Live styling for markdown: headings, emphasis, code and links are styled by the highlighter below,
 * their markup (##, **, `, [..](..)) is hidden, images show as pictures and furigana as ruby, on
 * every line except the one being edited. The edited line always shows its raw text, so typing, including with a Japanese
 * IME, is never disturbed.
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

/** Styles from markdown around a position, for widgets: a heading, bold, a link. */
const SURROUNDING_CLASS: Record<string, string> = {
  ATXHeading1: "md-h1",
  ATXHeading2: "md-h2",
  ATXHeading3: "md-h3",
  ATXHeading4: "md-h4",
  ATXHeading5: "md-h4",
  ATXHeading6: "md-h4",
  SetextHeading1: "md-h1",
  SetextHeading2: "md-h2",
  StrongEmphasis: "md-strong",
  Emphasis: "md-em",
  Strikethrough: "md-strike",
  Link: "md-link",
  Blockquote: "md-quote",
};

function surroundingStyles(state: EditorState, pos: number): string {
  const classes: string[] = [];
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    const cls = SURROUNDING_CLASS[node.name];
    if (cls) classes.push(cls);
  }
  return classes.join(" ");
}

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
  const images: { from: number; to: number }[] = [];

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

        if (node.name === "Image") {
          images.push({ from: node.from, to: node.to });
          const image = !isEdited(node.from) && readImage(state, node.node);
          if (image) {
            const widget = new ImageWidget(image.src, image.alt, state.facet(noteSlug));
            decorations.push(Decoration.replace({ widget }).range(node.from, node.to));
          }
          return false;
        }

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

  // furigana outside code and tags (mdxInfo leaves those out); never inside an image's alt text
  const { furigana } = state.field(mdxInfo, false) ?? readMdx(state.doc.toString());
  for (const match of furigana) {
    if (!ranges.some((r) => match.from >= r.from && match.to <= r.to)) continue;
    if (isEdited(match.from) || images.some((img) => match.from < img.to && match.to > img.from)) continue;
    const widget = new RubyWidget(match.parts, surroundingStyles(state, match.from));
    decorations.push(Decoration.replace({ widget }).range(match.from, match.to));
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
