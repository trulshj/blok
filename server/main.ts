import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { resolve } from "node:path";
import { createApp } from "./app.ts";

// npm run dev:   Vite serves the UI on the config port and proxies /api to this server on port + 1.
// npm start:     this server serves the built UI from dist/ and the API on the config port.
const dev = process.argv.includes("--dev");
const serveClient = process.argv.includes("--serve-client");

const root = resolve(import.meta.dirname, "..");
process.chdir(root);

const { app, getConfig } = createApp(root);

if (serveClient) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

const port = getConfig().port + (dev ? 1 : 0);

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(dev ? `blok api on http://127.0.0.1:${port}` : `blok on http://localhost:${port}`);
});
