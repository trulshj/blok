import { describe, expect, it } from "vitest";
import type { ReadingToken } from "../../shared/types.ts";
import { applyReadings, furiganaChunks, proseTexts, readingRows } from "./furigana.ts";

const t = (surface: string, reading: string | null = null): ReadingToken => ({ surface, reading });

describe("furiganaChunks", () => {
  it("separates prose from furigana, code, tags and other braces", () => {
    expect(furiganaChunks('洞窟の{松明|たいまつ}を `置く` <X a="{b}" />と{松明}')).toEqual([
      { kind: "prose", text: "洞窟の" },
      { kind: "furigana", base: "松明", reading: "たいまつ" },
      { kind: "prose", text: "を " },
      { kind: "keep", text: "`置く`" },
      { kind: "prose", text: " " },
      { kind: "keep", text: '<X a="{b}" />' },
      { kind: "prose", text: "と" },
      { kind: "keep", text: "{松明}" },
    ]);
  });

  it("keeps per-character readings as written", () => {
    expect(furiganaChunks("{漢字|かん|じ}")).toEqual([{ kind: "furigana", base: "漢字", reading: "かん|じ" }]);
  });

  it("leaves an unclosed brace in the prose", () => {
    expect(furiganaChunks("a { b")).toEqual([{ kind: "prose", text: "a { b" }]);
  });
});

describe("readingRows and applyReadings", () => {
  const chunks = furiganaChunks("洞窟の中に{松明|たいまつ}を置いた。洞窟は暗い。");
  const tokens = [
    [t("洞窟", "どうくつ"), t("の"), t("中", "なか"), t("に")],
    [t("を"), t("置い", "おい"), t("た"), t("。"), t("洞窟", "どうくつ"), t("は"), t("暗い", "くらい"), t("。")],
  ];

  it("sends only the prose", () => {
    expect(proseTexts(chunks)).toEqual(["洞窟の中に", "を置いた。洞窟は暗い。"]);
  });

  it("lists each word with kanji once, existing furigana included", () => {
    expect(readingRows(chunks, tokens).map((r) => `${r.word}:${r.reading}`)).toEqual([
      "洞窟:どうくつ",
      "中:なか",
      "松明:たいまつ",
      "置い:おい",
      "暗い:くらい",
    ]);
  });

  it("adds furigana with okurigana outside", () => {
    expect(applyReadings(chunks, tokens, readingRows(chunks, tokens))).toBe(
      "{洞窟|どうくつ}の{中|なか}に{松明|たいまつ}を{置|お}いた。{洞窟|どうくつ}は{暗|くら}い。",
    );
  });

  it("skips unticked words, removes their furigana, and can do first appearances only", () => {
    const rows = readingRows(chunks, tokens).map((r) => ({ ...r, include: r.word !== "中" && r.word !== "松明" }));
    expect(applyReadings(chunks, tokens, rows, { firstOnly: true })).toBe(
      "{洞窟|どうくつ}の中に松明を{置|お}いた。洞窟は{暗|くら}い。",
    );
  });

  it("uses edited readings", () => {
    const rows = readingRows(chunks, tokens).map((r) => (r.word === "松明" ? { ...r, reading: "しょう|めい" } : r));
    expect(applyReadings(chunks, tokens, rows)).toContain("{松明|しょう|めい}");
  });
});
