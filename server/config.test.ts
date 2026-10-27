import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_FILE, loadConfig, writeConfig } from "./config.ts";
import { tempCheckout } from "./testing.ts";

let checkout: ReturnType<typeof tempCheckout>;
afterEach(() => checkout?.cleanup());

function withConfig(contents: string) {
  checkout = tempCheckout();
  writeFileSync(join(checkout.root, CONFIG_FILE), contents);
  return checkout.root;
}

describe("loadConfig", () => {
  it("falls back to defaults when there is no config file", () => {
    checkout = tempCheckout();
    const config = loadConfig(checkout.root);

    expect(config.source).toBe("defaults");
    expect(config.error).toBeUndefined();
    expect(config.notesDir).toBe(join(checkout.parent, "blok-notes"));
    expect(config.trulsDevDir).toBe(join(checkout.parent, "truls.dev"));
    expect(config.port).toBe(4747);
  });

  it("resolves relative paths from the config file's folder and keeps absolute ones", () => {
    const absolute = resolve("/somewhere/else/notes");
    const root = withConfig(JSON.stringify({ notesDir: "notes-here", trulsDevDir: absolute, port: 5000 }));
    const config = loadConfig(root);

    expect(config.source).toBe("file");
    expect(config.notesDir).toBe(join(root, "notes-here"));
    expect(config.trulsDevDir).toBe(absolute);
    expect(config.port).toBe(5000);
    expect(config.raw.notesDir).toBe("notes-here");
  });

  it("fills in missing keys with defaults", () => {
    const root = withConfig(JSON.stringify({ notesDir: "../my-notes" }));
    const config = loadConfig(root);

    expect(config.error).toBeUndefined();
    expect(config.port).toBe(4747);
    expect(config.raw.trulsDevDir).toBe("../truls.dev");
  });

  it("reports invalid JSON and uses the defaults", () => {
    const root = withConfig("{ notesDir: oops");
    const config = loadConfig(root);

    expect(config.source).toBe("file");
    expect(config.error).toMatch(/Not valid JSON/);
    expect(config.notesDir).toBe(join(checkout.parent, "blok-notes"));
  });

  it("reports values of the wrong type", () => {
    const root = withConfig(JSON.stringify({ port: "4747" }));
    expect(loadConfig(root).error).toMatch(/port/);
  });
});

describe("writeConfig", () => {
  it("creates the file from the defaults", () => {
    checkout = tempCheckout();
    writeConfig(loadConfig(checkout.root), { notesDir: "../elsewhere" });

    const written = JSON.parse(readFileSync(join(checkout.root, CONFIG_FILE), "utf8"));
    expect(written).toEqual({ notesDir: "../elsewhere", trulsDevDir: "../truls.dev", port: 4747 });
  });

  it("keeps the other values in an existing file", () => {
    const root = withConfig(JSON.stringify({ notesDir: "a", trulsDevDir: "b", port: 5000 }));
    writeConfig(loadConfig(root), { notesDir: "c" });

    expect(loadConfig(root).raw).toEqual({ notesDir: "c", trulsDevDir: "b", port: 5000 });
  });
});
