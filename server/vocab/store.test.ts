import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempCheckout } from "../testing.ts";
import { createVocabStore, serializeVocab, VocabError, type VocabStore } from "./store.ts";

describe("vocab store", () => {
  let checkout: ReturnType<typeof tempCheckout>;
  let notesDir: string;
  let store: VocabStore;
  let clock: Date;

  beforeEach(() => {
    checkout = tempCheckout();
    notesDir = join(checkout.parent, "blok-notes");
    mkdirSync(notesDir, { recursive: true });
    clock = new Date(2026, 9, 28, 10, 15, 0);
    store = createVocabStore(notesDir, { now: () => clock });
  });

  afterEach(() => rmSync(checkout.parent, { recursive: true, force: true }));

  it("starts empty, even without a vocab folder", async () => {
    expect(await store.list()).toEqual([]);
  });

  it("writes one YAML file per word, named by time", async () => {
    const entry = await store.create({ word: " 松明 ", reading: "たいまつ", meaning: "torch", source: "Minecraft", example: "" });
    expect(entry.id).toMatch(/^20261028-101500-[0-9a-f]{4}$/);
    expect(readFileSync(join(notesDir, "vocab", `${entry.id}.yaml`), "utf8")).toBe(
      `word: 松明\nreading: たいまつ\nmeaning: torch\nsource: Minecraft\nadded: ${clock.toISOString()}\nused: []\n`,
    );
    expect(await store.list()).toEqual([entry]);
  });

  it("lists newest first, and skips files it can't read", async () => {
    const first = await store.create({ word: "羊", reading: "ひつじ", meaning: "sheep" });
    clock = new Date(2026, 9, 28, 11, 0, 0);
    const second = await store.create({ word: "牛", reading: "うし", meaning: "cow" });
    writeFileSync(join(notesDir, "vocab", "20261028-120000-ffff.yaml"), "word: [unclosed");
    writeFileSync(join(notesDir, "vocab", "notes.txt"), "not an entry");
    expect((await store.list()).map((e) => e.id)).toEqual([second.id, first.id]);
  });

  it("updates an entry, keeping when it was added and where it was used", async () => {
    const entry = await store.create({ word: "豚", reading: "ぶた", meaning: "pig" });
    await store.markUsed(entry.id, "minecraft-vocab-1");
    clock = new Date(2026, 9, 29);
    const updated = await store.update(entry.id, { word: "豚", reading: "ぶた", meaning: "pig; pork in 豚肉", context: "月 + 豕" });
    expect(updated).toMatchObject({ added: entry.added, used: ["minecraft-vocab-1"], context: "月 + 豕" });
    expect(await store.markUsed(entry.id, "minecraft-vocab-1")).toEqual(updated); // once only
  });

  it("moves removed entries to the trash", async () => {
    const entry = await store.create({ word: "村人", reading: "むらびと", meaning: "villager" });
    expect(await store.remove(entry.id)).toEqual({ trashedAs: `vocab/.trash/${entry.id}.yaml` });
    expect(await store.list()).toEqual([]);
    expect(readdirSync(join(notesDir, "vocab", ".trash"))).toEqual([`${entry.id}.yaml`]);
    await expect(store.remove(entry.id)).rejects.toThrow(VocabError);
  });

  it("refuses ids that aren't entries", async () => {
    await expect(store.get("../notes/x")).rejects.toMatchObject({ code: "invalid-id" });
  });

  it("reads hand-edited files with numbers and empty fields", async () => {
    mkdirSync(join(notesDir, "vocab"), { recursive: true });
    writeFileSync(join(notesDir, "vocab", "20261028-090000-abcd.yaml"), "word: 100\nreading: ひゃく\nmeaning:\nexample:\nadded: x\n");
    expect(await store.list()).toEqual([
      { id: "20261028-090000-abcd", word: "100", reading: "ひゃく", meaning: "", added: "x", used: [] },
    ]);
  });
});

it("serializeVocab writes used as a flow list", () => {
  expect(
    serializeVocab({ id: "x", word: "牛", reading: "うし", meaning: "cow", added: "2026-10-28T09:00:00.000Z", used: ["a", "b"] }),
  ).toBe("word: 牛\nreading: うし\nmeaning: cow\nadded: 2026-10-28T09:00:00.000Z\nused: [ a, b ]\n");
});
