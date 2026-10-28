import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { tempCheckout } from "../testing.ts";
import { createNoteStore } from "./store.ts";
import { watchFolder, watchNotes, type NotesWatcher } from "./watch.ts";

// These use the real file system watcher, so they wait for real events.

let checkout: ReturnType<typeof tempCheckout>;
let dir: string;
let watcher: NotesWatcher;
let batches: string[][];

beforeEach(async () => {
  checkout = tempCheckout();
  dir = join(checkout.parent, "blok-notes", "notes");
  mkdirSync(dir, { recursive: true });
  batches = [];
  watcher = watchNotes(dir, (slugs) => batches.push(slugs), { debounceMs: 50 });
  await watcher.ready;
});

afterEach(async () => {
  await watcher.close();
  checkout.cleanup();
});

async function waitForBatch(timeoutMs = 3000): Promise<string[]> {
  const start = Date.now();
  while (batches.length === 0) {
    if (Date.now() - start > timeoutMs) throw new Error("No change event arrived");
    await new Promise((r) => setTimeout(r, 25));
  }
  return batches.shift()!;
}

it("reports a note written by another program", async () => {
  mkdirSync(join(dir, "from-editor"));
  writeFileSync(join(dir, "from-editor", "index.md"), "---\ntitle: From an editor\n---\n\nHi\n");

  expect(await waitForBatch()).toEqual(["from-editor"]);
});

it("reports blok's own writes, renames and trashing", async () => {
  const store = createNoteStore(join(dir, ".."));

  await store.create({ title: "Mine" });
  expect(await waitForBatch()).toEqual(["mine"]);

  await store.rename("mine", "ours");
  expect(await waitForBatch()).toEqual(["mine", "ours"]);

  await store.trash("ours");
  // under load, a late event from the rename can land in this batch too
  expect(await waitForBatch()).toContain("ours");
});

it("batches a burst of changes into one event", async () => {
  for (const slug of ["a", "b", "c"]) {
    mkdirSync(join(dir, slug));
    writeFileSync(join(dir, slug, "index.md"), `# ${slug}\n`);
  }
  expect(await waitForBatch()).toEqual(["a", "b", "c"]);
});

it("ignores .trash and temp files", async () => {
  mkdirSync(join(dir, ".trash", "old"), { recursive: true });
  writeFileSync(join(dir, ".trash", "old", "index.md"), "old\n");
  mkdirSync(join(dir, "real"));
  writeFileSync(join(dir, "real", "index.md.abc123.tmp"), "half");
  renameSync(join(dir, "real", "index.md.abc123.tmp"), join(dir, "real", "index.md"));

  // the folder and the file can arrive as separate batches; only "real" may ever show up
  const seen = new Set(await waitForBatch());
  await new Promise((r) => setTimeout(r, 400));
  for (const batch of batches) for (const slug of batch) seen.add(slug);
  expect([...seen]).toEqual(["real"]);
});

it("watchFolder creates the vocab folder and reports changes to it", async () => {
  const vocab = join(checkout.parent, "blok-notes", "vocab");
  let events = 0;
  const folder = watchFolder(vocab, () => events++, { debounceMs: 50 });
  await folder.ready;
  try {
    writeFileSync(join(vocab, "20261028-101500-ab12.yaml"), "word: 松明\n");
    const start = Date.now();
    while (events === 0 && Date.now() - start < 3000) await new Promise((r) => setTimeout(r, 25));
    expect(events).toBe(1);
  } finally {
    await folder.close();
  }
});
