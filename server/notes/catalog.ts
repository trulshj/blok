import MiniSearch from "minisearch";
import type { Note, NoteSummary, SearchResult } from "../../shared/types.ts";
import { furiganaReadings, stripFurigana } from "../../shared/furigana.ts";
import { foldLatin } from "../../shared/slug.ts";
import { NoteError, type NoteStore } from "./store.ts";

type SearchDoc = { slug: string; title: string; titleJa: string; tags: string; excerpt: string; body: string };

const CJK_CHAR = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー々";
const CJK_RUN = new RegExp(`[${CJK_CHAR}]+|[^${CJK_CHAR}]+`, "gu");
const IS_CJK = new RegExp(`^[${CJK_CHAR}]`, "u");

/**
 * Words for the search index, also used for queries.
 * Japanese has no spaces, so runs of kanji/kana become single characters plus pairs:
 * 提灯と暖簾 → 提, 提灯, 灯, 灯と, …, 暖簾, 簾. A query for 暖簾 then matches inside the run.
 * Latin text is folded, so "pontocho" finds "Pontochō" and "aerlig" finds "Ærlig".
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // NFKC turns full-width letters and half-width katakana into their usual forms
  for (const word of text.normalize("NFKC").toLowerCase().split(/[\s\p{P}\p{S}]+/u)) {
    for (const run of word.match(CJK_RUN) ?? []) {
      if (IS_CJK.test(run)) {
        const chars = [...run];
        chars.forEach((ch, i) => {
          tokens.push(ch);
          if (i + 1 < chars.length) tokens.push(ch + chars[i + 1]);
        });
      } else {
        tokens.push(foldLatin(run));
      }
    }
  }
  return tokens;
}

const isCjk = (term: string) => IS_CJK.test(term);

/**
 * The body as it reads, so 松明を finds {松明|たいまつ}を and {松明}を (a VocabCard highlight),
 * with the readings added at the end so たいまつ finds it too.
 */
export function searchText(body: string): string {
  const readings = furiganaReadings(body);
  const text = stripFurigana(body).replace(/\{([^\s{}|]+)\}/g, "$1");
  return readings.length ? `${text}\n${readings.join(" ")}` : text;
}

/**
 * In-memory list of note summaries plus a full-text index, built on first use and kept current
 * by refresh(): the watcher calls it for outside changes, the API routes for blok's own.
 */
export function createCatalog(store: NoteStore) {
  const summaries = new Map<string, NoteSummary>();
  const index = new MiniSearch<SearchDoc>({
    idField: "slug",
    fields: ["title", "titleJa", "tags", "excerpt", "body"],
    tokenize,
    processTerm: (term) => term || null, // tokenize already lowercased and folded
    searchOptions: {
      combineWith: "AND",
      boost: { title: 4, titleJa: 4, tags: 2, excerpt: 1.5 },
      prefix: (term) => !isCjk(term),
      fuzzy: (term) => (!isCjk(term) && term.length > 4 ? 0.2 : false),
    },
  });

  function put(note: Note) {
    const { body, ...summary } = note;
    summaries.set(note.slug, summary);
    const doc: SearchDoc = {
      slug: note.slug,
      title: note.meta.title,
      titleJa: note.meta.titleJa ?? "",
      tags: note.meta.tags.join(" "),
      excerpt: note.meta.excerpt ?? "",
      body: searchText(body),
    };
    if (index.has(note.slug)) index.replace(doc);
    else index.add(doc);
  }

  function drop(slug: string) {
    summaries.delete(slug);
    if (index.has(slug)) index.discard(slug);
  }

  async function reload(slug: string) {
    try {
      put(await store.get(slug));
    } catch (err) {
      if (err instanceof NoteError && (err.code === "not-found" || err.code === "invalid-slug")) drop(slug);
      else throw err;
    }
  }

  let built: Promise<void> | null = null;
  const ensureBuilt = () =>
    (built ??= (async () => {
      await Promise.all((await store.slugs()).map(reload));
    })().catch((err) => {
      built = null; // try again next time
      throw err;
    }));

  return {
    /** All notes, newest change first. */
    async list(): Promise<NoteSummary[]> {
      await ensureBuilt();
      return [...summaries.values()].sort((a, b) => b.meta.updated.localeCompare(a.meta.updated));
    },

    /** Re-read these notes from disk; notes that are gone are dropped. */
    async refresh(slugs: string[]): Promise<void> {
      await ensureBuilt();
      await Promise.all(slugs.map(reload));
    },

    /** Notes matching every word of the query, best first. */
    async search(query: string, limit = 100): Promise<SearchResult[]> {
      await ensureBuilt();
      if (!query.trim()) return [];
      return index
        .search(query)
        .slice(0, limit)
        .map((r) => ({ slug: String(r.id), score: r.score }));
    },
  };
}

export type Catalog = ReturnType<typeof createCatalog>;
