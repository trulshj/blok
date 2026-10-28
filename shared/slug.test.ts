import { describe, expect, it } from "vitest";
import { isValidSlug, slugify, uniqueSlug } from "./slug.ts";

const when = new Date(2026, 9, 28, 9, 5, 7); // local time

describe("slugify", () => {
  it.each([
    ["Hva er visualisering?", "hva-er-visualisering"],
    ["IMDb Top 1000: Ærlig vs. villedende", "imdb-top-1000-aerlig-vs-villedende"],
    ["Blåbær på Røros", "blabaer-pa-roros"],
    ["Café résumé", "cafe-resume"],
    ["Minecraft で覚えた言葉 #1", "minecraft-1"],
    ["  --Kyoto  alley--  ", "kyoto-alley"],
  ])("%s → %s", (title, slug) => {
    expect(slugify(title, when)).toBe(slug);
  });

  it("falls back to a timestamp when nothing ASCII is left", () => {
    expect(slugify("京都の路地", when)).toBe("note-20261028-0905");
    expect(slugify("!!!", when)).toBe("note-20261028-0905");
  });

  it("caps long titles at a word boundary", () => {
    const slug = slugify("a very long title about procedural shoji screens made with geometry nodes in blender", when);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
    expect(isValidSlug(slug)).toBe(true);
  });
});

describe("uniqueSlug", () => {
  it("adds -2, -3… while the slug is taken", () => {
    const taken = new Set(["kyoto", "kyoto-2"]);
    expect(uniqueSlug("kyoto", (s) => taken.has(s))).toBe("kyoto-3");
    expect(uniqueSlug("fresh", (s) => taken.has(s))).toBe("fresh");
  });
});

describe("isValidSlug", () => {
  it.each(["kyoto-alley", "note-20261028-0905", "a", "3d"])("accepts %s", (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each(["", "..", "../etc", "a/b", "a\\b", ".trash", "Kyoto", "kyoto--alley", "-kyoto", "kyoto-", "京都", "a b"])(
    "rejects %j",
    (slug) => {
      expect(isValidSlug(slug)).toBe(false);
    },
  );
});
