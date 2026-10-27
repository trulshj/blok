import { Hono } from "hono";
import { z } from "zod";
import { loadConfig, type Config } from "./config.ts";
import { localOnly } from "./guard.ts";
import { createNotesFolder, SetupError, SetupInput, setupStatus } from "./setup.ts";

export function createApp(root: string) {
  let config: Config = loadConfig(root);
  const app = new Hono();

  app.use("*", localOnly(() => config.port));

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
    return c.json(setupStatus(config));
  });

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  return { app, getConfig: () => config };
}
