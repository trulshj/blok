import { useMemo } from "react";
import { useSearchParams } from "wouter";
import { FilterBar } from "../components/FilterBar.tsx";
import { Mosaic } from "../components/Mosaic.tsx";
import { NoteCard } from "../components/NoteCard.tsx";
import { TitleBlock } from "../components/TitleBlock.tsx";
import { stationCodes } from "../lib/codes.ts";
import { applyFilters, isFiltered, readFilters, tagCounts, writeFilters, type Filters } from "../lib/filters.ts";
import { useNotes, useSearch } from "../queries.ts";

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
  const evergreen = all.filter((n) => n.meta.status === "evergreen").length;

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
              {evergreen} evergreen
              <span lang="ja">
                ノート{all.length}件・苗{seedlings}件・常緑{evergreen}件
              </span>
            </span>
          )}
        </p>
      </section>

      <FilterBar filters={filters} onChange={setFilters} tags={tags} />

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
