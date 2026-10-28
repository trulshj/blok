import { describe, expect, it } from "vitest";
import {
  annotate,
  findFurigana,
  furiganaReadings,
  furiganaToHtml,
  rubyHtml,
  splitOkurigana,
  stripFurigana,
  toHiragana,
} from "./furigana.ts";
import { scanMdx } from "./mdx.ts";

describe("findFurigana", () => {
  it("reads whole-word and per-character readings", () => {
    const found = findFurigana("{松明|たいまつ}を{漢字|かん|じ}で");
    expect(found.map((f) => [f.base, f.parts])).toEqual([
      ["松明", [{ base: "松明", reading: "たいまつ" }]],
      [
        "漢字",
        [
          { base: "漢", reading: "かん" },
          { base: "字", reading: "じ" },
        ],
      ],
    ]);
    expect(found[0]).toMatchObject({ from: 0, to: 9 });
  });

  it("joins per-character readings when the count doesn't match the characters", () => {
    expect(findFurigana("{今日|き|ょ|う}")[0]?.parts).toEqual([{ base: "今日", reading: "きょう" }]);
  });

  it("handles kanji outside the basic plane", () => {
    expect(findFurigana("{𠮟る|しか|る}")[0]?.parts).toEqual([
      { base: "𠮟", reading: "しか" },
      { base: "る", reading: "る" },
    ]);
  });

  it("never matches JavaScript or plain ASCII", () => {
    expect(findFurigana("{a || b} {a||b} {x|y} {漢字|} {漢字} {漢 字|かんじ} {漢字||かんじ}")).toEqual([]);
  });

  it("skips escaped braces and code", () => {
    const text = "\\{漢字|かんじ} `{漢字|かんじ}` \\\\{本|ほん}";
    expect(findFurigana(text, scanMdx(text)).map((f) => f.base)).toEqual(["本"]);
  });

  it("skips furigana inside component attributes", () => {
    const text = '<VocabCard example="{松明|たいまつ}" /> {洞窟|どうくつ}';
    expect(findFurigana(text, scanMdx(text)).map((f) => f.base)).toEqual(["洞窟"]);
  });
});

describe("conversions", () => {
  it("strips readings and lists them", () => {
    const text = "洞窟の中に{松明|たいまつ}を{置|お}きました。";
    expect(stripFurigana(text)).toBe("洞窟の中に松明を置きました。");
    expect(furiganaReadings(text)).toEqual(["たいまつ", "お"]);
  });

  it("writes ruby HTML with fallback parentheses, escaped", () => {
    expect(rubyHtml([{ base: "漢", reading: "かん" }, { base: "字", reading: "じ" }])).toBe(
      "<ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp>字<rp>(</rp><rt>じ</rt><rp>)</rp></ruby>",
    );
    expect(furiganaToHtml("{本|ほん}&")).toBe("<ruby>本<rp>(</rp><rt>ほん</rt><rp>)</rp></ruby>&");
    expect(rubyHtml([{ base: "<b>", reading: '"&' }])).toBe("<ruby>&lt;b&gt;<rp>(</rp><rt>&quot;&amp;</rt><rp>)</rp></ruby>");
  });
});

describe("okurigana", () => {
  it("keeps kana outside the ruby", () => {
    expect(splitOkurigana("取り扱い", "とりあつかい")).toEqual([
      { text: "取", reading: "と" },
      { text: "り" },
      { text: "扱", reading: "あつか" },
      { text: "い" },
    ]);
    expect(annotate("覚えた", "おぼえた")).toBe("{覚|おぼ}えた");
    expect(annotate("聞き取り", "ききとり")).toBe("{聞|き}き{取|と}り");
    expect(annotate("洞窟の中", "どうくつのなか")).toBe("{洞窟|どうくつ}の{中|なか}");
  });

  it("matches katakana readings and kana", () => {
    expect(toHiragana("タイマツ・ヴ")).toBe("たいまつ・ゔ");
    expect(annotate("松明", "タイマツ")).toBe("{松明|タイマツ}");
    expect(splitOkurigana("見るテレビ", "みるてれび")).toEqual([{ text: "見", reading: "み" }, { text: "るテレビ" }]);
  });

  it("uses the whole reading when it doesn't fit the kana", () => {
    expect(splitOkurigana("覚えた", "かくご")).toBeNull();
    expect(annotate("覚えた", "かくご")).toBe("{覚えた|かくご}");
  });

  it("keeps per-character readings as written, and leaves kana-only words", () => {
    expect(annotate("漢字", "かん|じ")).toBe("{漢字|かん|じ}");
    expect(annotate("ダイヤ", "だいや")).toBe("ダイヤ");
    expect(annotate("時々", "ときどき")).toBe("{時々|ときどき}");
  });
});
