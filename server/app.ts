import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { BlokEvent } from "../shared/types.ts";
import { loadConfig, type Config } from "./config.ts";
import { createHub } from "./events.ts";
import { localOnly } from "./guard.ts";
import { createCatalog, type Catalog } from "./notes/catalog.ts";
import { registerNoteRoutes, RequestError } from "./notes/routes.ts";
import { createNoteStore, NoteError, type NoteStore } from "./notes/store.ts";
import { watchNotes, type NotesWatcher } from "./notes/watch.ts";
import { createNotesFolder, SetupError, SetupInput, setupStatus } from "./setup.ts";

const NOTE_ERROR_STATUS = { "invalid-slug": 400, "not-found": 404, exists: 409, conflict: 409, unreadable: 409 } as const;
const HEARTBEAT_MS = 20_000;

export function createApp(root: string, { watch = false } = {}) {
  let config: Config = loadConfig(root);
  const hub = createHub();
  const app = new Hono();

  // The store, catalog and watcher for the current notes folder, created once setup is done
  // and replaced if the folder changes.
  type Runtime = { dir: string; store: NoteStore; catalog: Catalog; watcher?: NotesWatcher };
  let runtime: Runtime | null = null;
  function notes(): Runtime | null {
    if (!setupStatus(config).ready) return null;
    if (runtime?.dir !== config.notesDir) {
      void runtime?.watcher?.close();
      const store = createNoteStore(config.notesDir);
      const catalog = createCatalog(store);
      const onChange = async (slugs: string[]) => {
        await catalog.refresh(slugs).catch((err) => console.error("Couldn't refresh notes:", err));
        hub.publish({ type: "notes", slugs });
      };
      runtime = { dir: config.notesDir, store, catalog, watcher: watch ? watchNotes(store.dir, onChange) : undefined };
    }
    return runtime;
  }

  app.use("*", localOnly(() => config.port));

  app.onError((err, c) => {
    if (err instanceof NoteError) return c.json({ error: err.message, code: err.code }, NOTE_ERROR_STATUS[err.code]);
    if (err instanceof RequestError) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: err.message }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/setup", (c) => {
    // re-read, so hand edits to blok.config.json show up without a restart
    config = loadConfig(root);
    return c.json(setupStatus(config));
  });

  app.post("/api/setup", async (c) => {
    const input = SetupInput.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: z.prettifyError(input.error) }, 400);

    try {
      config = await createNotesFolder(loadConfig(root), input.data);
    } catch (err) {
      const status = err instanceof SetupError ? 409 : 500;
      return c.json({ error: (err as Error).message }, status);
    }
    notes(); // start watching the new folder
    return c.json(setupStatus(config));
  });

  registerNoteRoutes(app, notes);

  // live updates: one "notes" event per batch of changed note folders
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      notes();
      const send = (event: BlokEvent | { type: "ready" | "ping" }) =>
        stream.writeSSE({ event: event.type, data: JSON.stringify(event) });

      const unsubscribe = hub.subscribe((event) => void send(event));
      const heartbeat = setInterval(() => void send({ type: "ping" }), HEARTBEAT_MS);
      await send({ type: "ready" });

      await new Promise<void>((done) =>
        stream.onAbort(() => {
          clearInterval(heartbeat);
          unsubscribe();
          done();
        }),
      );
    }),
  );

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  return {
    app,
    hub,
    notes,
    getConfig: () => config,
    close: async () => runtime?.watcher?.close(),
  };
}
