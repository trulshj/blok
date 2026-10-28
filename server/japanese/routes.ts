import type { Hono } from "hono";
import { z } from "zod";
import type { ReadingsResponse } from "../../shared/types.ts";
import { readJson } from "../notes/routes.ts";
import { readings } from "./readings.ts";

const ReadingsInput = z.object({ texts: z.array(z.string().max(20_000)).max(200) });

/** Reading suggestions for furigana, from kuromoji. */
export function registerJapaneseRoutes(app: Hono) {
  app.post("/api/japanese/readings", async (c) => {
    const { texts } = await readJson(c, ReadingsInput);
    const results = [];
    for (const text of texts) results.push(await readings(text));
    return c.json({ results } satisfies ReadingsResponse);
  });
}
