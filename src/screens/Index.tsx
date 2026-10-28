import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSearchParams } from "wouter";
import type { ImportablePost } from "../../shared/types.ts";
import { api } from "../api.ts";
import { FilterBar } from "../components/FilterBar.tsx";
import { Mosaic } from "../components/Mosaic.tsx";
import { NoteCard } from "../components/NoteCard.tsx";
import { TitleBlock } from "../components/TitleBlock.tsx";
import { stationCodes } from "../lib/codes.ts";
import { applyFilters, isFiltered, readFilters, tagCounts, writeFilters, type Filters } from "../lib/filters.ts";
import { useNotes, useSearch } from "../queries.ts";

/** Offers to bring garden posts that are on truls.dev but not in blok yet. Hidden when there are none. */
function ImportBanner() {
  const queryClient = useQueryClient();
  const posts = useQuery({
    queryKey: ["importable"],
    queryFn: () => api<{ posts: ImportablePost[] }>("/import/truls-dev"),
    select: (data) => data.posts,
  });
  const importAll = useMutation({
    mutationFn: () => api<{ imported: { slug: string }[] }>("/import/truls-dev", { method: "POST", body: "{}" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["importable"] });
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  const list = posts.data ?? [];
  if (!list.length) return null;
  const names = list.map((p) => p.title);
  const shown = names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;

  return (
    <div className="import-banner" role="region" aria-label="Import from truls.dev">
      <p>
        <strong>
          {list.length} garden {list.length === 1 ? "post" : "posts"} on truls.dev {list.length === 1 ? "isn't" : "aren't"} in blok yet
        </strong>
        : {shown}. Importing links them, so you can edit and publish them from here.
        <span lang="ja">truls.devの記事を取り込む</span>
      </p>
      <button type="button" className="btn" disabled={importAll.isPending} onClick={() => importAll.mutate()}>
        {importAll.isPending ? "Importing…" : "Import"}
        <span lang="ja">取り込む</span>
      </button>
      {importAll.isError && <p className="plate plate--error">{importAll.error.message}</p>}
    </div>
  );
}

/** All notes: the BLOK hero, filters and the card grid. */
export function Index() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const setFilters = (next: Partial<Filters>) => setParams(writeFilters({ ...filters, ...next }), { replace: true });

  const notes = useNotes();
  const search = useSearch(filters.q);
  const all = useMemo(() => notes.data ?? [], [notes.data]);

  const codes = useMemo(() => stationCodes(all), [all]);
  const tags = useMemo(() => tagCounts(all), [all]);
  const shown = applyFilters(all, filters, search.data);
  const feature = !isFiltered(filters) && filters.sort === "updated" && shown.length >= 4;

  const seedlings = all.filter((n) => n.meta.status === "seedling").length;
  const published = all.filter((n) => n.meta.published && !n.meta.published.draft).length;

  return (
    <main className="index">
      <section className="index-hero">
        <TitleBlock
          lines={["Blok"]}
          size={200}
          slab="ノート帳"
          plateTop="Truls' notatblokk"
          plateBottom={<span lang="ja">トルルスのノート</span>}
        />
        <Mosaic
          className="hero-mosaic"
          seed="blok-index"
          cols={12}
          rows={6}
          tile={24}
          density={0.8}
          anchor={[0.1, 0.55]}
          colors={["ink", "accent", "taupe", "cream", "vermilion", "teal"]}
        />
        <p className="eyebrow hero-stats">
          <span className="dots">● ●</span>
          {all.length === 0 ? (
            <span>
              No notes yet<span lang="ja">ノートはまだありません</span>
            </span>
          ) : (
            <span>
              {all.length} {all.length === 1 ? "note" : "notes"} · {seedlings} {seedlings === 1 ? "seedling" : "seedlings"} ·{" "}
              {published} published
              <span lang="ja">
                ノート{all.length}件・苗{seedlings}件・公開{published}件
              </span>
            </span>
          )}
        </p>
      </section>

      <FilterBar filters={filters} onChange={setFilters} tags={tags} />
      <ImportBanner />

      {notes.isError ? (
        <p className="plate plate--error index-message">{notes.error.message}</p>
      ) : notes.isPending ? (
        <p className="loading">
          Loading <span lang="ja">読み込み中</span>
        </p>
      ) : all.length === 0 ? (
        <div className="empty">
          <p className="eyebrow">
            <span className="dots">● ●</span>
            <span>
              Nothing here yet<span lang="ja">まだ何もありません</span>
            </span>
          </p>
          <p className="hint">Start with + New in the top bar, or drop markdown folders into the notes folder.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p className="eyebrow">
            <span className="dots">● ●</span>
            <span>
              Nothing matches<span lang="ja">該当なし</span>
            </span>
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => setFilters({ types: [], langs: [], statuses: [], tag: null, q: "" })}
          >
            Clear filters<span lang="ja">解除</span>
          </button>
        </div>
      ) : (
        <div className="grid">
          {shown.map((note, i) => (
            <NoteCard
              key={note.slug}
              note={note}
              code={codes.get(note.slug)}
              feature={feature && i === 0}
              activeTag={filters.tag}
              onTag={(tag) => setFilters({ tag: filters.tag === tag ? null : tag })}
            />
          ))}
        </div>
      )}
    </main>
  );
}
