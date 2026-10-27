import { useId } from "react";
import type { NoteStatus } from "../../shared/types.ts";
import { STATUS_LABELS } from "../lib/labels.ts";

/** Round black status stamp: kanji in the middle, the English name around the edge when there's room. */
export function Stamp({ status, size = 48 }: { status: NoteStatus; size?: number }) {
  const id = `ring-${useId().replace(/[^\w-]/g, "")}`;
  const { en, kanji } = STATUS_LABELS[status];
  const ring = size >= 56;
  const kanjiSize = kanji.length > 1 ? (ring ? 22 : 34) : ring ? 34 : 52;
  const label = en.toUpperCase();

  return (
    <svg className="stamp" viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={en}>
      <circle className="stamp-bg" cx="50" cy="50" r="50" />
      {ring && (
        <>
          <path id={id} d="M 16 50 A 34 34 0 1 1 84 50 A 34 34 0 1 1 16 50" fill="none" />
          <text className="stamp-ring">
            <textPath href={`#${id}`} textLength={211} lengthAdjust="spacing">
              {`${label} • ${label} • `}
            </textPath>
          </text>
        </>
      )}
      <text
        className="stamp-kanji"
        x="50"
        y="51"
        textAnchor="middle"
        dominantBaseline="central"
        lang="ja"
        style={{ fontSize: kanjiSize }}
      >
        {kanji}
      </text>
    </svg>
  );
}
