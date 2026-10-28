import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../shared/types.ts";
import { ankiExample, ankiTsv } from "./anki.ts";
import { cardToInput, entryToCard, filterVocab, wordFromSelection } from "./vocab.ts";

describe("wordFromSelection", () => {
  const line = "夜の先斗町を歩いた。{提灯|ちょうちん}の光が石畳に映って、とてもきれいだった。最高！";

  it("takes the sentence around the word as an example, with the word highlighted", () => {
    const from = line.indexOf("石畳");
    expect(wordFromSelection(line, from, from + 2)).toEqual({
      word: "石畳",
      reading: "",
      example: "{提灯|ちょうちん}の光が{石畳}に映って、とてもきれいだった。",
    });
  });

  it("reads the word and reading out of selected furigana", () => {
    const from = line.indexOf("{提灯");
    expect(wordFromSelection(line, from, from + "{提灯|ちょうちん}".length)).toMatchObject({
      word: "提灯",
      reading: "ちょうちん",
      example: "{提灯|ちょうちん}の光が石畳に映って、とてもきれいだった。",
    });
  });

  it("drops list markers and emphasis, and skips an example that's only the word", () => {
    expect(wordFromSelection("- **松明** を置く", 4, 6).example).toBe("{松明} を置く");
    expect(wordFromSelection("松明", 0, 2).example).toBe("");
  });
});

describe("entries and cards", () => {
  const entry: VocabEntry = {
    id: "20261028-101500-ab12",
    word: "松明",
    reading: "たいまつ",
    meaning: "torch",
    example: "洞窟に{松明}を置いた。",
    source: "Minecraft",
    added: "2026-10-28T09:15:00.000Z",
    used: [],
  };

  it("turns an entry into a card and back", () => {
    const card = entryToCard(entry);
    expect(card).toEqual({ word: "松明", reading: "たいまつ", definition: "torch", example: "洞窟に{松明}を置いた。", translation: "", context: "", extra: [] });
    expect(cardToInput(card, "Minecraft")).toEqual({ word: "松明", reading: "たいまつ", meaning: "torch", example: "洞窟に{松明}を置いた。", source: "Minecraft" });
  });

  it("filters by new, used and search words", () => {
    const used = { ...entry, id: "b", word: "洞窟", reading: "どうくつ", meaning: "cave", used: ["minecraft"] };
    expect(filterVocab([entry, used], "new", "").map((e) => e.word)).toEqual(["松明"]);
    expect(filterVocab([entry, used], "used", "").map((e) => e.word)).toEqual(["洞窟"]);
    expect(filterVocab([entry, used], "all", "minecraft torch").map((e) => e.word)).toEqual(["松明"]);
    expect(filterVocab([entry, used], "all", "どうくつ").map((e) => e.word)).toEqual(["洞窟"]);
  });
});

describe("Anki export", () => {
  it("writes furigana in Anki's notation and the word in bold", () => {
    expect(ankiExample("{洞窟|どうくつ}の中に{松明}を置きました。", "松明")).toBe("洞窟[どうくつ]の中に<b>松明</b>を置きました。");
    expect(ankiExample("言葉を{{覚|おぼ}えた}。{漢字|かん|じ}", "覚える")).toBe("言葉を<b> 覚[おぼ]えた</b>。 漢[かん] 字[じ]");
  });

  it("writes a tab-separated file with Anki's header lines", () => {
    const tsv = ankiTsv([
      { word: "松明", reading: "たいまつ", meaning: "Torch <fire>", example: "{松明}だ", translation: "It's a torch", context: "line one\nline\ttwo", source: "Minecraft" },
      { word: "羊", reading: "ひつじ", meaning: "sheep" },
    ]);
    expect(tsv.split("\n")).toEqual([
      "#separator:tab",
      "#html:true",
      "#columns:Word\tReading\tMeaning\tExample\tTranslation\tContext\tSource",
      "松明\tたいまつ\tTorch &lt;fire&gt;\t<b>松明</b>だ\tIt's a torch\tline one<br>line two\tMinecraft",
      "羊\tひつじ\tsheep\t\t\t\t",
      "",
    ]);
  });
});
