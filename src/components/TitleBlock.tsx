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
  /** Bottom plate on the right (default) or left. */
  plateBottomSide?: "left" | "right";
  /** A status stamp over the left end of the first line. */
  stamp?: ReactNode;
  /** h1 on full screens, h2/h3 inside lists. */
  as?: "h1" | "h2" | "h3";
};

/** Title on colour blocks, with an optional vertical slab, stamp and name plates hung off it. */
export function TitleBlock({ lines, size, slab, plateTop, plateBottom, plateBottomSide = "right", stamp, as: Heading = "h1" }: Props) {
  return (
    <div className={stamp ? "compose compose--stamped" : "compose"} style={{ "--title-size": `${size}px` } as CSSProperties}>
      {plateTop && <span className="plate plate--tl">{plateTop}</span>}
      {stamp && <span className="compose-stamp">{stamp}</span>}
      <div className="compose-row">
        {/* the label keeps a space between the staggered lines for screen readers */}
        <Heading className="block-title" aria-label={lines.join(" ")}>
          {lines.map((line, i) => (
            <span className="bt" key={i}>
              {line}
            </span>
          ))}
        </Heading>
        {slab && (
          <div className="slab-v" lang="ja">
            {slab}
          </div>
        )}
      </div>
      {plateBottom && <span className={`plate plate--${plateBottomSide === "left" ? "bl" : "br"}`}>{plateBottom}</span>}
    </div>
  );
}
