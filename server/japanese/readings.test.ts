import { describe, expect, it } from "vitest";
import { annotate } from "../../shared/furigana.ts";
import { readings } from "./readings.ts";

describe("readings", () => {
  it("suggests hiragana readings for words with kanji, and covers the whole text", async () => {
    const text = "洞窟の中に松明を置きました。";
    const tokens = await readings(text);
    expect(tokens.map((t) => t.surface).join("")).toBe(text);
    expect(tokens.filter((t) => t.reading)).toEqual([
      { surface: "洞窟", reading: "どうくつ" },
      { surface: "中", reading: "なか" },
      { surface: "松明", reading: "たいまつ" },
      { surface: "置き", reading: "おき" },
    ]);
  });

  it("gives furigana with okurigana outside", async () => {
    const tokens = await readings("言葉を覚えた。取り扱い注意");
    expect(tokens.map((t) => (t.reading ? annotate(t.surface, t.reading) : t.surface)).join("")).toBe(
      "{言葉|ことば}を{覚|おぼ}えた。{取|と}り{扱|あつか}い{注意|ちゅうい}",
    );
  });

  it("keeps kana, Latin text, spaces and line breaks without readings", async () => {
    const text = "ダイヤモンド ABC\nです";
    const tokens = await readings(text);
    expect(tokens.map((t) => t.surface).join("")).toBe(text);
    expect(tokens.every((t) => t.reading === null)).toBe(true);
  });
});
