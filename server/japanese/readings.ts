import kuromoji from "kuromoji";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { hasKanji, toHiragana } from "../../shared/furigana.ts";
import type { ReadingToken } from "../../shared/types.ts";

type Tokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;

let tokenizer: Promise<Tokenizer> | null = null;

/** kuromoji with its dictionary (IPADIC, in node_modules), loaded on first use and then kept. */
function load(): Promise<Tokenizer> {
  if (!tokenizer) {
    const dicPath = join(dirname(createRequire(import.meta.url).resolve("kuromoji/package.json")), "dict");
    tokenizer = new Promise<Tokenizer>((resolve, reject) => {
      kuromoji.builder({ dicPath }).build((err, built) => (err ? reject(err) : resolve(built)));
    });
    tokenizer.catch(() => {
      tokenizer = null; // try again next time
    });
  }
  return tokenizer;
}

/**
 * The text split into words, with a suggested hiragana reading for each word that has kanji.
 * The surfaces add up to the text exactly.
 */
export async function readings(text: string): Promise<ReadingToken[]> {
  const tokens = (await load()).tokenize(text);
  return tokens.map((token) => {
    const reading = token.reading && token.reading !== "*" ? toHiragana(token.reading) : null;
    return { surface: token.surface_form, reading: hasKanji(token.surface_form) ? reading : null };
  });
}
