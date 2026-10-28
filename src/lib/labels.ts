import type { NoteLang, NoteStatus, NoteType } from "../../shared/types.ts";

/** Each garden type is a "line" with a letter for its station codes (W·01). */
export const TYPE_LABELS: Record<NoteType, { en: string; short: string; ja: string; letter: string }> = {
  writing: { en: "Writing", short: "Writing", ja: "文章", letter: "W" },
  art: { en: "Art", short: "Art", ja: "作品", letter: "A" },
  story: { en: "Story", short: "Story", ja: "物語", letter: "S" },
  note: { en: "Note", short: "Note", ja: "メモ", letter: "N" },
  visualization: { en: "Visualization", short: "Viz", ja: "可視化", letter: "V" },
};

export const STATUS_LABELS: Record<NoteStatus, { en: string; kanji: string; reading: string }> = {
  seedling: { en: "Seedling", kanji: "苗", reading: "なえ" },
  budding: { en: "Budding", kanji: "蕾", reading: "つぼみ" },
  evergreen: { en: "Evergreen", kanji: "常緑", reading: "じょうりょく" },
};

export const LANG_LABELS: Record<NoteLang, { code: string; en: string; ja: string }> = {
  no: { code: "NO", en: "Norwegian", ja: "ノルウェー語" },
  en: { code: "EN", en: "English", ja: "英語" },
  ja: { code: "JA", en: "Japanese", ja: "日本語" },
};
