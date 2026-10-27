import { describe, expect, it } from "vitest";
import type { NoteMeta } from "../../shared/types.ts";
import { parseNoteFile, serializeNote } from "./frontmatter.ts";

const fallbacks = {
  title: "fallback-slug",
  created: new Date("2026-01-01T00:00:00.000Z"),
  updated: new Date("2026-01-02T00:00:00.000Z"),
};

const meta: NoteMeta = {
  title: "Minecraft で覚えた言葉 #1",
  titleJa: "マイクラの言葉",
  type: "note",
  lang: "en",
  status: "budding",
  tags: ["japanese", "minecraft"],
  excerpt: "Torches, caves: villagers — and \"quotes\".",
  image: { src: "./cover.avif", alt: "A torch in a cave" },
  created: "2026-10-21T19:42:00.000Z",
  updated: "2026-10-28T08:00:00.000Z",
};

const body = "Started playing Minecraft in Japanese.\n\n## 松明\n\nたいまつ — torch.\n";

describe("serializeNote + parseNoteFile", () => {
  it("round-trips Japanese text, quotes and colons without changes", () => {
    const text = serializeNote(meta, {}, body);
    const parsed = parseNoteFile(text, fallbacks);

    expect(parsed.meta).toEqual(meta);
    expect(parsed.body).toBe(body);
    expect(parsed.problems).toEqual([]);
    // UTF-8 as is, not \u escapes; quoted because " #" would otherwise start a YAML comment
    expect(text).toContain('title: "Minecraft で覚えた言葉 #1"');
    expect(text).toContain("titleJa: マイクラの言葉");
  });

  it("round-trips bodies with and without trailing or leading blank lines", () => {
    for (const b of ["", "one line", "trailing\n", "\nleading blank", "two\n\n"]) {
      expect(parseNoteFile(serializeNote(meta, {}, b), fallbacks).body).toBe(b);
    }
  });

  it("writes keys in a fixed order, tags inline, and ends with one newline", () => {
    const text = serializeNote({ ...meta, titleJa: undefined, excerpt: undefined, image: undefined }, {}, "Hi");
    expect(text).toBe(
      [
        "---",
        'title: "Minecraft で覚えた言葉 #1"',
        "type: note",
        "lang: en",
        "status: budding",
        "tags: [ japanese, minecraft ]",
        "created: 2026-10-21T19:42:00.000Z",
        "updated: 2026-10-28T08:00:00.000Z",
        "---",
        "",
        "Hi",
        "",
      ].join("\n"),
    );
  });

  it("keeps unknown keys and writes them back after the known ones", () => {
    const text = "---\npubDate: 2026-04-06\ntitle: Old post\nisDraft: true\ncustom:\n  nested: [1, 2]\n---\n\nBody";
    const parsed = parseNoteFile(text, fallbacks);

    expect(parsed.extra).toEqual({ pubDate: "2026-04-06", isDraft: true, custom: { nested: [1, 2] } });
    const again = serializeNote(parsed.meta, parsed.extra, parsed.body);
    expect(again.indexOf("updated:")).toBeLessThan(again.indexOf("pubDate:"));
    expect(parseNoteFile(again, fallbacks).extra).toEqual(parsed.extra);
  });

  it('keeps lang "no" a string (YAML 1.1 would read it as false)', () => {
    const text = serializeNote({ ...meta, lang: "no" }, {}, "");
    expect(parseNoteFile(text, fallbacks).meta.lang).toBe("no");
  });
});

describe("parseNoteFile", () => {
  it("uses defaults and file times when there's no frontmatter", () => {
    const parsed = parseNoteFile("Just some text\n", fallbacks);
    expect(parsed.meta).toEqual({
      title: "fallback-slug",
      type: "note",
      lang: "en",
      status: "seedling",
      tags: [],
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-02T00:00:00.000Z",
    });
    expect(parsed.body).toBe("Just some text");
    expect(parsed.readable).toBe(true);
  });

  it("reports invalid values and uses the defaults instead", () => {
    const parsed = parseNoteFile("---\ntitle: X\ntype: poem\nstatus: 3\n---\n\nBody", fallbacks);
    expect(parsed.meta.type).toBe("note");
    expect(parsed.meta.status).toBe("seedling");
    expect(parsed.problems).toEqual([
      'type: "poem" isn\'t valid, using the default',
      'status: "3" isn\'t valid, using the default',
    ]);
    expect(parsed.readable).toBe(true);
  });

  it("marks broken YAML as unreadable", () => {
    const parsed = parseNoteFile("---\ntitle: [unclosed\n---\n\nBody", fallbacks);
    expect(parsed.readable).toBe(false);
    expect(parsed.problems[0]).toMatch(/isn't valid YAML/);
    expect(parsed.body).toBe("Body");
  });

  it("handles CRLF line endings and a byte-order mark", () => {
    const parsed = parseNoteFile("﻿---\r\ntitle: Windows\r\n---\r\n\r\nLine one\r\nLine two\r\n", fallbacks);
    expect(parsed.meta.title).toBe("Windows");
    expect(parsed.body).toBe("Line one\nLine two");
  });

  it("normalizes tags: strips #, lowercases, dedupes, accepts a comma list", () => {
    expect(parseNoteFile("---\ntags: [\"#Blender\", blender, 3d, Geometry Nodes]\n---\n", fallbacks).meta.tags).toEqual([
      "blender",
      "3d",
      "geometry-nodes",
    ]);
    expect(parseNoteFile("---\ntags: kanji, japanese\n---\n", fallbacks).meta.tags).toEqual(["kanji", "japanese"]);
  });

  it("doesn't end the frontmatter at a line that only starts with ---", () => {
    const parsed = parseNoteFile("---\ntitle: X\nexcerpt: |\n  ----\n  rule\n---\n\nBody", fallbacks);
    expect(parsed.meta.excerpt).toBe("----\nrule");
    expect(parsed.body).toBe("Body");
  });
});
