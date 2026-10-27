import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { loadConfig } from "./server/config.ts";

// The UI lives on the configured port; the API runs next door on port + 1 (see server/main.ts).
const { port } = loadConfig(fileURLToPath(new URL(".", import.meta.url)));
const api = `http://127.0.0.1:${port + 1}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    proxy: { "/api": api, "/files": api },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
