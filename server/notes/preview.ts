import { stripFurigana } from "../../shared/furigana.ts";

/**
 * Plain text for cards: the first paragraph that has some, with markdown, images, headings,
 * HTML/MDX lines, code blocks and furigana readings left out.
 */
export function preview(body: string, max = 220): string {
  const blocks = stripFurigana(body.replace(/```[\s\S]*?(```|$)/g, "")).split(/\n\s*\n/);

  for (const block of blocks) {
    const text = block
      .split("\n")
      .filter((line) => !/^\s*(#{1,6}\s|>|<|import\s|export\s|!\[|---\s*$)/.test(line))
      .map((line) => line.replace(/^\s*([-*+]|\d+\.)\s+/, "")) // list markers
      .join(" ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // inline images
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
      .replace(/[*_~`]+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (text) return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, "")}…` : text;
  }
  return "";
}
