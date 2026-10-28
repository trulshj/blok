import { exampleSegments } from "../../shared/vocabcard.ts";

export type AnkiRow = {
  word: string;
  reading: string;
  meaning: string;
  example?: string;
  translation?: string;
  context?: string;
  source?: string;
};

export const ANKI_COLUMNS = ["Word", "Reading", "Meaning", "Example", "Translation", "Context", "Source"];

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A field: HTML-escaped, one line (tabs and line breaks would split the row). */
const field = (s = "") => escapeHtml(s.trim()).replace(/\t/g, " ").replace(/\r?\n/g, "<br>");

/**
 * An example in Anki's notation: furigana as " 漢字[かんじ]" (the space marks where the word starts;
 * {{furigana:Example}} in a card template shows it as ruby) and the highlighted word in <b>.
 */
export function ankiExample(example: string, word: string): string {
  let out = "";
  let bold = false;
  for (const segment of exampleSegments(example, word)) {
    if (segment.mark !== bold) {
      out += segment.mark ? "<b>" : "</b>";
      bold = segment.mark;
    }
    out += "text" in segment ? field(segment.text) : segment.ruby.map((p) => ` ${field(p.base)}[${field(p.reading)}]`).join("");
  }
  return (bold ? `${out}</b>` : out).trim();
}

/** A tab-separated file Anki imports as is (File → Import), with its header lines. */
export function ankiTsv(rows: AnkiRow[]): string {
  const header = ["#separator:tab", "#html:true", `#columns:${ANKI_COLUMNS.join("\t")}`];
  const lines = rows.map((r) =>
    [
      field(r.word),
      field(r.reading),
      field(r.meaning),
      r.example ? ankiExample(r.example, r.word) : "",
      field(r.translation),
      field(r.context),
      field(r.source),
    ].join("\t"),
  );
  return `${[...header, ...lines].join("\n")}\n`;
}

/** Saves the rows as blok-vocab-YYYYMMDD.txt through the browser. */
export function downloadAnki(rows: AnkiRow[], when = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  const name = `blok-vocab-${when.getFullYear()}${p(when.getMonth() + 1)}${p(when.getDate())}.txt`;
  const url = URL.createObjectURL(new Blob([ankiTsv(rows)], { type: "text/tab-separated-values;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
