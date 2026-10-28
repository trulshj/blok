import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import type { Note, SetupStatus } from "../shared/types.ts";
import { createApp } from "./app.ts";
import { tempCheckout } from "./testing.ts";

let checkout: ReturnType<typeof tempCheckout>;
afterEach(() => checkout?.cleanup());

const HOST = "localhost:4747";

function setup() {
  checkout = tempCheckout();
  return createApp(checkout.root).app;
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: "POST",
    headers: { host: HOST, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

describe("GET /api/setup", () => {
  it("answers requests to a local host", async () => {
    const res = await setup().request("/api/setup", { headers: { host: HOST } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as SetupStatus).ready).toBe(false);
  });

  it("refuses other hosts (DNS rebinding)", async () => {
    const res = await setup().request("/api/setup", { headers: { host: "evil.example:4747" } });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/setup", () => {
  it("creates the notes folder for a same-origin request", async () => {
    const res = await setup().request("/api/setup", post({ notesDir: "../n", gitInit: false }, { origin: `http://${HOST}` }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as SetupStatus).ready).toBe(true);
  });

  it("accepts the UI origin when the dev proxy has rewritten Host to the API port", async () => {
    const res = await setup().request(
      "/api/setup",
      post({ notesDir: "../n", gitInit: false }, { host: "127.0.0.1:4748", origin: "http://localhost:4747" }),
    );
    expect(res.status).toBe(200);
  });

  it("refuses requests from another origin", async () => {
    const res = await setup().request("/api/setup", post({ notesDir: "../n" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("refuses other local apps on other ports", async () => {
    const res = await setup().request("/api/setup", post({ notesDir: "../n" }, { origin: "http://localhost:3000" }));
    expect(res.status).toBe(403);
  });

  it("refuses non-JSON requests without an Origin", async () => {
    const res = await setup().request("/api/setup", {
      method: "POST",
      headers: { host: HOST, "content-type": "text/plain" },
      body: JSON.stringify({ notesDir: "../n" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects an empty folder name", async () => {
    const res = await setup().request("/api/setup", post({ notesDir: "  " }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Pick a folder/);
  });
});

describe("/api/notes", () => {
  async function ready() {
    const blok = (checkout = tempCheckout(), createApp(checkout.root));
    await blok.app.request("/api/setup", post({ notesDir: "../notes", gitInit: false }));
    return blok.app;
  }
  const get = { headers: { host: HOST } };
  const send = (method: string, body: unknown) => ({ ...post(body), method });

  it("asks for setup before the notes folder exists", async () => {
    const res = await setup().request("/api/notes", get);
    expect(res.status).toBe(409);
  });

  it("creates, reads, updates, renames and trashes a note", async () => {
    const app = await ready();

    const created = await app.request("/api/notes", post({ title: "Kyoto alley", body: "Lanterns" }));
    expect(created.status).toBe(201);
    const note = (await created.json()) as Note;
    expect(note.slug).toBe("kyoto-alley");

    const list = (await (await app.request("/api/notes", get)).json()) as { notes: Note[] };
    expect(list.notes.map((n) => n.slug)).toEqual(["kyoto-alley"]);

    const updated = await app.request(
      "/api/notes/kyoto-alley",
      send("PUT", { meta: { ...note.meta, title: "Kyoto alley at night", tags: ["Blender"] }, body: "More lanterns" }),
    );
    expect(((await updated.json()) as Note).meta.tags).toEqual(["blender"]);

    const renamed = await app.request("/api/notes/kyoto-alley/rename", post({}));
    expect(((await renamed.json()) as Note).slug).toBe("kyoto-alley-at-night");

    const read = (await (await app.request("/api/notes/kyoto-alley-at-night", get)).json()) as Note;
    expect(read.body).toBe("More lanterns");

    const trashed = await app.request("/api/notes/kyoto-alley-at-night", send("DELETE", {}));
    expect(await trashed.json()).toEqual({ trashedAs: ".trash/kyoto-alley-at-night" });
    expect((await app.request("/api/notes/kyoto-alley-at-night", get)).status).toBe(404);
  });

  it("rejects bad input and paths outside the notes folder", async () => {
    const app = await ready();
    expect((await app.request("/api/notes", post({ title: "" }))).status).toBe(400);
    expect((await app.request("/api/notes", post({ title: "x", type: "poem" }))).status).toBe(400);
    expect((await app.request("/api/notes/..%2F..%2Fblok", get)).status).toBe(400);
    expect((await app.request("/api/notes/.trash", get)).status).toBe(400);
  });

  it("lists and searches notes, including ones just created", async () => {
    const app = await ready();
    await app.request("/api/notes", post({ title: "Kyoto alley", body: "提灯と暖簾" }));
    await app.request("/api/notes", post({ title: "Shoji", body: "Geometry nodes" }));

    const list = (await (await app.request("/api/notes", get)).json()) as { notes: Note[] };
    expect(list.notes.map((n) => n.slug)).toEqual(["shoji", "kyoto-alley"]);
    expect(list.notes[1]?.preview).toBe("提灯と暖簾");

    const search = async (q: string) =>
      ((await (await app.request(`/api/search?q=${encodeURIComponent(q)}`, get)).json()) as { results: { slug: string }[] })
        .results.map((r) => r.slug);
    expect(await search("暖簾")).toEqual(["kyoto-alley"]);
    expect(await search("geom")).toEqual(["shoji"]);
    expect(await search("")).toEqual([]);
  });

  it("returns 409 with a code when a save would clobber a newer change", async () => {
    const app = await ready();
    const note = (await (await app.request("/api/notes", post({ title: "Shared" }))).json()) as Note;
    const save = (baseUpdated: string) =>
      app.request("/api/notes/shared", send("PUT", { meta: note.meta, body: "x", baseUpdated }));

    expect((await save(note.meta.updated)).status).toBe(200);
    const stale = await save(note.meta.updated);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "conflict" });
  });
});

describe("images", () => {
  const ORIGIN = { host: HOST, origin: `http://${HOST}` };

  async function withNote() {
    checkout = tempCheckout();
    const { app } = createApp(checkout.root);
    await app.request("/api/setup", post({ notesDir: "../notes", gitInit: false }));
    await app.request("/api/notes", post({ title: "Kyoto alley" }));
    return app;
  }

  async function upload(app: ReturnType<typeof createApp>["app"], file: Blob, name: string, headers: Record<string, string> = ORIGIN) {
    const form = new FormData();
    form.append("file", file, name);
    return app.request("/api/notes/kyoto-alley/images", { method: "POST", headers, body: form });
  }

  const png = async () =>
    new Blob([
      new Uint8Array(
        await sharp({ create: { width: 3000, height: 1500, channels: 3, background: "#2E4A87" } })
          .png()
          .toBuffer(),
      ),
    ]);

  it("converts an upload to AVIF, lists it and serves it", async () => {
    const app = await withNote();
    const res = await upload(app, await png(), "Render 01.png");
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      file: "render-01.avif",
      src: "./render-01.avif",
      width: 2400,
      height: 1200,
      markdown: "![Render 01](./render-01.avif)",
    });

    const list = (await (await app.request("/api/notes/kyoto-alley/images", { headers: { host: HOST } })).json()) as {
      images: { file: string; width: number }[];
    };
    expect(list.images).toMatchObject([{ file: "render-01.avif", width: 2400 }]);

    const file = await app.request("/files/kyoto-alley/render-01.avif", { headers: { host: HOST } });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/avif");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    const etag = file.headers.get("etag")!;
    expect((await app.request("/files/kyoto-alley/render-01.avif", { headers: { host: HOST, "if-none-match": etag } })).status).toBe(304);
  });

  it("names Japanese-only uploads by time", async () => {
    const app = await withNote();
    const res = await upload(app, await png(), "スクリーンショット.png");
    expect(((await res.json()) as { file: string }).file).toMatch(/^image-\d{8}-\d{4}\.avif$/);
  });

  it("explains files it can't read, or a missing file", async () => {
    const app = await withNote();
    const bad = await upload(app, new Blob(["hello"]), "notes.txt");
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { error: string }).error).toMatch(/Can't read this image/);

    const none = await app.request("/api/notes/kyoto-alley/images", { method: "POST", headers: ORIGIN, body: new FormData() });
    expect(none.status).toBe(400);
  });

  it("refuses uploads from other sites", async () => {
    const app = await withNote();
    const res = await upload(app, await png(), "x.png", { host: HOST, origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  it("serves only plain image names from the note's folder", async () => {
    const app = await withNote();
    for (const path of ["/files/kyoto-alley/index.md", "/files/kyoto-alley/..%2F..%2Fblok.config.json", "/files/..%2Fnotes/x.avif"]) {
      expect((await app.request(path, { headers: { host: HOST } })).status).toBe(400);
    }
    expect((await app.request("/files/kyoto-alley/missing.avif", { headers: { host: HOST } })).status).toBe(404);
  });

  it("serves SVGs placed by hand with scripts switched off", async () => {
    const app = await withNote();
    writeFileSync(join(checkout.parent, "notes", "notes", "kyoto-alley", "map.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
    const res = await app.request("/files/kyoto-alley/map.svg", { headers: { host: HOST } });
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  });
});

describe("/api/events", () => {
  it("streams note events to the browser", async () => {
    checkout = tempCheckout();
    const blok = createApp(checkout.root);
    const controller = new AbortController();
    const res = await blok.app.request("/api/events", { headers: { host: HOST }, signal: controller.signal });
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const next = async () => decoder.decode((await reader.read()).value);

    expect(await next()).toContain("event: ready");
    blok.hub.publish({ type: "notes", slugs: ["kyoto-alley"] });
    const chunk = await next();
    expect(chunk).toContain("event: notes");
    expect(chunk).toContain('"slugs":["kyoto-alley"]');

    await reader.cancel();
    controller.abort();
  });
});

it("answers unknown API routes with JSON 404", async () => {
  const res = await setup().request("/api/nope", { headers: { host: HOST } });
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "Not found" });
});
