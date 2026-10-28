import { describe, expect, it } from "vitest";
import { scanMdx } from "./mdx.ts";
import {
  emptyVocabCard,
  exampleHtml,
  exampleSegments,
  exampleText,
  findVocabCards,
  parseVocabCard,
  serializeVocabCard,
  vocabCardHtml,
} from "./vocabcard.ts";

const POST_CARD = `<VocabCard
  word="松明"
  reading="たいまつ"
  definition="Torch; a burning stick used as a light source."
  example="洞窟の中に{松明}を置きました。"
  translation="I placed a torch inside the cave."
  context="Literally 'pine-bright' — 松 (pine) + 明 (bright)."
/>`;

describe("parseVocabCard and serializeVocabCard", () => {
  it("round-trips a card from the Minecraft post exactly", () => {
    const card = parseVocabCard(POST_CARD);
    expect(card).toMatchObject({ word: "松明", reading: "たいまつ", example: "洞窟の中に{松明}を置きました。" });
    expect(serializeVocabCard(card!)).toBe(POST_CARD);
  });

  it("reads single quotes, JS strings and entities", () => {
    const card = parseVocabCard(`<VocabCard word='牛' definition={"Cow \\"moo\\""} context={'it\\'s'} translation="a &amp; b" />`);
    expect(card).toMatchObject({ word: "牛", definition: 'Cow "moo"', context: "it's", translation: "a & b" });
  });

  it("picks quotes that fit the value", () => {
    const card = { ...emptyVocabCard(), word: "羊", definition: 'Say "baa"', context: `It's "wool"`, translation: "line\nbreak" };
    const text = serializeVocabCard(card);
    expect(text).toContain(`definition='Say "baa"'`);
    expect(text).toContain(`context={"It's \\"wool\\""}`);
    expect(text).toContain(`translation={"line\\nbreak"}`);
    expect(parseVocabCard(text)).toEqual(card);
  });

  it("keeps attributes it doesn't know, and refuses fields it can't edit", () => {
    const card = parseVocabCard('<VocabCard word="豚" definition="Pig" client:load data-x={1 + 2} />');
    expect(card?.extra).toEqual(["client:load", "data-x={1 + 2}"]);
    expect(serializeVocabCard(card!)).toBe('<VocabCard\n  word="豚"\n  definition="Pig"\n  client:load\n  data-x={1 + 2}\n/>');
    expect(parseVocabCard('<VocabCard word={someWord} definition="x" />')).toBeNull();
    expect(parseVocabCard("<VocabCard word=\"x\">")).toBeNull();
  });

  it("writes word and definition even when empty, and leaves out other empty fields", () => {
    expect(serializeVocabCard(emptyVocabCard())).toBe('<VocabCard\n  word=""\n  definition=""\n/>');
  });
});

describe("findVocabCards", () => {
  it("finds cards in a body", () => {
    const body = `Intro\n\n${POST_CARD}\n\n<Other />\n\n<VocabCard word={x} />`;
    const cards = findVocabCards(body, scanMdx(body));
    expect(cards).toHaveLength(2);
    expect(body.slice(cards[0]!.from, cards[0]!.to)).toBe(POST_CARD);
    expect(cards[1]!.card).toBeNull();
  });
});

describe("exampleSegments", () => {
  it("highlights {word} as before", () => {
    expect(exampleSegments("洞窟の中に{松明}を置きました。")).toEqual([
      { text: "洞窟の中に", mark: false },
      { text: "松明", mark: true },
      { text: "を置きました。", mark: false },
    ]);
  });

  it("shows furigana, highlighted when it's the card's word", () => {
    expect(exampleSegments("{洞窟|どうくつ}の{松明|たいまつ}", "松明")).toEqual([
      { ruby: [{ base: "洞窟", reading: "どうくつ" }], mark: false },
      { text: "の", mark: false },
      { ruby: [{ base: "松明", reading: "たいまつ" }], mark: true },
    ]);
  });

  it("highlights a word with furigana inside", () => {
    expect(exampleSegments("言葉を{{覚|おぼ}えた}。", "覚える")).toEqual([
      { text: "言葉を", mark: false },
      { ruby: [{ base: "覚", reading: "おぼ" }], mark: true },
      { text: "えた", mark: true },
      { text: "。", mark: false },
    ]);
  });

  it("leaves an unclosed brace as text", () => {
    expect(exampleSegments("a {b")).toEqual([{ text: "a {b", mark: false }]);
  });

  it("gives HTML with marks and ruby, escaped", () => {
    expect(exampleHtml("{洞窟|どうくつ}の<{松明}>", "松明")).toBe(
      "<ruby>洞窟<rp>(</rp><rt>どうくつ</rt><rp>)</rp></ruby>の&lt;<mark>松明</mark>&gt;",
    );
    expect(vocabCardHtml({ ...emptyVocabCard(), word: "羊", reading: "ひつじ", definition: "Sheep & co" })).toBe(
      '<figure class="vocab-card"><p class="vocab-card-word" lang="ja"><ruby>羊<rp>(</rp><rt>ひつじ</rt><rp>)</rp></ruby></p><p class="vocab-card-def">Sheep &amp; co</p></figure>',
    );
  });

  it("gives plain text", () => {
    expect(exampleText("{洞窟|どうくつ}の{松明}と{{覚|おぼ}えた}")).toBe("洞窟の松明と覚えた");
  });
});
