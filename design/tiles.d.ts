// Types for tiles.js (kept as plain JS so design/sketch.html can load it without a build).

/** Drawing kit passed to tile drawers. Coordinates are on a 12 × 12 grid; each helper returns SVG markup. */
export type TileKit = {
  size: number;
  center: number;
  rect(x: number, y: number, w: number, h: number): string;
  circle(cx: number, cy: number, r: number): string;
  ring(cx: number, cy: number, r: number, width?: number): string;
  line(x1: number, y1: number, x2: number, y2: number, width?: number): string;
  poly(...points: [number, number][]): string;
  path(d: string): string;
  stroke(d: string, width?: number): string;
  rotate(deg: number, inner: string): string;
  turn(dir: "up" | "right" | "down" | "left" | "tl" | "tr" | "br" | "bl", inner: string): string;
  repeat(n: number, fn: (i: number) => string): string;
  grid(cols: number, rows: number, fn: (x: number, y: number) => string): string;
};

export type MosaicOptions = {
  seed: string;
  cols: number;
  rows: number;
  /** Tile size in px; only used by mosaic(). */
  tile?: number;
  /** 0..1, how full the cluster is near its anchor. */
  density?: number;
  /** Where the cluster is densest, as [x, y] fractions of the grid. Seeded when left out. */
  anchor?: [number, number];
  /** CSS colours for tile backgrounds and glyphs. */
  colors: string[];
};

export declare const Tiles: {
  define(name: string, draw: (t: TileKit) => string, opts?: { weight?: number }): void;
  family<V>(name: string, variants: V[], draw: (t: TileKit, variant: V) => string, opts?: { weight?: number }): void;
  list(): string[];
  svg(id: string, colors: { bg: string; fg: string }): string;
  mosaicHTML(opts: MosaicOptions): string;
  mosaic(el: HTMLElement, opts: MosaicOptions & { tile: number }): void;
};
