import { describe, expect, it } from "vitest";
import type { NoteMeta, NoteSummary } from "../../shared/types.ts";
import { applyFilters, isFiltered, readFilters, tagCounts, toggle, writeFilters, type Filters } from "./filters.ts";

function note(slug: string, meta: Partial<NoteMeta>): NoteSummary {
  return {
    slug,
    problems: [],
    preview: "",
    meta: {
      title: slug,
      type: "note",
      lang: "en",
      status: "seedling",
      tags: [],
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
      ...meta,
    },
  };
}

const notes = [
  note("kyoto", { title: "Kyoto alley", type: "art", tags: ["blender", "kyoto"], updated: "2026-10-28T09:00:00Z", created: "2026-10-01T00:00:00Z" }),
  note("kanji", { title: "Kanji mix-ups", tags: ["japanese"], status: "budding", updated: "2026-10-25T09:00:00Z", created: "2026-10-20T00:00:00Z" }),
  note("hva", { title: "Hva er visualisering?", type: "writing", lang: "no", status: "evergreen", updated: "2026-03-12T09:00:00Z", created: "2026-03-01T00:00:00Z" }),
  note("shoji", { title: "Geometry nodes: shoji", type: "writing", tags: ["blender"], updated: "2026-10-20T09:00:00Z", created: "2026-10-15T00:00:00Z" }),
];

const none: Filters = { types: [], langs: [], statuses: [], tag: null, q: "", sort: "updated" };
const slugs = (list: NoteSummary[]) => list.map((n) => n.slug);

describe("URL round trip", () => {
  it("reads what it writes, and leaves defaults out of the URL", () => {
    const f: Filters = { types: ["art", "note"], langs: ["ja"], statuses: ["budding"], tag: "blender", q: "kyoto", sort: "title" };
    expect(readFilters(writeFilters(f))).toEqual(f);
    expect(writeFilters(none).toString()).toBe("");
  });

  it("ignores values it doesn't know", () => {
    expect(readFilters(new URLSearchParams("type=art,poem&lang=xx&sort=random"))).toEqual({ ...none, types: ["art"] });
  });
});

describe("applyFilters", () => {
  it("sorts by last update by default", () => {
    expect(slugs(applyFilters(notes, none))).toEqual(["kyoto", "kanji", "shoji", "hva"]);
  });

  it("sorts by created or title", () => {
    expect(slugs(applyFilters(notes, { ...none, sort: "created" }))).toEqual(["kanji", "shoji", "kyoto", "hva"]);
    expect(slugs(applyFilters(notes, { ...none, sort: "title" }))).toEqual(["shoji", "hva", "kanji", "kyoto"]);
  });

  it("combines filters, treating empty lists as all", () => {
    expect(slugs(applyFilters(notes, { ...none, types: ["writing"] }))).toEqual(["shoji", "hva"]);
    expect(slugs(applyFilters(notes, { ...none, types: ["writing"], langs: ["no"] }))).toEqual(["hva"]);
    expect(slugs(applyFilters(notes, { ...none, tag: "blender" }))).toEqual(["kyoto", "shoji"]);
    expect(slugs(applyFilters(notes, { ...none, statuses: ["budding", "evergreen"] }))).toEqual(["kanji", "hva"]);
  });

  it("orders search matches by rank and still applies filters", () => {
    const results = [
      { slug: "shoji", score: 9 },
      { slug: "kyoto", score: 5 },
    ];
    expect(slugs(applyFilters(notes, { ...none, q: "blender" }, results))).toEqual(["shoji", "kyoto"]);
    expect(slugs(applyFilters(notes, { ...none, q: "blender", types: ["art"] }, results))).toEqual(["kyoto"]);
  });

  it("ignores the query until results arrive", () => {
    expect(applyFilters(notes, { ...none, q: "kyo" })).toHaveLength(4);
  });
});

it("isFiltered ignores sorting and blank queries", () => {
  expect(isFiltered({ ...none, sort: "title", q: "  " })).toBe(false);
  expect(isFiltered({ ...none, tag: "x" })).toBe(true);
});

it("toggle adds and removes", () => {
  expect(toggle(["a"], "b")).toEqual(["a", "b"]);
  expect(toggle(["a", "b"], "a")).toEqual(["b"]);
});

it("tagCounts sorts by use, then name", () => {
  expect(tagCounts(notes)).toEqual([
    ["blender", 2],
    ["japanese", 1],
    ["kyoto", 1],
  ]);
});
