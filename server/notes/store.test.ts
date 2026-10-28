import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NoteMetaInput } from "../../shared/types.ts";
import { tempCheckout } from "../testing.ts";
import { createNoteStore, NoteError, type NoteStore } from "./store.ts";

let checkout: ReturnType<typeof tempCheckout>;
let notesDir: string;
let clock: Date;
let store: NoteStore;

beforeEach(() => {
  checkout = tempCheckout();
  notesDir = join(checkout.parent, "blok-notes");
  mkdirSync(join(notesDir, "notes"), { recursive: true });
  clock = new Date("2026-10-28T09:00:00.000Z");
  store = createNoteStore(notesDir, { now: () => clock });
});
afterEach(() => checkout.cleanup());

const tick = (minutes = 1) => {
  clock = new Date(clock.getTime() + minutes * 60_000);
};

const file = (slug: string) => join(notesDir, "notes", slug, "index.md");

function metaOf(input: Partial<NoteMetaInput> = {}): NoteMetaInput {
  return { title: "Kyoto alley blockout", type: "art", lang: "en", status: "budding", tags: [], ...input };
}

async function expectNoteError(promise: Promise<unknown>, code: NoteError["code"]) {
  await expect(promise).rejects.toSatisfy((err) => err instanceof NoteError && err.code === code);
}

describe("create", () => {
  it("writes notes/<slug>/index.md with defaults and timestamps", async () => {
    const note = await store.create({ title: "Kyoto alley blockout", body: "Pontochō at night." });

    expect(note.slug).toBe("kyoto-alley-blockout");
    expect(note.meta).toMatchObject({ type: "note", lang: "en", status: "seedling", tags: [] });
    expect(note.meta.created).toBe("2026-10-28T09:00:00.000Z");
    expect(readFileSync(file("kyoto-alley-blockout"), "utf8")).toContain("Pontochō at night.");
  });

  it("gives clashing titles their own slugs", async () => {
    await store.create({ title: "Kanji" });
    expect((await store.create({ title: "Kanji" })).slug).toBe("kanji-2");
  });

  it("names Japanese-only titles by time", async () => {
    const note = await store.create({ title: "京都の路地" });
    expect(note.slug).toMatch(/^note-\d{8}-\d{4}$/);
    expect(note.meta.title).toBe("京都の路地");
  });

  it("leaves no temp files behind", async () => {
    await store.create({ title: "Clean" });
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(join(notesDir, "notes", "clean"))).toEqual(["index.md"]);
  });
});

describe("list and get", () => {
  it("lists notes newest first and skips folders that aren't notes", async () => {
    await store.create({ title: "Older" });
    tick();
    await store.create({ title: "Newer" });
    mkdirSync(join(notesDir, "notes", "empty-folder"));
    mkdirSync(join(notesDir, "notes", "Not A Slug"));
    writeFileSync(join(notesDir, "notes", "stray.md"), "hi");

    expect((await store.list()).map((n) => n.slug)).toEqual(["newer", "older"]);
  });

  it("reads hand-written files and reports problems", async () => {
    mkdirSync(join(notesDir, "notes", "by-hand"));
    writeFileSync(file("by-hand"), "---\ntitle: By hand\ntype: poem\n---\n\nWritten in an editor.\n");

    const note = await store.get("by-hand");
    expect(note.meta.title).toBe("By hand");
    expect(note.body).toBe("Written in an editor.");
    expect(note.problems).toHaveLength(1);
  });

  it("throws not-found for a missing note", async () => {
    await expectNoteError(store.get("nope"), "not-found");
  });

  it.each(["..", "../blok", "..\\blok", ".trash", "Kyoto", "a/b"])("refuses the path %j", async (slug) => {
    await expectNoteError(store.get(slug), "invalid-slug");
  });
});

describe("update", () => {
  it("keeps created and unknown keys, and bumps updated", async () => {
    mkdirSync(join(notesDir, "notes", "post"));
    writeFileSync(file("post"), "---\ntitle: Post\ncreated: 2026-01-01T00:00:00.000Z\npubDate: 2025-06-10\n---\n\nOld\n");

    const note = await store.update("post", { meta: metaOf({ title: "Post", tags: ["#Blender"] }), body: "New" });

    expect(note.meta.created).toBe("2026-01-01T00:00:00.000Z");
    expect(note.meta.updated).toBe("2026-10-28T09:00:00.000Z");
    expect(note.meta.tags).toEqual(["blender"]);
    const text = readFileSync(file("post"), "utf8");
    expect(text).toContain("pubDate: 2025-06-10");
    expect(text.endsWith("\n\nNew\n")).toBe(true);
  });

  it("refuses to save over a change made elsewhere", async () => {
    const note = await store.create({ title: "Shared" });
    tick();
    await store.update("shared", { meta: metaOf({ title: "Shared" }), body: "from the Mac", baseUpdated: note.meta.updated });

    await expectNoteError(
      store.update("shared", { meta: metaOf({ title: "Shared" }), body: "stale", baseUpdated: note.meta.updated }),
      "conflict",
    );
    expect((await store.get("shared")).body).toBe("from the Mac");
  });

  it("refuses to overwrite frontmatter it can't read", async () => {
    mkdirSync(join(notesDir, "notes", "broken"));
    writeFileSync(file("broken"), "---\ntitle: [oops\n---\n\nKeep me\n");

    await expectNoteError(store.update("broken", { meta: metaOf(), body: "x" }), "unreadable");
    expect(readFileSync(file("broken"), "utf8")).toContain("[oops");
  });
});

