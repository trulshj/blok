import { furiganaToHtml } from "../../shared/furigana.ts";
import { scanMdx } from "../../shared/mdx.ts";
import { parseVocabCard, vocabCardHtml } from "../../shared/vocabcard.ts";

/**
 * The note as plain markdown for the vertical preview: furigana as <ruby>, vocab cards as HTML
 * boxes, and other components and import lines left out (there's nothing to render them with).
 */
export function previewMarkdown(body: string): string {
  let out = "";
  let pos = 0;
  for (const region of scanMdx(body)) {
    out += furiganaToHtml(body.slice(pos, region.from));
    const text = body.slice(region.from, region.to);
    if (region.kind === "jsx" && text.startsWith("<VocabCard")) {
      const card = parseVocabCard(text);
      if (card) out += vocabCardHtml(card);
    } else if (region.kind === "code" || region.kind === "html") {
      out += text;
    }
    pos = region.to;
  }
  return out + furiganaToHtml(body.slice(pos));
}

/** Short runs of digits (1–2), which vertical Japanese sets upright in one cell: 10時. */
export const UPRIGHT_NUMBER = /(?<![0-9０-９])[0-9]{1,2}(?![0-9０-９])/g;
