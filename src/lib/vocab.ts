import { findFurigana, stripFurigana } from "../../shared/furigana.ts";
import type { VocabEntry, VocabInput } from "../../shared/types.ts";
import type { VocabCard } from "../../shared/vocabcard.ts";

/** An inbox entry as a vocab card (its meaning is the card's definition). */
export function entryToCard(entry: VocabEntry): VocabCard {
  return {
    word: entry.word,
    reading: entry.reading,
    definition: entry.meaning,
    example: entry.example ?? "",
    translation: entry.translation ?? "",
    context: entry.context ?? "",
    extra: [],
  };
}

export function cardToInput(card: VocabCard, source: string, used?: string[]): VocabInput {
  const input: VocabInput = { word: card.word, reading: card.reading, meaning: card.definition };
  if (card.example) input.example = card.example;
  if (card.translation) input.translation = card.translation;
  if (card.context) input.context = card.context;
  if (source) input.source = source;
  if (used) input.used = used;
  return input;
}

const SENTENCE_END = /[。！？!?]/;

/**
 * A new inbox word from a selection on one line: the word (readings taken out of furigana), and the
 * sentence around it as an example with the word highlighted.
 */
export function wordFromSelection(line: string, from: number, to: number): { word: string; reading: string; example: string } {
  const selected = line.slice(from, to);
  const furigana = findFurigana(selected);
  const whole = furigana.length === 1 && furigana[0]!.from === 0 && furigana[0]!.to === selected.length;
  const word = stripFurigana(selected).trim();
  const reading = whole ? furigana[0]!.parts.map((p) => p.reading).join("") : "";

  let start = from;
  while (start > 0 && !SENTENCE_END.test(line[start - 1]!)) start--;
  let end = to;
  while (end < line.length && !SENTENCE_END.test(line[end - 1] ?? "")) end++;
  if (end > to && !SENTENCE_END.test(line[end - 1]!)) end = line.length;

  // one furigana already reads as the word in an example; anything else gets braces to highlight it
  const marked = whole ? selected : `{${selected.trim()}}`;
  const example = (line.slice(start, from) + marked + line.slice(to, end))
    .replace(/^\s*([-*+>]|\d+\.|#{1,6})\s+/, "") // list, quote or heading markers
    .replace(/\*\*|__|`/g, "")
    .trim();
  return { word, reading, example: word.length < example.replace(/[{}]/g, "").length ? example : "" };
}

export type VocabShow = "new" | "used" | "all";

/** Entries to show: new (not in a note yet), used or all, matching every word of the search. */
export function filterVocab(entries: VocabEntry[], show: VocabShow, q: string): VocabEntry[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (show === "new" && e.used.length) return false;
    if (show === "used" && !e.used.length) return false;
    const text = [e.word, e.reading, e.meaning, e.example, e.translation, e.context, e.source]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
