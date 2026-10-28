import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { ImageWidget, liveDecorations, noteSlug, RubyWidget } from "./livePreview.ts";
import { mdxInfo } from "./mdxState.ts";

/** The text hidden by the live preview, and the line classes, for `doc` with the cursor at `cursor`. */
function render(doc: string, { cursor = doc.length, focused = true } = {}) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: markdown({ base: markdownLanguage }),
  });
  const hidden: string[] = [];
  const lines: string[] = [];
  liveDecorations(state, { focused }).between(0, doc.length, (from, to, deco) => {
    if (to > from) hidden.push(doc.slice(from, to));
    else lines.push(`${state.doc.lineAt(from).number}:${deco.spec.class}`);
  });
  return { hidden, lines };
}

// the cursor sits on the last line ("end") unless a test moves it
const withEnd = (text: string) => `${text}\nend`;

describe("liveDecorations", () => {
  it("hides heading hashes and the space after them", () => {
    expect(render(withEnd("## Reference hunt")).hidden).toEqual(["## "]);
  });

  it("hides emphasis, strikethrough and code marks", () => {
    expect(render(withEnd("**bold**, *it*, ~~gone~~ and `code`")).hidden).toEqual([
      "**",
      "**",
      "*",
      "*",
      "~~",
      "~~",
      "`",
      "`",
    ]);
  });

  it("keeps link text and hides the brackets and URL", () => {
    expect(render(withEnd("See [Street View](https://maps.example/kyoto) now")).hidden).toEqual([
      "[",
      "](https://maps.example/kyoto)",
    ]);
  });

  it("shows everything on the line being edited", () => {
    const doc = "## Next\n**Roof overhangs** are too short";
    expect(render(doc, { cursor: 2 }).hidden).toEqual(["**", "**"]); // cursor in the heading
    expect(render(doc).hidden).toEqual(["## "]); // cursor in the paragraph
  });

  it("hides markup on every line when the editor isn't focused", () => {
    expect(render("## Next\n**Roof**", { focused: false }).hidden).toEqual(["## ", "**", "**"]);
  });

  it("shows images as pictures off the edited line, and as markdown on it", () => {
    const doc = "![first pass](./render-01.avif)";
    const state = EditorState.create({
      doc: withEnd(doc),
      selection: EditorSelection.cursor(doc.length + 2),
      extensions: [markdown({ base: markdownLanguage }), noteSlug.of("kyoto-alley")],
    });
    const widgets: ImageWidget[] = [];
    liveDecorations(state).between(0, doc.length, (_from, _to, deco) => {
      if (deco.spec.widget instanceof ImageWidget) widgets.push(deco.spec.widget);
    });
    expect(widgets).toMatchObject([{ src: "./render-01.avif", alt: "first pass", slug: "kyoto-alley" }]);

    expect(render(doc).hidden).toEqual([]); // cursor on the image line: raw markdown
  });

  it("shows furigana as ruby off the edited line, and as markup on it", () => {
    const doc = "洞窟の中に{松明|たいまつ}を置いた";
    const state = EditorState.create({
      doc: withEnd(doc),
      selection: EditorSelection.cursor(doc.length + 2),
      extensions: [markdown({ base: markdownLanguage }), mdxInfo],
    });
    const widgets: RubyWidget[] = [];
    liveDecorations(state).between(0, doc.length, (from, to, deco) => {
      if (deco.spec.widget instanceof RubyWidget) widgets.push(deco.spec.widget);
      expect(doc.slice(from, to)).toBe("{松明|たいまつ}");
    });
    expect(widgets).toMatchObject([{ parts: [{ base: "松明", reading: "たいまつ" }] }]);

    expect(render(doc).hidden).toEqual([]); // cursor on the line: raw markup
  });

  it("gives ruby the styling around it", () => {
    const doc = "## 先斗町の{路地|ろじ}\n**{提灯|ちょうちん}**";
    const state = EditorState.create({
      doc: withEnd(doc),
      selection: EditorSelection.cursor(doc.length + 2),
      extensions: [markdown({ base: markdownLanguage }), mdxInfo],
    });
    const styles: string[] = [];
    liveDecorations(state).between(0, doc.length, (_from, _to, deco) => {
      if (deco.spec.widget instanceof RubyWidget) styles.push(deco.spec.widget.styles);
    });
    expect(styles).toEqual(["md-h2", "md-strong"]);
  });

  it("leaves furigana in code, components and image alt text as written", () => {
    const doc = '`{本|ほん}` ![{絵|え}](./a.avif) <VocabCard example="{牛|うし}" /> {本|ほん}';
    // the image is one widget (alt text included), only the last {本|ほん} becomes ruby
    expect(render(withEnd(doc)).hidden).toEqual(["`", "`", "![{絵|え}](./a.avif)", "{本|ほん}"]);
  });

  it("doesn't touch Japanese text or list markers", () => {
    expect(render(withEnd("- 提灯 chōchin\n- 暖簾 noren")).hidden).toEqual([]);
  });

  it("adds line classes for headings, quotes and code blocks", () => {
    const { lines } = render("# Title\n> quoted\n```\ncode\n```\nend");
    expect(lines).toEqual([
      "1:md-hline md-hline-1",
      "2:md-quote-line",
      "3:md-code-line",
      "4:md-code-line",
      "5:md-code-line",
    ]);
  });
});
