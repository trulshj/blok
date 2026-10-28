import { describe, expect, it } from "vitest";
import { preview } from "./preview.ts";

describe("preview", () => {
  it("takes the first paragraph with text, skipping headings, images and MDX lines", () => {
    const body = [
      'import VocabCard from "../../components/VocabCard.astro";',
      "",
      "# Kyoto alley",
      "",
      "![first pass](./render-01.avif)",
      "",
      "Walked **Pontochō** on [Street View](https://maps.example) for an hour.",
      "Lanterns at `eye level`.",
      "",
      "Second paragraph.",
    ].join("\n");
    expect(preview(body)).toBe("Walked Pontochō on Street View for an hour. Lanterns at eye level.");
  });

  it("drops list markers and code blocks", () => {
    expect(preview("```js\nconst x = 1;\n```\n\n- one\n- two")).toBe("one two");
  });

  it("cuts long text at a word and adds an ellipsis", () => {
    const text = preview("word ".repeat(100), 30);
    expect(text).toBe("word word word word word word…");
  });

  it("cuts Japanese text without spaces too", () => {
    expect(preview("あ".repeat(50), 10)).toBe(`${"あ".repeat(10)}…`);
  });

  it("leaves furigana readings out", () => {
    expect(preview("洞窟の中に{松明|たいまつ}を{置|お}きました。")).toBe("洞窟の中に松明を置きました。");
  });

  it("is empty for an empty body", () => {
    expect(preview("")).toBe("");
    expect(preview("# Only a heading")).toBe("");
  });
});
