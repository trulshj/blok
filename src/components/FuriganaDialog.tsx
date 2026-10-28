import { useEffect, useMemo, useRef, useState } from "react";
import { applyReadings, furiganaChunks, proseTexts, readingRows, type ReadingRow } from "../lib/furigana.ts";
import { kanaReading } from "../lib/kana.ts";
import { useReadings } from "../queries.ts";
import { RubyText } from "./RubyText.tsx";

type Props = {
  text: string;
  onApply: (text: string) => void;
  /** Called after closing; `applied` says whether the text was changed. */
  onClose: (applied: boolean) => void;
};

/**
 * Furigana for a piece of text: each word with kanji gets a suggested reading to check, fix or skip.
 * Existing furigana is listed too, so its reading can be changed or removed.
 */
export function FuriganaDialog({ text, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const applied = useRef(false);
  const chunks = useMemo(() => furiganaChunks(text), [text]);
  const texts = useMemo(() => proseTexts(chunks), [chunks]);
  const suggestions = useReadings(texts);
  const [edited, setEdited] = useState<ReadingRow[] | null>(null);
  const [firstOnly, setFirstOnly] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const tokens = suggestions.data;
  const rows = edited ?? (tokens ? readingRows(chunks, tokens) : null);
  // romaji readings count as kana right away, also when Enter applies before the field is left
  const kanaRows = rows?.map((row) => ({ ...row, reading: kanaReading(row.reading) }));
  const result = kanaRows && tokens ? applyReadings(chunks, tokens, kanaRows, { firstOnly }) : null;
  const update = (i: number, change: Partial<ReadingRow>) => setEdited(rows!.map((row, j) => (j === i ? { ...row, ...change } : row)));

  return (
    <dialog
      ref={dialog}
      className="dialog dialog--wide"
      onClose={(e) => e.target === e.currentTarget && onClose(applied.current)}
      aria-labelledby="furigana-heading"
    >
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (result === null) return;
          applied.current = result !== text;
          if (applied.current) onApply(result);
          dialog.current?.close();
        }}
      >
        <p className="eyebrow" id="furigana-heading">
          <span className="dots">● ●</span>
          <span>
            Furigana<span lang="ja">ふりがな</span>
          </span>
        </p>

        {suggestions.isPending && (
          <p className="loading">
            Reading the text <span lang="ja">読み込み中</span>
          </p>
        )}
        {suggestions.isError && <p className="plate plate--error">{suggestions.error.message}</p>}
        {rows?.length === 0 && <p className="hint">There are no kanji here to add readings to.</p>}

        {rows && rows.length > 0 && (
          <div className="readings" role="group" aria-label="Readings">
            <span className="flabel">
              Word<span lang="ja">単語</span>
            </span>
            <span className="flabel">
              Reading<span lang="ja">読み</span>
            </span>
            {rows.map((row, i) => (
              <div className="reading-row" key={row.word}>
                <label className="reading-word" lang="ja">
                  <input type="checkbox" checked={row.include} onChange={(e) => update(i, { include: e.target.checked })} />
                  {row.word}
                </label>
                <input
                  className="field"
                  lang="ja"
                  value={row.reading}
                  disabled={!row.include}
                  aria-label={`Reading of ${row.word}`}
                  autoFocus={i === 0}
                  onChange={(e) => update(i, { reading: e.target.value })}
                  onBlur={(e) => update(i, { reading: kanaReading(e.target.value.trim()) })}
                />
              </div>
            ))}
          </div>
        )}

        {result !== null && rows && rows.length > 0 && (
          <div className="furigana-preview" lang="ja" aria-label="Preview">
            <RubyText text={result} />
          </div>
        )}

        <label className="checkbox">
          <input type="checkbox" checked={firstOnly} onChange={(e) => setFirstOnly(e.target.checked)} />
          Only where a word first appears<span lang="ja">初出のみ</span>
        </label>
        <p className="hint">
          Suggestions come from a dictionary, so check them. Readings can be typed in romaji. かん|じ gives each
          character its own reading.
        </p>

        <div className="actions">
          <button className="btn" disabled={result === null}>
            Apply<span lang="ja">適用</span>
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
