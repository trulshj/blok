import { useMemo, type CSSProperties } from "react";
import { Tiles } from "../../design/tiles.js";

const COLORS = {
  ink: "var(--ink)",
  accent: "var(--accent)",
  taupe: "var(--taupe)",
  cream: "var(--cream)",
  paper: "var(--paper)",
  /** the current note type's line colour */
  t: "var(--t)",
  teal: "var(--teal)",
  vermilion: "var(--vermilion)",
  green: "var(--green)",
} as const;

type Props = {
  /** Same seed, same pattern: notes use their slug. */
  seed: string;
  cols: number;
  rows: number;
  /** Tile size in px. */
  tile: number;
  density?: number;
  anchor?: [number, number];
  colors: (keyof typeof COLORS)[];
  className?: string;
};

/** A seeded cluster of pictogram tiles from design/tiles.js. */
export function Mosaic({ seed, cols, rows, tile, density, anchor, colors, className }: Props) {
  const colorKey = colors.join();
  const [ax, ay] = anchor ?? [];
  const html = useMemo(
    () =>
      Tiles.mosaicHTML({
        seed,
        cols,
        rows,
        density,
        anchor: ax === undefined || ay === undefined ? undefined : [ax, ay],
        colors: colorKey.split(",").map((c) => COLORS[c as keyof typeof COLORS]),
      }),
    [seed, cols, rows, density, ax, ay, colorKey],
  );

  return (
    <span
      className={className ? `mosaic ${className}` : "mosaic"}
      style={{ "--cols": cols, "--tile": `${tile}px` } as CSSProperties}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
