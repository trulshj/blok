import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempCheckout } from "../testing.ts";
import { createCatalog, searchText, tokenize, type Catalog } from "./catalog.ts";
import { createNoteStore, type NoteStore } from "./store.ts";

describe("tokenize", () => {
  it("splits Japanese runs into characters and pairs", () => {
    expect(tokenize("暖簾")).toEqual(["暖", "暖簾", "簾"]);
    expect(tokenize("提灯と")).toEqual(["提", "提灯", "灯", "灯と", "と"]);
  });

  it("separates Japanese from Latin text in the same word", () => {
    expect(tokenize("Minecraftで")).toEqual(["minecraft", "で"]);
  });

  it("folds accents, full-width letters and punctuation", () => {
    expect(tokenize("Pontochō, Ærlig! ＫＹＯＴＯ #1 geometry-nodes")).toEqual([
      "pontocho",
      "aerlig",
      "kyoto",
      "1",
      "geometry",
      "nodes",
    ]);
  });
});

describe("searchText", () => {
  it("reads through furigana and highlights, and adds the readings", () => {
    expect(searchText('{洞窟|どうくつ}の中に{松明}を置く <VocabCard example="{牛|うし}を" />')).toBe(
      '洞窟の中に松明を置く <VocabCard example="牛を" />\nどうくつ うし',
    );
    expect(searchText("No readings {here}")).toBe("No readings here");
  });
});

describe("catalog", () => {
  let checkout: ReturnType<typeof tempCheckout>;
  let store: NoteStore;
  let catalog: Catalog;
  let notes: string;

  beforeEach(async () => {
    checkout = tempCheckout();
    const notesDir = join(checkout.parent, "blok-notes");
    notes = join(notesDir, "notes");
    mkdirSync(notes, { recursive: true });
    store = createNoteStore(notesDir);
    await store.create({ title: "Kyoto alley blockout", type: "art", tags: ["blender", "kyoto"], body: "Pontochō at night. 提灯と暖簾。" });
    await store.create({ title: "Minecraft で覚えた言葉 #1", tags: ["japanese"], body: "松明 is a torch." });
    await store.create({ title: "Hva er visualisering?", lang: "no", body: "Et forsøk på å svare. Mentions Kyoto once." });
    catalog = createCatalog(store);
  });
  afterEach(() => checkout.cleanup());

  const search = async (q: string) => (await catalog.search(q)).map((r) => r.slug);

  it("lists notes with previews", async () => {
    const list = await catalog.list();
    expect(list.map((n) => n.slug).sort()).toEqual(["hva-er-visualisering", "kyoto-alley-blockout", "minecraft-1"]);
    expect(list.find((n) => n.slug === "minecraft-1")?.preview).toBe("松明 is a torch.");
  });

  it("finds words anywhere, ranking title matches first", async () => {
    expect(await search("kyoto")).toEqual(["kyoto-alley-blockout", "hva-er-visualisering"]);
  });

  it("matches word starts, folded accents and every word of the query", async () => {
    expect(await search("blocko")).toEqual(["kyoto-alley-blockout"]);
    expect(await search("pontocho")).toEqual(["kyoto-alley-blockout"]);
    expect(await search("kyoto night")).toEqual(["kyoto-alley-blockout"]);
    expect(await search("forsok")).toEqual(["hva-er-visualisering"]);
  });

  it("finds Japanese words inside longer runs", async () => {
    expect(await search("暖簾")).toEqual(["kyoto-alley-blockout"]);
    expect(await search("松明")).toEqual(["minecraft-1"]);
    expect(await search("覚えた")).toEqual(["minecraft-1"]);
    expect(await search("暖明")).toEqual([]);
  });

  it("searches tags", async () => {
    expect(await search("japanese")).toEqual(["minecraft-1"]);
  });

  it("returns nothing for an empty query", async () => {
    expect(await catalog.search("   ")).toEqual([]);
  });

  it("picks up changes, new notes and removals on refresh", async () => {
    await catalog.list(); // build

    await store.update("minecraft-1", {
      meta: { title: "Minecraft vocab", type: "note", lang: "en", status: "budding", tags: [] },
      body: "Now about creepers.",
    });
    mkdirSync(join(notes, "from-the-mac"));
    writeFileSync(join(notes, "from-the-mac", "index.md"), "---\ntitle: Written on the Mac\n---\n\nCreepers again.\n");
    rmSync(join(notes, "hva-er-visualisering"), { recursive: true });

    await catalog.refresh(["minecraft-1", "from-the-mac", "hva-er-visualisering"]);

    expect((await catalog.list()).map((n) => n.slug).sort()).toEqual(["from-the-mac", "kyoto-alley-blockout", "minecraft-1"]);
    expect((await search("creepers")).sort()).toEqual(["from-the-mac", "minecraft-1"]);
    expect(await search("松明")).toEqual([]);
    expect(await search("forsok")).toEqual([]);
  });
});
