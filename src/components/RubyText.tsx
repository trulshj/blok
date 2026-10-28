import { Fragment, type ReactNode } from "react";
import { findFurigana, type RubyPart } from "../../shared/furigana.ts";
import { exampleSegments } from "../../shared/vocabcard.ts";

function Ruby({ parts }: { parts: RubyPart[] }) {
  return (
    <ruby>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p.base}
          <rt>{p.reading}</rt>
        </Fragment>
      ))}
    </ruby>
  );
}

/** Text with {漢字|かんじ} furigana shown as ruby. */
export function RubyText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let pos = 0;
  for (const match of findFurigana(text)) {
    if (match.from > pos) out.push(text.slice(pos, match.from));
    out.push(<Ruby key={match.from} parts={match.parts} />);
    pos = match.to;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}

/** A vocab card example: {word} highlighted, furigana as ruby (see exampleSegments). */
export function ExampleText({ example, word }: { example: string; word: string }) {
  const out: ReactNode[] = [];
  let marked: ReactNode[] | null = null;
  exampleSegments(example, word).forEach((segment, i) => {
    const content = "text" in segment ? segment.text : <Ruby key={i} parts={segment.ruby} />;
    if (segment.mark) {
      if (!marked) {
        marked = [];
        out.push(<mark key={i}>{marked}</mark>);
      }
      marked.push(typeof content === "string" ? <Fragment key={i}>{content}</Fragment> : content);
    } else {
      marked = null;
      out.push(typeof content === "string" ? <Fragment key={i}>{content}</Fragment> : content);
    }
  });
  return <>{out}</>;
}
