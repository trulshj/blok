import type { CSSProperties, ReactNode } from "react";

type Props = {
  /** One string per staggered line. */
  lines: string[];
  /** Font size of the title in px. */
  size: number;
  /** Japanese text on the vertical slab. */
  slab?: string;
  plateTop?: ReactNode;
  plateBottom?: ReactNode;
};

/** Title on colour blocks, with an optional vertical slab and name plates hung off it. */
export function TitleBlock({ lines, size, slab, plateTop, plateBottom }: Props) {
  return (
    <div className="compose" style={{ "--title-size": `${size}px` } as CSSProperties}>
      {plateTop && <span className="plate plate--tl">{plateTop}</span>}
      <div className="compose-row">
        <h1 className="block-title">
          {lines.map((line) => (
            <span className="bt" key={line}>
              {line}
            </span>
          ))}
        </h1>
        {slab && (
          <div className="slab-v" lang="ja">
            {slab}
          </div>
        )}
      </div>
      {plateBottom && <span className="plate plate--br">{plateBottom}</span>}
    </div>
  );
}
