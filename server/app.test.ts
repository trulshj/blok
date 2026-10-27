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
