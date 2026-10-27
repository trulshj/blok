import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_FILE, loadConfig } from "./config.ts";
import { createNotesFolder, SetupError, setupStatus } from "./setup.ts";
import { tempCheckout } from "./testing.ts";

let checkout: ReturnType<typeof tempCheckout>;
afterEach(() => checkout?.cleanup());

describe("setupStatus", () => {
  it("is not ready before the notes folder exists", () => {
    checkout = tempCheckout();
    const status = setupStatus(loadConfig(checkout.root));

    expect(status.ready).toBe(false);
    expect(status.config.source).toBe("defaults");
    expect(status.notes).toMatchObject({ raw: "../blok-notes", exists: false, isGitRepo: false });
    expect(status.trulsDev.exists).toBe(false);
  });
});

describe("createNotesFolder", () => {
  it("writes the config and creates the folder, .gitattributes and a git repo", async () => {
    checkout = tempCheckout();
    const config = await createNotesFolder(loadConfig(checkout.root), { notesDir: "../my-notes", gitInit: true });

    const notesDir = join(checkout.parent, "my-notes");
    expect(config.notesDir).toBe(notesDir);
    expect(existsSync(join(notesDir, "notes"))).toBe(true);
    expect(readFileSync(join(notesDir, ".gitattributes"), "utf8")).toContain("eol=lf");
    expect(existsSync(join(notesDir, ".git"))).toBe(true);
    expect(JSON.parse(readFileSync(join(checkout.root, CONFIG_FILE), "utf8")).notesDir).toBe("../my-notes");

    const status = setupStatus(config);
    expect(status.ready).toBe(true);
    expect(status.notes.isGitRepo).toBe(true);
  });

  it("skips git init when asked to", async () => {
    checkout = tempCheckout();
    const config = await createNotesFolder(loadConfig(checkout.root), { notesDir: "../plain-notes", gitInit: false });

    expect(setupStatus(config)).toMatchObject({ ready: true, notes: { isGitRepo: false } });
  });

  it("leaves an existing .gitattributes alone and can run twice", async () => {
    checkout = tempCheckout();
    const first = await createNotesFolder(loadConfig(checkout.root), { notesDir: "../again", gitInit: true });
    writeFileSync(join(first.notesDir, ".gitattributes"), "# mine\n");

    await createNotesFolder(loadConfig(checkout.root), { notesDir: "../again", gitInit: true });
    expect(readFileSync(join(first.notesDir, ".gitattributes"), "utf8")).toBe("# mine\n");
  });

  it("refuses to overwrite a broken config file", async () => {
    checkout = tempCheckout();
    writeFileSync(join(checkout.root, CONFIG_FILE), "not json");

    await expect(createNotesFolder(loadConfig(checkout.root), { notesDir: "../x", gitInit: false })).rejects.toThrow(
      SetupError,
    );
    expect(readFileSync(join(checkout.root, CONFIG_FILE), "utf8")).toBe("not json");
  });
});
