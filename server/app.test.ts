import { afterEach, describe, expect, it } from "vitest";
import type { SetupStatus } from "../shared/types.ts";
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

it("answers unknown API routes with JSON 404", async () => {
  const res = await setup().request("/api/nope", { headers: { host: HOST } });
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "Not found" });
});
