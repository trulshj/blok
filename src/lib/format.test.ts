import { describe, expect, it } from "vitest";
import type { NoteSummary } from "../../shared/types.ts";
import { stationCodes } from "./codes.ts";
import { relativeTime, splitTitle, titleSize } from "./format.ts";

describe("relativeTime", () => {
  const now = new Date(2026, 9, 28, 12, 0); // local time
  const at = (y: number, mo: number, d: number, h: number, mi: number, s = 0) => new Date(y, mo, d, h, mi, s).toISOString();

  it.each([
    [at(2026, 9, 28, 11, 59, 30), "just now"],
    [at(2026, 9, 28, 11, 55), "5 min ago"],
    [at(2026, 9, 28, 9, 0), "3 h ago"],
    [at(2026, 9, 27, 23, 0), "yesterday"],
    [at(2026, 9, 24, 12, 0), "4 days ago"],
    [at(2026, 2, 12, 12, 0), "12 Mar"],
    [at(2025, 5, 10, 12, 0), "10 Jun 2025"],
  ])("%s → %s", (iso, text) => {
    expect(relativeTime(iso, now)).toBe(text);
  });
});

describe("splitTitle", () => {
  it("keeps short titles on one line", () => {
    expect(splitTitle("Blok")).toEqual(["Blok"]);
  });

  it("splits at the space nearest the middle", () => {
    expect(splitTitle("Kyoto alley blockout")).toEqual(["Kyoto alley", "blockout"]);
    expect(splitTitle("Geometry nodes: procedural shoji")).toEqual(["Geometry nodes:", "procedural shoji"]);
  });

  it("leaves long titles without spaces alone", () => {
    expect(splitTitle("Minecraftで覚えた言葉の一覧表です")).toEqual(["Minecraftで覚えた言葉の一覧表です"]);
  });
});

it("titleSize shrinks long lines and stays within bounds", () => {
  expect(titleSize(["Kyoto alley", "blockout"], 560, 66)).toBe(66);
  expect(titleSize(["a very very long line of title text"], 560, 66)).toBe(38);
  expect(titleSize(["x".repeat(500)], 560, 66)).toBe(28);
});

it("stationCodes numbers each type by creation order", () => {
  const n = (slug: string, type: NoteSummary["meta"]["type"], created: string): NoteSummary => ({
    slug,
    problems: [],
    preview: "",
    meta: { title: slug, type, lang: "en", status: "seedling", tags: [], created, updated: created },
  });
  const codes = stationCodes([
    n("b", "art", "2026-02-01T00:00:00Z"),
    n("a", "art", "2026-01-01T00:00:00Z"),
    n("c", "visualization", "2026-03-01T00:00:00Z"),
  ]);
  expect(codes.get("a")).toEqual({ letter: "A", number: "01" });
  expect(codes.get("b")).toEqual({ letter: "A", number: "02" });
  expect(codes.get("c")).toEqual({ letter: "V", number: "01" });
});
