import type { Hono } from "hono";
import { resolve, sep } from "node:path";
import { z } from "zod";
import type { Catalog } from "../notes/catalog.ts";
import { serveImage } from "../notes/images.ts";
import { readJson, RequestError } from "../notes/routes.ts";
import type { Publisher } from "./publisher.ts";

const PublishInput = z.object({ force: z.boolean().optional() });

// truls.dev's own images, e.g. /images/headshot-1.avif in imported posts
const SITE_IMAGE = /^images\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:avif|png|jpe?g|webp|gif|svg)$/i;

/** Publishing to truls.dev, importing its garden posts, and serving its public images for previews. */
export function registerPublishRoutes(app: Hono, runtime: () => { publisher: Publisher; catalog: Catalog; siteDir: string } | null) {
  const site = () => {
    const r = runtime();
    if (!r) throw new RequestError(409, "Set up the notes folder first");
    return r;
  };

  app.get("/api/notes/:slug/publish", async (c) => c.json(await site().publisher.preview(c.req.param("slug"))));

  app.post("/api/notes/:slug/publish", async (c) => {
    const { force } = await readJson(c, PublishInput);
    const { publisher, catalog } = site();
    const result = await publisher.publish(c.req.param("slug"), { force });
    await catalog.refresh([c.req.param("slug")]);
    return c.json(result);
  });

  app.post("/api/notes/:slug/unpublish", async (c) => {
    const { force } = await readJson(c, PublishInput);
    const { publisher, catalog } = site();
    const result = await publisher.unpublish(c.req.param("slug"), { force });
    await catalog.refresh([c.req.param("slug")]);
    return c.json(result);
  });

  app.get("/api/import/truls-dev", async (c) => c.json({ posts: await site().publisher.importable() }));

  app.post("/api/import/truls-dev", async (c) => {
    const { publisher, catalog } = site();
    const imported = await publisher.importPosts();
    await catalog.refresh(imported.map((note) => note.slug));
    return c.json({ imported });
  });

  app.get("/truls-public/*", async (c) => {
    const { siteDir } = site();
    let rel: string;
    try {
      rel = decodeURIComponent(c.req.path.slice("/truls-public/".length));
    } catch {
      return c.json({ error: "Not an image path" }, 400);
    }
    const publicDir = resolve(siteDir, "public");
    const path = resolve(publicDir, rel);
    if (!SITE_IMAGE.test(rel) || !path.startsWith(publicDir + sep) || rel.split("/").some((part) => part.startsWith("."))) {
      return c.json({ error: "Not an image path" }, 400);
    }
    return serveImage(c, path);
  });
}