describe("rename", () => {
  it("moves the folder to a slug derived from the title", async () => {
    await store.create({ title: "Draft" });
    await store.update("draft", { meta: metaOf({ title: "Kyoto alley" }), body: "" });

    const renamed = await store.rename("draft");
    expect(renamed.slug).toBe("kyoto-alley");
    expect(existsSync(file("kyoto-alley"))).toBe(true);
    expect(existsSync(join(notesDir, "notes", "draft"))).toBe(false);
  });

  it("takes an explicit slug, but not one that's in use", async () => {
    await store.create({ title: "One" });
    await store.create({ title: "Two" });

    expect((await store.rename("one", "uno")).slug).toBe("uno");
    await expectNoteError(store.rename("uno", "two"), "exists");
    await expectNoteError(store.rename("uno", "../escape"), "invalid-slug");
  });
});

describe("trash", () => {
  it("moves the note to .trash instead of deleting it", async () => {
    await store.create({ title: "Gone", body: "still here" });

    expect(await store.trash("gone")).toEqual({ trashedAs: ".trash/gone" });
    expect(existsSync(join(notesDir, "notes", "gone"))).toBe(false);
    expect(readFileSync(join(notesDir, "notes", ".trash", "gone", "index.md"), "utf8")).toContain("still here");
    expect(await store.list()).toEqual([]);
  });

  it("keeps both copies when the same slug is trashed twice", async () => {
    await store.create({ title: "Twice" });
    await store.trash("twice");
    await store.create({ title: "Twice" });

    const second = await store.trash("twice");
    expect(second.trashedAs).toMatch(/^\.trash\/twice-\d{8}-\d{6}$/);
    expect(existsSync(join(notesDir, "notes", ".trash", "twice"))).toBe(true);
  });

  it("throws not-found for a missing note", async () => {
    await expectNoteError(store.trash("nope"), "not-found");
  });
});

describe("files in a note's folder", () => {
  const IMAGE = /^[a-z0-9][a-z0-9._-]*\.(avif|png)$/i;
  const bytes = new Uint8Array([1, 2, 3]);

  it("adds files under free names and lists them", async () => {
    await store.create({ title: "Kyoto" });
    expect(await store.addFile("kyoto", "render", "avif", bytes)).toBe("render.avif");
    expect(await store.addFile("kyoto", "render", "avif", bytes)).toBe("render-2.avif");

    expect(await store.listFiles("kyoto", IMAGE)).toEqual([
      { file: "render-2.avif", bytes: 3 },
      { file: "render.avif", bytes: 3 },
    ]);
  });

  it("won't add files to a note that doesn't exist", async () => {
    await expectNoteError(store.addFile("nope", "x", "avif", bytes), "not-found");
    expect(existsSync(join(notesDir, "notes", "nope"))).toBe(false);
  });

  it.each(["../escape.avif", "a/b.avif", "..\\b.avif", ".hidden.avif", "index.md", "has space.avif"])(
    "filePath refuses %j",
    async (file) => {
      await store.create({ title: "Kyoto" });
      expect(() => store.filePath("kyoto", file, IMAGE)).toThrow(NoteError);
    },
  );

  it("filePath resolves plain names inside the folder", async () => {
    await store.create({ title: "Kyoto" });
    expect(store.filePath("kyoto", "render-01.avif", IMAGE)).toBe(join(notesDir, "notes", "kyoto", "render-01.avif"));
  });
});

it("runs concurrent writes one at a time", async () => {
  const note = await store.create({ title: "Busy" });
  await Promise.all(
    Array.from({ length: 10 }, (_, i) => store.update("busy", { meta: metaOf({ title: "Busy" }), body: `save ${i}` })),
  );
  const final = await store.get("busy");
  expect(final.body).toBe("save 9");
  expect(final.meta.created).toBe(note.meta.created);
});
