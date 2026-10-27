import type { StationCode } from "../lib/codes.ts";

/** Station-style code badge in the note type's line colour (needs a data-type ancestor). */
export function CodeBadge({ code }: { code: StationCode | undefined }) {
  if (!code) return null;
  return (
    <span className="code" title={`${code.letter}·${code.number}`}>
      <b>{code.letter}</b>
      <span>{code.number}</span>
    </span>
  );
}
