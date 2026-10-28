import type { VocabCard } from "../../shared/vocabcard.ts";
import { ExampleText } from "./RubyText.tsx";

/** A vocab card as truls.dev shows it, in blok's style (the editor draws the same card in vocabCards.ts). */
export function VocabCardView({ card }: { card: Omit<VocabCard, "extra"> }) {
  const { word, reading, definition, example, translation, context } = card;
  return (
    <figure className="vocab-card">
      <div className="vocab-card-word" lang="ja">
        {reading ? (
          <ruby>
            {word}
            <rt>{reading}</rt>
          </ruby>
        ) : (
          word || "—"
        )}
      </div>
      <div className="vocab-card-body">
        <p className="vocab-card-def">{definition || <span className="muted">…</span>}</p>
        {example && (
          <p className="vocab-card-example" lang="ja">
            <ExampleText example={example} word={word} />
          </p>
        )}
        {translation && <p className="vocab-card-translation">{translation}</p>}
        {context && <p className="vocab-card-context">({context})</p>}
      </div>
    </figure>
  );
}
