import { useEffect, useRef, useState } from "react";
import { hasKanji } from "../../shared/furigana.ts";
import type { VocabCard, VocabField } from "../../shared/vocabcard.ts";
import { kanaReading } from "../lib/kana.ts";
import { suggestReading } from "../queries.ts";
import { FuriganaDialog } from "./FuriganaDialog.tsx";
import { VocabCardView } from "./VocabCardView.tsx";

type Props = {
  initial: VocabCard;
  mode: "new" | "edit";
  /** A word in the vocab inbox rather than a card in a note: it has a source, and "Meaning" for the definition. */
  inbox?: { source: string };
  /** May return a promise; the dialog stays open and shows the error if it fails. */
  onSave: (card: VocabCard, source: string) => unknown;
  /** Edit mode: remove the card, or show its MDX in the editor. */
  onRemove?: () => unknown;
  onEditText?: () => void;
  onClose: (changed: boolean) => void;
};

/** The fields of a vocab card (or an inbox word), with a preview and reading suggestions. */
export function VocabCardDialog({ initial, mode, inbox, onSave, onRemove, onEditText, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const changed = useRef(false);
  const [card, setCard] = useState(initial);
  const [source, setSource] = useState(inbox?.source ?? "");
  const [suggesting, setSuggesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exampleFurigana, setExampleFurigana] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const set = (field: VocabField, value: string) => setCard((c) => ({ ...c, [field]: value }));

  const suggest = async (word = card.word) => {
    if (!hasKanji(word)) return;
    setSuggesting(true);
    setError(null);
    try {
      const reading = await suggestReading(word.trim());
      setCard((c) => (c.word === word ? { ...c, reading } : c));
    } catch (err) {
      setError(`Couldn't suggest a reading: ${(err as Error).message}`);
    } finally {
      setSuggesting(false);
    }
  };

  // a word given up front (from a selection) gets its reading straight away
  useEffect(() => {
    if (mode === "new" && initial.word && !initial.reading) void suggest(initial.word);
    // only when the dialog opens
  }, []);

  const finish = async (action: () => unknown) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      changed.current = true;
      dialog.current?.close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = (name: VocabField, label: string, ja: string, { multiline = false } = {}) => (
    <label className="field-group">
      <span className="flabel">
        {label}
        <span lang="ja">{ja}</span>
      </span>
      {multiline ? (
        <textarea className="field" rows={3} value={card[name]} onChange={(e) => set(name, e.target.value)} />
      ) : (
        <input className="field" value={card[name]} onChange={(e) => set(name, e.target.value)} />
      )}
    </label>
  );

  const heading = inbox ? (mode === "new" ? "Save to vocab inbox" : "Vocab inbox") : mode === "new" ? "New vocab card" : "Vocab card";
  const [save, saveJa] = mode === "edit" ? ["Save", "保存"] : inbox ? ["Add", "追加"] : ["Insert", "挿入"];

  return (
    <dialog
      ref={dialog}
      className="dialog dialog--wide"
      // React passes a nested dialog's close event up to this one too
      onClose={(e) => e.target === e.currentTarget && onClose(changed.current)}
      aria-labelledby="vocab-card-heading"
    >
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          void finish(() => onSave({ ...card, word: card.word.trim(), reading: kanaReading(card.reading.trim()) }, source.trim()));
        }}
      >
        <p className="eyebrow" id="vocab-card-heading">
          <span className="dots">● ●</span>
          <span>
            {heading}
            <span lang="ja">{inbox ? "単語帳" : "単語カード"}</span>
          </span>
        </p>

        <div className="vocab-form">
          <div className="vocab-fields">
            <div className="vocab-word-row">
              <label className="field-group">
                <span className="flabel">
                  Word<span lang="ja">単語</span>
                </span>
                <input
                  className="field field--ja"
                  lang="ja"
                  value={card.word}
                  autoFocus={!card.word}
                  required
                  onChange={(e) => set("word", e.target.value)}
                  onBlur={() => !card.reading && void suggest()}
                />
              </label>
              <label className="field-group">
                <span className="flabel">
                  Reading<span lang="ja">読み</span>
                </span>
                <span className="field-with-button">
                  <input
                    className="field field--ja"
                    lang="ja"
                    value={card.reading}
                    autoFocus={!!card.word}
                    placeholder={suggesting ? "…" : ""}
                    onChange={(e) => set("reading", e.target.value)}
                    onBlur={(e) => set("reading", kanaReading(e.target.value.trim()))}
                  />
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    disabled={!hasKanji(card.word) || suggesting}
                    title="Suggest a reading"
                    onClick={() => void suggest()}
                  >
                    Suggest<span lang="ja">候補</span>
                  </button>
                </span>
              </label>
            </div>
            {inbox ? field("definition", "Meaning", "意味") : field("definition", "Definition", "意味")}
            <div className="field-group">
              <label className="flabel" htmlFor="vocab-example">
                Example<span lang="ja">例文</span>
              </label>
              <textarea
                id="vocab-example"
                className="field field--ja"
                lang="ja"
                rows={2}
                value={card.example}
                onChange={(e) => set("example", e.target.value)}
              />
              <span className="field-foot">
                <span className="hint">
                  <code>{"{松明}"}</code> highlights the word, <code>{"{洞窟|どうくつ}"}</code> adds furigana.
                </span>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={!hasKanji(card.example)}
                  onClick={() => setExampleFurigana(true)}
                >
                  ふりがな…
                </button>
              </span>
            </div>
            {field("translation", "Translation", "訳")}
            {field("context", inbox ? "Notes" : "Context", "メモ", { multiline: true })}
            {inbox && (
              <label className="field-group">
                <span className="flabel">
                  Source<span lang="ja">出典</span>
                </span>
                <input className="field" value={source} placeholder="Minecraft, a book, a sign…" onChange={(e) => setSource(e.target.value)} />
              </label>
            )}
          </div>

          <div className="vocab-preview">
            <span className="flabel">
              Preview<span lang="ja">プレビュー</span>
            </span>
            <VocabCardView card={card} />
          </div>
        </div>

        {error && <p className="plate plate--error">{error}</p>}

        <div className="actions">
          <button className="btn" disabled={!card.word.trim() || busy}>
            {save}
            <span lang="ja">{saveJa}</span>
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          {onEditText && (
            <button type="button" className="btn btn--ghost actions-end" onClick={() => void finish(onEditText)}>
              Edit as text
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              className={onEditText ? "btn btn--danger" : "btn btn--danger actions-end"}
              disabled={busy}
              onClick={() => void finish(onRemove)}
            >
              Remove<span lang="ja">削除</span>
            </button>
          )}
        </div>
      </form>

      {exampleFurigana && (
        <FuriganaDialog
          text={card.example}
          onApply={(example) => set("example", example)}
          onClose={() => setExampleFurigana(false)}
        />
      )}
    </dialog>
  );
}
