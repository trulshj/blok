import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNoteStore, type NoteStore } from "../notes/store.ts";
import { tempCheckout } from "../testing.ts";
import { createPublisher, PublishError, type Publisher } from "./publisher.ts";

// A throwaway "truls.dev" repo with a bare "GitHub", plus a notes folder. Everything is local.
vi.setConfig({ testTimeout: 30_000 });

let checkout: ReturnType<typeof tempCheckout>;
let site: string;
let remote: string;
let store: NoteStore;
let publisher: Publisher;
let notesDir: string;

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
const read = (path: string) => readFileSync(join(site, path), "utf8");
const write = (dir: string, path: string, text: string | Buffer) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const configure = (dir: string, name: string) => {
  for (const [k, v] of [["user.name", name], ["user.email", "truls@example.com"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) {
    git(dir, "config", k!, v!);
  }
};

const EXISTING_POST = `---
title: "Så eh, hva er visualisering?"
pubDate: 2025-06-10
excerpt: "En intro."
isDraft: true
type: longread
lang: no
status: budding
tags: ["visualisering", "studie"]
---

Et av de vanligste spørsmålene.
`;

beforeEach(async () => {
  checkout = tempCheckout();
  remote = join(checkout.parent, "truls.dev.git");
  site = join(checkout.parent, "truls.dev");
  notesDir = join(checkout.parent, "blok-notes");
  mkdirSync(join(notesDir, "notes"), { recursive: true });

  mkdirSync(site);
  git(site, "init", "-q", "-b", "main");
  configure(site, "Truls");
  write(site, "src/content/garden/hva-er-visualisering.md", EXISTING_POST);
  write(site, "README.md", "# truls.dev\n");
  git(site, "add", "-A");
  git(site, "commit", "-q", "-m", "Initial");
  git(checkout.parent, "clone", "-q", "--bare", site, remote);
  git(site, "remote", "add", "origin", remote);
  git(site, "fetch", "-q", "origin");
  git(site, "branch", "-q", "--set-upstream-to=origin/main", "main");

  store = createNoteStore(notesDir, { now: () => new Date("2026-10-28T09:00:00Z") });
  publisher = createPublisher({ siteDir: site, store, now: () => new Date(2026, 9, 28, 10, 0) });

  await store.create({ title: "Kyoto alley", type: "art", lang: "en", tags: ["blender"], body: "Lanterns.\n\n![render](./render.avif)\n" });
  await store.addFile("kyoto-alley", "render", "avif", new Uint8Array([1, 2, 3]));
});
afterEach(() => checkout.cleanup());

const remoteFiles = () => git(remote, "ls-tree", "-r", "--name-only", "main").split("\n");
const remoteLog = () => git(remote, "log", "--format=%s", "main").split("\n");

describe("preview", () => {
  it("shows what a first publish would write", async () => {
    const preview = await publisher.preview("kyoto-alley");
    expect(preview).toMatchObject({
      state: "new",
      slug: "kyoto-alley",
      file: "src/content/garden/kyoto-alley.md",
      url: "https://truls.dev/garden/kyoto-alley",
      images: ["public/images/garden/kyoto-alley/render.avif"],
      warnings: [],
    });
    expect(preview.frontmatter).toContain("pubDate: 2026-10-28");
    expect(existsSync(join(site, "src/content/garden/kyoto-alley.md"))).toBe(false); // nothing written
  });
});

describe("publish", () => {
  it("writes the post and images, commits only them, and pushes", async () => {
    write(site, "README.md", "# truls.dev, edited by hand\n"); // other work in truls.dev
    write(site, "notes-to-self.txt", "untracked");

    const result = await publisher.publish("kyoto-alley");

    expect(result).toMatchObject({ url: "https://truls.dev/garden/kyoto-alley", pushed: true, pushError: null });
    expect(result.commit).toMatch(/^[0-9a-f]{7,}$/);
    expect(read("src/content/garden/kyoto-alley.md")).toContain("![render](/images/garden/kyoto-alley/render.avif)");
    expect(remoteFiles()).toEqual(
      expect.arrayContaining(["src/content/garden/kyoto-alley.md", "public/images/garden/kyoto-alley/render.avif"]),
    );
    expect(remoteLog()[0]).toBe("Publish Kyoto alley");

    // the hand edits weren't committed (nothing staged either), and are still there
    expect(git(site, "status", "--porcelain").split("\n").map((l) => l.trim())).toEqual(["M README.md", "?? notes-to-self.txt"]);
    expect(git(site, "diff", "--cached", "--name-only")).toBe("");

    // the note remembers, without counting as an edit
    const note = await store.get("kyoto-alley");
    expect(note.meta.published).toMatchObject({ slug: "kyoto-alley", file: "src/content/garden/kyoto-alley.md", pubDate: "2026-10-28", draft: false });
    expect(note.meta.updated).toBe("2026-10-28T09:00:00.000Z");
  });

  it("updates, keeps the first pubDate, and skips the commit when nothing changed", async () => {
    await publisher.publish("kyoto-alley");
    const note = await store.get("kyoto-alley");
    await store.update("kyoto-alley", { meta: { ...note.meta, title: "Kyoto alley at night" }, body: note.body });

    expect((await publisher.preview("kyoto-alley")).state).toBe("update");
    // a publisher whose clock says a week later
    const second = await createPublisher({ siteDir: site, store, now: () => new Date(2026, 10, 2) }).publish("kyoto-alley");
    expect(remoteLog()[0]).toBe("Update Kyoto alley at night");
    expect(second.published.pubDate).toBe("2026-10-28");

    const third = await publisher.publish("kyoto-alley");
    expect(third).toMatchObject({ commit: null, pushed: false });
  });

  it("removes images the post no longer uses", async () => {
    await publisher.publish("kyoto-alley");
    const note = await store.get("kyoto-alley");
    await store.update("kyoto-alley", { meta: note.meta, body: "No pictures now." });

    await publisher.publish("kyoto-alley");
    expect(existsSync(join(site, "public/images/garden/kyoto-alley/render.avif"))).toBe(false);
    expect(remoteFiles()).not.toContain("public/images/garden/kyoto-alley/render.avif");
  });

  it("switches to .mdx when the note starts using components, removing the .md", async () => {
    await publisher.publish("kyoto-alley");
    const note = await store.get("kyoto-alley");
    await store.update("kyoto-alley", { meta: note.meta, body: 'import VocabCard from "../../components/VocabCard.astro";\n\n<VocabCard word="松明" />' });

    await publisher.publish("kyoto-alley");
    expect(remoteFiles()).toContain("src/content/garden/kyoto-alley.mdx");
    expect(remoteFiles()).not.toContain("src/content/garden/kyoto-alley.md");
  });

  it("won't replace a post that was edited in truls.dev, unless forced", async () => {
    await publisher.publish("kyoto-alley");
    write(site, "src/content/garden/kyoto-alley.md", `${read("src/content/garden/kyoto-alley.md")}\nEdited by hand.\n`);

    expect((await publisher.preview("kyoto-alley")).warnings).toMatchObject([{ code: "edited", blocking: true }]);
    await expect(publisher.publish("kyoto-alley")).rejects.toMatchObject({ code: "edited" });
    expect(read("src/content/garden/kyoto-alley.md")).toContain("Edited by hand.");

    await publisher.publish("kyoto-alley", { force: true });
    expect(read("src/content/garden/kyoto-alley.md")).not.toContain("Edited by hand.");
  });

  it("won't take over a slug used by another post, unless forced", async () => {
    await store.create({ title: "Hva er visualisering" });
    await expect(publisher.publish("hva-er-visualisering")).rejects.toThrow(PublishError);
    expect(read("src/content/garden/hva-er-visualisering.md")).toBe(EXISTING_POST);
  });

  function pushFromLaptop() {
    const other = join(checkout.parent, "laptop");
    git(checkout.parent, "clone", "-q", "-c", "core.autocrlf=false", remote, other);
    configure(other, "Truls on laptop");
    write(other, "src/pages/new-page.astro", "---\n---\n<p>hi</p>\n");
    git(other, "add", "-A");
    git(other, "commit", "-q", "-m", "Add a page");
    git(other, "push", "-q");
  }

  it("catches up with the remote first when truls.dev is clean", async () => {
    pushFromLaptop();
    write(site, "notes-to-self.txt", "untracked files don't get in the way");

    const result = await publisher.publish("kyoto-alley");
    expect(result.pushed).toBe(true);
    expect(remoteLog().slice(0, 2)).toEqual(["Publish Kyoto alley", "Add a page"]);
  });

  it("leaves work in progress alone: commits, but asks to pull before pushing", async () => {
    pushFromLaptop();
    write(site, "README.md", "# work in progress\n");

    const result = await publisher.publish("kyoto-alley");
    expect(result).toMatchObject({ pushed: false });
    expect(result.pushError).toMatch(/1 newer commit .* uncommitted changes/);
    expect(read("README.md")).toBe("# work in progress\n");
    expect(git(site, "log", "-1", "--format=%s")).toBe("Publish Kyoto alley");
    expect(remoteLog()[0]).toBe("Add a page");
  });

  it("reports a failed push but keeps the commit and the record", async () => {
    git(site, "remote", "set-url", "origin", join(checkout.parent, "gone.git"));
    const result = await publisher.publish("kyoto-alley");
    expect(result.pushed).toBe(false);
    expect(result.pushError).toMatch(/Can't reach the remote/);
    expect(git(site, "log", "-1", "--format=%s")).toBe("Publish Kyoto alley");
    expect((await store.get("kyoto-alley")).meta.published).toBeDefined();
  });

  it("refuses when truls.dev isn't on main", async () => {
    git(site, "checkout", "-q", "-b", "redesign");
    await expect(publisher.publish("kyoto-alley")).rejects.toMatchObject({ code: "wrong-branch" });
  });
});

describe("unpublish", () => {
  it("marks the post as a draft, and publishing again brings it back", async () => {
    await publisher.publish("kyoto-alley");
    await publisher.unpublish("kyoto-alley");
    expect(read("src/content/garden/kyoto-alley.md")).toContain("isDraft: true");
    expect(remoteLog()[0]).toBe("Unpublish Kyoto alley");
    expect((await store.get("kyoto-alley")).meta.published?.draft).toBe(true);
    expect((await publisher.preview("kyoto-alley")).state).toBe("draft");

    await publisher.publish("kyoto-alley");
    expect(read("src/content/garden/kyoto-alley.md")).toContain("isDraft: false");
    expect(remoteLog()[0]).toBe("Publish Kyoto alley");
  });
});

describe("import", () => {
  it("lists garden posts that aren't in blok, imports them once, and can publish them back", async () => {
    expect(await publisher.importable()).toEqual([
      { file: "src/content/garden/hva-er-visualisering.md", slug: "hva-er-visualisering", title: "Så eh, hva er visualisering?", draft: true },
    ]);

    const imported = await publisher.importPosts();
    expect(imported).toEqual([{ slug: "hva-er-visualisering", title: "Så eh, hva er visualisering?" }]);

    const note = await store.get("hva-er-visualisering");
    expect(note.meta).toMatchObject({
      type: "longread",
      lang: "no",
      status: "budding",
      tags: ["visualisering", "studie"],
      excerpt: "En intro.",
      published: { slug: "hva-er-visualisering", file: "src/content/garden/hva-er-visualisering.md", pubDate: "2025-06-10", draft: true },
    });
    expect(note.body).toBe("Et av de vanligste spørsmålene.");
    expect(await publisher.importable()).toEqual([]);
    expect(await publisher.importPosts()).toEqual([]);

    // linked, so publishing it isn't blocked as an edit or a taken slug
    const preview = await publisher.preview("hva-er-visualisering");
    expect(preview.warnings).toEqual([]);
    expect(preview.state).toBe("draft");
  });
});
