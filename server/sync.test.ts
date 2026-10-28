import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSync, commitMessage, SyncError } from "./sync.ts";
import { tempCheckout } from "./testing.ts";

// A "GitHub" (bare repo) with a PC and a Mac working on the same notes. Everything is local.
// Each sync runs a dozen git processes, which start slowly on Windows, hence the longer timeout.
vi.setConfig({ testTimeout: 30_000 });

let checkout: ReturnType<typeof tempCheckout>;
let remote: string;

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

/**
 * A notes folder with its own identity, whatever the global config says: no commit signing, and no
 * line-ending conversion (the real notes repo gets that from its .gitattributes).
 */
function machine(name: string, { clone = false } = {}): string {
  const dir = join(checkout.parent, name);
  if (clone) git(checkout.parent, "clone", "-q", "-c", "core.autocrlf=false", remote, name);
  else {
    mkdirSync(dir);
    git(dir, "init", "-q", "-b", "main");
    git(dir, "config", "core.autocrlf", "false");
  }
  git(dir, "config", "user.name", `Truls on ${name}`);
  git(dir, "config", "user.email", "truls@example.com");
  git(dir, "config", "commit.gpgsign", "false");
  return dir;
}

function write(dir: string, path: string, text: string) {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
}

beforeEach(() => {
  checkout = tempCheckout();
  remote = join(checkout.parent, "remote.git");
  git(checkout.parent, "init", "-q", "--bare", "-b", "main", remote);
});
afterEach(() => checkout.cleanup());

describe("status", () => {
  it("knows a folder without git", async () => {
    const dir = join(checkout.parent, "plain");
    mkdirSync(dir);
    expect((await createSync(dir).status()).state).toBe("not-repo");
    await expect(createSync(dir).sync()).rejects.toThrow(SyncError);
  });

  it("counts changed files and ignores temp files and OS clutter", async () => {
    const pc = machine("pc");
    write(pc, "notes/kyoto/index.md", "# Kyoto\n");
    write(pc, "notes/kyoto/index.md.ab12cd34.tmp", "half");
    write(pc, "notes/.DS_Store", "x");
    expect(await createSync(pc).status()).toMatchObject({ state: "no-remote", changed: 1 });
  });
});

describe("sync", () => {
  it("commits locally when there's no remote", async () => {
    const pc = machine("pc");
    write(pc, "notes/kyoto/index.md", "# Kyoto\n");
    const result = await createSync(pc).sync();

    expect(result).toMatchObject({ committed: 1, pulled: 0, pushed: 0, status: { state: "no-remote", changed: 0 } });
    expect(git(pc, "log", "--format=%s")).toBe("blok: kyoto");
  });

  it("pushes the first time, setting the upstream", async () => {
    const pc = machine("pc");
    git(pc, "remote", "add", "origin", remote);
    write(pc, "notes/kyoto/index.md", "# Kyoto\n");
    write(pc, "notes/kyoto/index.md.ab12cd34.tmp", "half");

    const result = await createSync(pc).sync();
    expect(result).toMatchObject({ committed: 1, pushed: 1, status: { state: "clean", upstream: "origin/main" } });
    expect(git(remote, "ls-tree", "-r", "--name-only", "main")).toBe("notes/kyoto/index.md"); // no .tmp
  });

  it("brings the Mac's notes to the PC and the PC's to the Mac", async () => {
    const pc = machine("pc");
    git(pc, "remote", "add", "origin", remote);
    write(pc, "notes/kyoto/index.md", "# Kyoto\n");
    let clock = new Date("2026-10-28T09:00:00Z");
    const pcSync = createSync(pc, { now: () => clock });
    await pcSync.sync();

    const mac = machine("mac", { clone: true });
    write(mac, "notes/from-mac/index.md", "# Written on the Mac\n");
    await createSync(mac).sync();

    // within a minute of the last fetch, status doesn't fetch again
    write(pc, "notes/kyoto/index.md", "# Kyoto at night\n");
    expect(await pcSync.status({ fetch: true })).toMatchObject({ state: "changes", behind: 0 });

    // later it does, and sees the Mac's commit coming next to its own edit
    clock = new Date("2026-10-28T09:02:00Z");
    expect(await pcSync.status({ fetch: true })).toMatchObject({ state: "diverged", changed: 1, behind: 1 });

    const result = await pcSync.sync();
    expect(result).toMatchObject({ committed: 1, pulled: 1, pushed: 1, status: { state: "clean", ahead: 0, behind: 0 } });
    expect(readFileSync(join(pc, "notes/from-mac/index.md"), "utf8")).toBe("# Written on the Mac\n");

    await createSync(mac).sync();
    expect(readFileSync(join(mac, "notes/kyoto/index.md"), "utf8")).toBe("# Kyoto at night\n");
  });

  it("undoes a conflicting rebase, keeps both sides' commits and explains", async () => {
    const pc = machine("pc");
    git(pc, "remote", "add", "origin", remote);
    write(pc, "notes/kyoto/index.md", "# Kyoto\n");
    await createSync(pc).sync();
    const mac = machine("mac", { clone: true });

    write(mac, "notes/kyoto/index.md", "# Kyoto, the Mac's version\n");
    await createSync(mac).sync();
    write(pc, "notes/kyoto/index.md", "# Kyoto, the PC's version\n");

    const pcSync = createSync(pc);
    const error = await pcSync.sync().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(SyncError);
    expect((error as Error).message).toMatch(/^kyoto changed both here and in origin\/main/);
    expect((error as Error).message).toContain("git pull --rebase");

    // clean folder, the PC's text still there, its commit kept, and the error remembered
    expect(git(pc, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(pc, "notes/kyoto/index.md"), "utf8")).toBe("# Kyoto, the PC's version\n");
    expect(await pcSync.status()).toMatchObject({ state: "diverged", ahead: 1, behind: 1, error: (error as Error).message });
  });

  it("refuses to run while a rebase is unfinished", async () => {
    const pc = machine("pc");
    write(pc, "notes/kyoto/index.md", "# Kyoto\n");
    await createSync(pc).sync();
    mkdirSync(join(pc, ".git", "rebase-merge"));
    await expect(createSync(pc).sync()).rejects.toThrow(/unfinished/);
  });

  it("explains a remote it can't reach", async () => {
    const pc = machine("pc");
    git(pc, "remote", "add", "origin", join(checkout.parent, "does-not-exist.git"));
    write(pc, "notes/kyoto/index.md", "# Kyoto\n");
    const error = await createSync(pc).sync().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(SyncError);
    expect(git(pc, "log", "--format=%s")).toBe("blok: kyoto"); // committed before failing
  });
});

describe("commitMessage", () => {
  it("names the notes and the machine", () => {
    const message = commitMessage(["notes/kyoto/index.md", "notes/kyoto/render.avif", "notes/minecraft-vocab-1/index.md"]);
    expect(message.split("\n")[0]).toBe("blok: kyoto, minecraft-vocab-1");
    expect(message).toMatch(/Synced from \S+/);
  });

  it("shortens long lists and mentions the trash", () => {
    const files = ["a", "b", "c", "d"].map((n) => `notes/${n}/index.md`).concat("notes/.trash/old/index.md");
    expect(commitMessage(files).split("\n")[0]).toBe("blok: a, b and 2 more; trash old");
  });

  it("counts files outside notes/", () => {
    expect(commitMessage([".gitattributes"]).split("\n")[0]).toBe("blok: 1 file");
  });
});
