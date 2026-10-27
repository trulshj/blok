import type { Context, Hono } from "hono";
import { z } from "zod";
import { NOTE_LANGS, NOTE_STATUSES, NOTE_TYPES } from "../../shared/types.ts";
import type { NoteStore } from "./store.ts";

export class RequestError extends Error {
  status: 400 | 409;
  constructor(status: 400 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

const MetaInput = z.object({
  title: z.string().trim().min(1, "A note needs a title").max(200),
  titleJa: z.string().max(200).optional(),
  type: z.enum(NOTE_TYPES),
  lang: z.enum(NOTE_LANGS),
  status: z.enum(NOTE_STATUSES),
  tags: z.array(z.string().max(60)).max(40),
  excerpt: z.string().max(1000).optional(),
  image: z.object({ src: z.string().min(1).max(500), alt: z.string().max(500) }).optional(),
});

const Body = z.string().max(2_000_000);

const CreateInput = MetaInput.partial().extend({ title: MetaInput.shape.title, body: Body.optional() });
const UpdateInput = z.object({ meta: MetaInput, body: Body, baseUpdated: z.string().optional() });
const RenameInput = z.object({ slug: z.string().optional() });

async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  const result = schema.safeParse(await c.req.json().catch(() => null));
  if (!result.success) throw new RequestError(400, z.prettifyError(result.error));
  return result.data;
}

/** /api/notes routes. `store()` is null until the notes folder is set up. */
export function registerNoteRoutes(app: Hono, store: () => NoteStore | null) {
  const notes = () => {
    const s = store();
    if (!s) throw new RequestError(409, "Set up the notes folder first");
    return s;
  };

  app.get("/api/notes", async (c) => c.json({ notes: await notes().list() }));

  app.post("/api/notes", async (c) => {
    const input = await readJson(c, CreateInput);
    return c.json(await notes().create(input), 201);
  });

  app.get("/api/notes/:slug", async (c) => c.json(await notes().get(c.req.param("slug"))));

  app.put("/api/notes/:slug", async (c) => {
    const input = await readJson(c, UpdateInput);
    return c.json(await notes().update(c.req.param("slug"), input));
  });

  app.post("/api/notes/:slug/rename", async (c) => {
    const input = await readJson(c, RenameInput);
    return c.json(await notes().rename(c.req.param("slug"), input.slug));
  });

  app.delete("/api/notes/:slug", async (c) => c.json(await notes().trash(c.req.param("slug"))));
}
