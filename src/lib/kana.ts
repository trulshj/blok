import { toKana } from "wanakana";

/** A reading typed in romaji, as hiragana: "taimatsu" → "たいまつ". Kana and the | separator stay. */
export const kanaReading = (value: string) => (/[a-z]/i.test(value) ? toKana(value.toLowerCase()) : value);
