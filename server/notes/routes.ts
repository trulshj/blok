import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { slugify } from "../../shared/slug.ts";
import { NOTE_LANGS, NOTE_STATUSES, NOTE_TYPES, type NoteImage, type UploadedImage } from "../../shared/types.ts";
import type { Catalog } from "./catalog.ts";
import { altFromName, IMAGE_FILE, imageSize, MAX_UPLOAD_BYTES, serveImage, toAvif } from "./images.ts";
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

export async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  const result = schema.safeParse(await c.req.json().catch(() => null));
  if (!result.success) throw new RequestError(400, z.prettifyError(result.error));
  return result.data;
}

/**
 * /api/notes and /api/search. `runtime()` is null until the notes folder is set up.
 * Writes refresh the catalog before answering, so the next list or search already includes them.
 */
export function registerNoteRoutes(app: Hono, runtime: () => { store: NoteStore; catalog: Catalog } | null) {
  const notes = () => {
    const r = runtime();
    if (!r) throw new RequestError(409, "Set up the notes folder first");
    return r;
  };

  app.get("/api/notes", async (c) => c.json({ notes: await notes().catalog.list() }));

  app.get("/api/search", async (c) => c.json({ results: await notes().catalog.search(c.req.query("q") ?? "") }));

  app.post("/api/notes", async (c) => {
    const input = await readJson(c, CreateInput);
    const { store, catalog } = notes();
    const note = await store.create(input);
    await catalog.refresh([note.slug]);
    return c.json(note, 201);
  });

  app.get("/api/notes/:slug", async (c) => c.json(await notes().store.get(c.req.param("slug"))));

  app.put("/api/notes/:slug", async (c) => {
    const input = await readJson(c, UpdateInput);
    const { store, catalog } = notes();
    const note = await store.update(c.req.param("slug"), input);
    await catalog.refresh([note.slug]);
    return c.json(note);
  });

  app.post("/api/notes/:slug/rename", async (c) => {
    const input = await readJson(c, RenameInput);
    const { store, catalog } = notes();
    const from = c.req.param("slug");
    const note = await store.rename(from, input.slug);
    await catalog.refresh([from, note.slug]);
    return c.json(note);
  });

  app.delete("/api/notes/:slug", async (c) => {
    const { store, catalog } = notes();
    const slug = c.req.param("slug");
    const result = await store.trash(slug);
    await catalog.refresh([slug]);
    return c.json(result);
  });

  // ---------- images in a note's folder ----------

  app.get("/api/notes/:slug/images", async (c) => {
    const { store } = notes();
    const slug = c.req.param("slug");
    const files = await store.listFiles(slug, IMAGE_FILE);
    const images: NoteImage[] = await Promise.all(
      files.map(async ({ file, bytes }) => ({
        file,
        src: `./${file}`,
        bytes,
        ...(await imageSize(store.filePath(slug, file, IMAGE_FILE))),
      })),
    );
    return c.json({ images });
  });

  // one image per request, sent as multipart form field "file"; converted to AVIF
  app.post(
    "/api/notes/:slug/images",
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) => c.json({ error: `Images can be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` }, 413),
    }),
    async (c) => {
      const { store } = notes();
      const slug = c.req.param("slug");
      const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
      const file = form.file;
      if (!(file instanceof File)) throw new RequestError(400, 'Send the image as a form field called "file"');

      const { data, width, height } = await toAvif(new Uint8Array(await file.arrayBuffer()));
      const base = slugify(file.name.replace(/\.[^.]+$/, ""), new Date(), "image");
      const name = await store.addFile(slug, base, "avif", data);
      const image: UploadedImage = {
        file: name,
        src: `./${name}`,
        width,
        height,
        bytes: data.length,
        markdown: `![${altFromName(file.name)}](./${name})`,
      };
      return c.json(image, 201);
    },
  );

  // the image files themselves, for previews and covers: /files/<slug>/<file>
  app.get("/files/:slug/:file", async (c) => {
    const { store } = notes();
    return serveImage(c, store.filePath(c.req.param("slug"), c.req.param("file"), IMAGE_FILE));
  });
}
