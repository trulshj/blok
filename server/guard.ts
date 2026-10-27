import type { MiddlewareHandler } from "hono";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * blok only listens on 127.0.0.1, but any web page open in the same browser can still send
 * requests to it. This keeps those out:
 * - The Host header must be local. That blocks DNS-rebinding pages that point their own domain at
 *   127.0.0.1. (In dev, Vite checks this before proxying and then rewrites Host to the API's address.)
 * - Writes must come from blok's own UI origin, a local host on `uiPort`, or carry no Origin and be
 *   JSON (curl, tests). That blocks other sites, and other local apps on other ports, from posting.
 */
export function localOnly(uiPort: () => number): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header("host") ?? "";
    if (!LOCAL_HOSTNAMES.has(host.replace(/:\d+$/, ""))) {
      return c.json({ error: "Forbidden host" }, 403);
    }

    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header("origin");
      const allowed = origin ? isBlokOrigin(origin, uiPort()) : isJson(c.req.header("content-type"));
      if (!allowed) return c.json({ error: "Cross-origin request blocked" }, 403);
    }

    await next();
  };
}

function isBlokOrigin(origin: string, port: number): boolean {
  try {
    const url = new URL(origin);
    return LOCAL_HOSTNAMES.has(url.hostname) && url.port === String(port);
  } catch {
    return false; // e.g. "null" from sandboxed frames
  }
}

function isJson(contentType: string | undefined): boolean {
  return contentType?.split(";")[0]?.trim() === "application/json";
}
