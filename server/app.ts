import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { BlokEvent } from "../shared/types.ts";
import { loadConfig, type Config } from "./config.ts";
import { createHub } from "./events.ts";
import { localOnly } from "./guard.ts";
import { createCatalog, type Catalog } from "./notes/catalog.ts";
import { registerJapaneseRoutes } from "./japanese/routes.ts";
import { ImageError } from "./notes/images.ts";
import { createPublisher, PublishError, type Publisher } from "./publish/publisher.ts";
import { registerPublishRoutes } from "./publish/routes.ts";
import { registerNoteRoutes, RequestError } from "./notes/routes.ts";
import { createNoteStore, NoteError, type NoteStore } from "./notes/store.ts";
import { watchFolder, watchNotes, type NotesWatcher } from "./notes/watch.ts";
import { createNotesFolder, SetupError, SetupInput, setupStatus } from "./setup.ts";
import { createSync, SyncError, type Sync } from "./sync.ts";
import { registerVocabRoutes } from "./vocab/routes.ts";
import { createVocabStore, VocabError, type VocabStore } from "./vocab/store.ts";

const NOTE_ERROR_STATUS = {
  "invalid-slug": 400,
  "invalid-file": 400,
  "not-found": 404,
  exists: 409,
  conflict: 409,
  unreadable: 409,
} as const;
const VOCAB_ERROR_STATUS = { "invalid-id": 400, "not-found": 404 } as const;
const HEARTBEAT_MS = 20_000;

export function createApp(root: string, { watch = false } = {}) {
  let config: Config = loadConfig(root);
  const hub = createHub();
  const app = new Hono();

  // The store, catalog and watcher for the current notes folder, created once setup is done
  // and replaced if the folder changes.
  type Runtime = {
    key: string;
    store: NoteStore;
    catalog: Catalog;
    sync: Sync;
    publisher: Publisher;
    siteDir: string;
    vocab: VocabStore;
    watchers: NotesWatcher[];
  };
  let runtime: Runtime | null = null;
  function notes(): Runtime | null {
    if (!setupStatus(config).ready) return null;
    const key = `${config.notesDir}|${config.trulsDevDir}`;
    if (runtime?.key !== key) {
      for (const w of runtime?.watchers ?? []) void w.close();
      const store = createNoteStore(config.notesDir);
      const catalog = createCatalog(store);
      const onChange = async (slugs: string[]) => {
        await catalog.refresh(slugs).catch((err) => console.error("Couldn't refresh notes:", err));
        hub.publish({ type: "notes", slugs });
      };
      const vocab = createVocabStore(config.notesDir);
      runtime = {
        key,
        store,
        catalog,
        sync: createSync(config.notesDir),
        publisher: createPublisher({ siteDir: config.trulsDevDir, store }),
        siteDir: config.trulsDevDir,
        vocab,
        watchers: watch
          ? [watchNotes(store.dir, onChange), watchFolder(vocab.dir, () => hub.publish({ type: "vocab" }))]
          : [],
      };
    }
    return runtime;
  }

  app.use("*", localOnly(() => config.port));

  app.onError((err, c) => {
    if (err instanceof NoteError) return c.json({ error: err.message, code: err.code }, NOTE_ERROR_STATUS[err.code]);
    if (err instanceof RequestError) return c.json({ error: err.message }, err.status);
    if (err instanceof ImageError) return c.json({ error: err.message }, 422);
    if (err instanceof PublishError) return c.json({ error: err.message, code: err.code }, 409);
    if (err instanceof VocabError) return c.json({ error: err.message, code: err.code }, VOCAB_ERROR_STATUS[err.code]);
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
  registerPublishRoutes(app, notes);
  registerJapaneseRoutes(app);
  registerVocabRoutes(app, notes);

  // git sync of the notes folder; ?fetch=1 also checks the remote (at most once a minute)
  const syncFor = () => {
    const r = notes();
    if (!r) throw new RequestError(409, "Set up the notes folder first");
    return r.sync;
  };

  app.get("/api/sync", async (c) => c.json(await syncFor().status({ fetch: c.req.query("fetch") === "1" })));

  app.post("/api/sync", async (c) => {
    const sync = syncFor();
    try {
      return c.json(await sync.sync());
    } catch (err) {
      if (!(err instanceof SyncError)) throw err;
      return c.json({ error: err.message, status: await sync.status() }, 409);
    }
  });

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
  app.all("/files/*", (c) => c.json({ error: "Not found" }, 404));
  app.all("/truls-public/*", (c) => c.json({ error: "Not found" }, 404));

  return {
    app,
    hub,
    notes,
    getConfig: () => config,
    close: async () => {
      await Promise.all((runtime?.watchers ?? []).map((w) => w.close()));
    },
  };
}
