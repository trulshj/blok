import { expect, it } from "vitest";
import { previewMarkdown, UPRIGHT_NUMBER } from "./vertical.ts";

it("previewMarkdown turns furigana into ruby and cards into boxes, and drops other components", () => {
  const body = [
    'import VocabCard from "../../components/VocabCard.astro";',
    "{提灯|ちょうちん}の光。`{本|ほん}`",
    '<VocabCard word="羊" definition="Sheep" />',
    "<ImdbViz client:visible />",
  ].join("\n\n");
  expect(previewMarkdown(body)).toBe(
    [
      "",
      "<ruby>提灯<rp>(</rp><rt>ちょうちん</rt><rp>)</rp></ruby>の光。`{本|ほん}`",
      '<figure class="vocab-card"><p class="vocab-card-word" lang="ja">羊</p><p class="vocab-card-def">Sheep</p></figure>',
      "",
    ].join("\n\n"),
  );
});

it("UPRIGHT_NUMBER finds one- and two-digit numbers only", () => {
  expect("10時に3人、2026年".match(UPRIGHT_NUMBER)).toEqual(["10", "3"]);
});
