/*
  blok tiles: pictogram tiles and seeded mosaics.

  Every tile is drawn on a 12 × 12 grid with a small drawing kit (`t` below).
  The foreground colour fills shapes and strokes lines; the background is a solid square.

  Add a single tile:
    Tiles.define("star", (t) => t.poly([6, 1.5], [7.4, 4.6], [10.5, 4.8], [8.1, 7], [8.8, 10.2], [6, 8.5], [3.2, 10.2], [3.9, 7], [1.5, 4.8], [4.6, 4.6]));

  Add a family of variants (directions, counts, angles...):
    Tiles.family("chevron", ["up", "right", "down", "left"], (t, dir) => t.turn(dir, t.stroke("M2.5 8L6 4.5L9.5 8", 2.2)));

  Mosaics pick a family first and then one of its variants, so a family with many variants
  doesn't crowd out single tiles. Pass { weight } as the last argument to change how often
  a family shows up. Adding tiles reshuffles existing mosaics, since the pick depends on the list.
*/
const Tiles = (() => {
  const SIZE = 12;
  const C = SIZE / 2;
  const TURNS = { up: 0, right: 90, down: 180, left: 270, tl: 0, tr: 90, br: 180, bl: 270 };
  const families = new Map(); // name -> { weight, variants: [{ id, draw }] }

  const num = (n) => +n.toFixed(2);

  // drawing kit, in grid units (0..12)
  const kit = {
    size: SIZE,
    center: C,
    rect: (x, y, w, h) => `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"/>`,
    circle: (cx, cy, r) => `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}"/>`,
    ring: (cx, cy, r, w = 1.8) => `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="none" stroke-width="${w}"/>`,
    line: (x1, y1, x2, y2, w = 2) => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke-width="${w}"/>`,
    poly: (...points) => `<polygon points="${points.map(([x, y]) => `${num(x)},${num(y)}`).join(" ")}"/>`,
    path: (d) => `<path d="${d}" fill-rule="evenodd"/>`,
    stroke: (d, w = 1.8) => `<path d="${d}" fill="none" stroke-width="${w}"/>`,
    rotate: (deg, inner) => (deg ? `<g transform="rotate(${deg} ${C} ${C})">${inner}</g>` : inner),
    turn: (dir, inner) => kit.rotate(TURNS[dir] ?? 0, inner),
    repeat: (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join(""),
    grid: (cols, rows, fn) => kit.repeat(cols * rows, (i) => fn(i % cols, Math.floor(i / cols))),
  };

  function family(name, variants, draw, { weight = 1 } = {}) {
    families.set(name, {
      weight,
      variants: variants.map((v) => ({
        id: variants.length > 1 ? `${name}/${v}` : name,
        draw: () => draw(kit, v),
      })),
    });
  }

  function define(name, draw, opts) {
    family(name, [null], (t) => draw(t), opts);
  }

  function list() {
    return [...families.values()].flatMap((f) => f.variants.map((v) => v.id));
  }

  function find(id) {
    for (const f of families.values()) {
      const v = f.variants.find((v) => v.id === id);
      if (v) return v;
    }
  }

  function svg(id, { bg, fg }) {
    const v = find(id);
    return (
      `<svg class="tile" viewBox="0 0 ${SIZE} ${SIZE}" style="--bg:${bg};--fg:${fg}" data-tile="${id}" aria-hidden="true">` +
      `<rect class="tile-bg" width="${SIZE}" height="${SIZE}"/><g class="tile-fg">${v ? v.draw() : ""}</g></svg>`
    );
  }

  // seeded randomness, so a slug always gives the same mosaic
  function hash(str) {
    let h = 2166136261;
    for (const ch of str) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickId(rand) {
    const fams = [...families.values()];
    let r = rand() * fams.reduce((sum, f) => sum + f.weight, 0);
    for (const f of fams) {
      r -= f.weight;
      if (r <= 0) return f.variants[Math.floor(rand() * f.variants.length)].id;
    }
    return fams[fams.length - 1].variants[0].id;
  }

  /*
    Fill `el` with a seeded cluster of tiles, densest around `anchor`.
    opts: { seed, cols, rows, tile (px), density (0..1), anchor ([x, y] in 0..1), colors (CSS colours) }
  */
  function mosaic(el, opts) {
    const rand = rng(hash(opts.seed));
    const { cols, rows, colors, density = 0.6 } = opts;
    const ax = (opts.anchor ? opts.anchor[0] : rand()) * (cols - 1);
    const ay = (opts.anchor ? opts.anchor[1] : rand()) * (rows - 1);
    const maxD = Math.hypot(cols, rows) / 1.5;

    el.style.setProperty("--cols", cols);
    el.style.setProperty("--tile", `${opts.tile}px`);

    let html = "";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = Math.hypot(x - ax, (y - ay) * 1.4);
        if (rand() < density * Math.max(0, 1 - d / maxD)) {
          const bg = colors[Math.floor(rand() * colors.length)];
          const rest = colors.filter((c) => c !== bg);
          const fg = rest[Math.floor(rand() * rest.length)];
          html += svg(pickId(rand), { bg, fg });
        } else {
          html += "<span></span>";
        }
      }
    }
    el.innerHTML = html;
  }

  return { define, family, list, svg, mosaic };
})();

/* ============================================================
   BUILT-IN TILES
   ============================================================ */
Tiles.define("solid", () => "", { weight: 2 });
Tiles.define("hash", (t) => t.rect(3.6, 2, 1.7, 8) + t.rect(6.7, 2, 1.7, 8) + t.rect(2, 3.6, 8, 1.7) + t.rect(2, 6.7, 8, 1.7));
Tiles.define("plus", (t) => t.rect(5, 2, 2, 8) + t.rect(2, 5, 8, 2));
Tiles.define("cross", (t) => t.line(3, 3, 9, 9, 2.1) + t.line(9, 3, 3, 9, 2.1));
Tiles.define("ring", (t) => t.ring(6, 6, 2.9, 1.8));
Tiles.define("dot", (t) => t.circle(6, 6, 3.1));
Tiles.define("frame", (t) => t.path("M2.5 2.5h7v7h-7zM4.5 4.5v3h3v-3z"));
Tiles.define("pause", (t) => t.rect(3.3, 2.5, 1.9, 7) + t.rect(6.8, 2.5, 1.9, 7));
Tiles.define("pill", (t) => t.rotate(40, `<rect x="4.4" y="1.6" width="3.2" height="8.8" rx="1.6" fill="none" stroke-width="1.4"/>`));
Tiles.define("halftone", (t) => t.grid(4, 4, (x, y) => t.rect(1.6 + x * 2.5, 1.6 + y * 2.5, 1.3, 1.3)));

Tiles.family("stripes", [0, 45, 90, 135], (t, deg) =>
  t.rotate(deg, t.repeat(8, (i) => t.rect(-3 + i * 2.6, -4, 1.1, 20))),
);

Tiles.family("arrow", ["up", "right", "down", "left"], (t, dir) =>
  t.turn(dir, t.poly([6, 1.8], [10.2, 6], [7.3, 6], [7.3, 10.2], [4.7, 10.2], [4.7, 6], [1.8, 6])),
);

const DICE_PIPS = {
  1: [[6, 6]],
  2: [[3.6, 3.6], [8.4, 8.4]],
  3: [[3.3, 3.3], [6, 6], [8.7, 8.7]],
  4: [[3.6, 3.6], [8.4, 3.6], [3.6, 8.4], [8.4, 8.4]],
  5: [[3.3, 3.3], [8.7, 3.3], [6, 6], [3.3, 8.7], [8.7, 8.7]],
  6: [[3.6, 3], [8.4, 3], [3.6, 6], [8.4, 6], [3.6, 9], [8.4, 9]],
};
Tiles.family("dice", [1, 2, 3, 4, 5, 6], (t, n) => DICE_PIPS[n].map(([x, y]) => t.circle(x, y, 1.15)).join(""));

Tiles.family("quarter", ["tl", "tr", "br", "bl"], (t, corner) => t.turn(corner, t.path("M0 0H12A12 12 0 0 1 0 12Z")));

Tiles.family("half", ["up", "right", "down", "left"], (t, side) => t.turn(side, t.rect(0, 0, 12, 6)));
