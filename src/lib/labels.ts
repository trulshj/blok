import type { NoteLang, NoteStatus, NoteType } from "../../shared/types.ts";

/** Each garden type is a "line" with a letter for its station codes (L·01). */
export const TYPE_LABELS: Record<NoteType, { en: string; short: string; ja: string; letter: string }> = {
  longread: { en: "Long read", short: "Long read", ja: "長文", letter: "L" },
  note: { en: "Note", short: "Note", ja: "メモ", letter: "N" },
  art: { en: "Art", short: "Art", ja: "作品", letter: "A" },
  // 体験型: hands-on, as in 体験型展示 (an interactive exhibit)
  interactive: { en: "Interactive", short: "Interactive", ja: "体験型", letter: "I" },
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
