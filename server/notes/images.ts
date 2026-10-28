import type { Context } from "hono";
import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
const MAX_EDGE = 2400;

/** Image files blok shows and serves from a note's folder. Plain names only: no spaces, no paths. */
export const IMAGE_FILE = /^[a-z0-9][a-z0-9._-]*\.(avif|png|jpe?g|webp|gif|svg)$/i;

export const IMAGE_TYPES: Record<string, string> = {
  avif: "image/avif",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

export class ImageError extends Error {}

/**
 * Converts an image to AVIF: at most 2400px on the long side (never enlarged), turned upright per EXIF,
 * and without the original metadata, so phone photos don't carry their GPS position into the notes repo.
 * Animated GIFs keep their first frame. SVGs become pixels, so no scripts end up in the notes folder.
 */
export async function toAvif(input: Uint8Array): Promise<{ data: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(input, { animated: false })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .avif({ quality: 62, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new ImageError("Can't read this image. PNG, JPEG, WebP, AVIF, TIFF, GIF and SVG work.");
  }
}

/** Width and height of an image file, or zeros if it can't be read. */
export async function imageSize(path: string): Promise<{ width: number; height: number }> {
  try {
    const { width = 0, height = 0 } = await sharp(path).metadata();
    return { width, height };
  } catch {
    return { width: 0, height: 0 };
  }
}

/**
 * Responds with an image file (already path-checked by the caller): ETag for cheap reloads,
 * nosniff, and for SVGs a CSP that stops scripts, since an SVG opened directly runs in blok's origin.
 */
export async function serveImage(c: Context, path: string): Promise<Response> {
  let info;
  try {
    info = await stat(path);
  } catch {
    return c.json({ error: "Not found" }, 404);
  }

  const etag = `"${info.size.toString(16)}-${Math.round(info.mtimeMs).toString(16)}"`;
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const headers: Record<string, string> = {
    "content-type": IMAGE_TYPES[ext] ?? "application/octet-stream",
    "cache-control": "no-cache",
    etag,
    "x-content-type-options": "nosniff",
  };
  if (ext === "svg") headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'";

  if (c.req.header("if-none-match") === etag) return c.body(null, 304, headers);
  return c.body(new Uint8Array(await readFile(path)), 200, headers);
}

/** Alt text from a file name: "Render_01-final.png" → "Render 01 final". */
export function altFromName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/[[\]]/g, "")
    .trim();
}
