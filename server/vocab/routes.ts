import type { Hono } from "hono";
import { z } from "zod";
import { readJson, RequestError } from "../notes/routes.ts";
import type { VocabStore } from "./store.ts";

const VocabInput = z.object({
  word: z.string().trim().min(1, "A word is needed").max(200),
  reading: z.string().max(200),
  meaning: z.string().max(1000),
  example: z.string().max(2000).optional(),
  translation: z.string().max(1000).optional(),
  context: z.string().max(4000).optional(),
  source: z.string().max(300).optional(),
  used: z.array(z.string().max(200)).max(500).optional(),
});

const UsedInput = z.object({ slug: z.string().min(1).max(200) });

/** The vocab inbox. */
export function registerVocabRoutes(app: Hono, runtime: () => { vocab: VocabStore } | null) {
  const store = () => {
    const r = runtime();
    if (!r) throw new RequestError(409, "Set up the notes folder first");
    return r.vocab;
  };

  app.get("/api/vocab", async (c) => c.json({ entries: await store().list() }));

  app.post("/api/vocab", async (c) => c.json(await store().create(await readJson(c, VocabInput)), 201));

  app.put("/api/vocab/:id", async (c) => c.json(await store().update(c.req.param("id"), await readJson(c, VocabInput))));

  app.post("/api/vocab/:id/used", async (c) => {
    const { slug } = await readJson(c, UsedInput);
    return c.json(await store().markUsed(c.req.param("id"), slug));
  });

  app.delete("/api/vocab/:id", async (c) => c.json(await store().remove(c.req.param("id"))));
}
