import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "wouter";
import { hasKanji } from "../../shared/furigana.ts";
import type { VocabEntry, VocabInput } from "../../shared/types.ts";
import { api } from "../api.ts";
import { AddToNoteDialog } from "../components/AddToNoteDialog.tsx";
import { Mosaic } from "../components/Mosaic.tsx";
import { ExampleText } from "../components/RubyText.tsx";
import { TitleBlock } from "../components/TitleBlock.tsx";
import { VocabCardDialog } from "../components/VocabCardDialog.tsx";
import { downloadAnki } from "../lib/anki.ts";
import { relativeTime } from "../lib/format.ts";
import { kanaReading } from "../lib/kana.ts";
import { cardToInput, entryToCard, filterVocab, type VocabShow } from "../lib/vocab.ts";
import { suggestReading, useNotes, useVocab } from "../queries.ts";

const SHOW: { value: VocabShow; en: string; ja: string }[] = [
  { value: "new", en: "New", ja: "未使用" },
  { value: "used", en: "In a note", ja: "使用済み" },
  { value: "all", en: "All", ja: "すべて" },
];

/** Word, reading, meaning, source, Enter. The reading fills in by itself; the source stays for the next word. */
function QuickAdd() {
  const queryClient = useQueryClient();
  const wordInput = useRef<HTMLInputElement>(null);
  const [word, setWord] = useState("");
  const [reading, setReading] = useState("");
  const [meaning, setMeaning] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestion = async (): Promise<string> => (hasKanji(word) ? suggestReading(word.trim()).catch(() => "") : "");

  const add = async () => {
    if (!word.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const input: VocabInput = { word, reading: kanaReading(reading.trim()) || (await suggestion()), meaning };
      if (source.trim()) input.source = source;
      await api<VocabEntry>("/vocab", { method: "POST", body: JSON.stringify(input) });
      void queryClient.invalidateQueries({ queryKey: ["vocab"] });
      setWord("");
      setReading("");
      setMeaning("");
      wordInput.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <label className="field-group">
        <span className="flabel">
          Word<span lang="ja">単語</span>
        </span>
        <input
          ref={wordInput}
          className="field field--ja"
          lang="ja"
          value={word}
          autoFocus
          onChange={(e) => setWord(e.target.value)}
          onBlur={async () => {
            if (reading || !hasKanji(word)) return;
            const suggested = await suggestion();
            setReading((current) => current || suggested);
          }}
        />
      </label>
      <label className="field-group">
        <span className="flabel">
          Reading<span lang="ja">読み</span>
        </span>
        <input
          className="field field--ja"
          lang="ja"
          value={reading}
          onChange={(e) => setReading(e.target.value)}
          onBlur={(e) => setReading(kanaReading(e.target.value.trim()))}
        />
      </label>
      <label className="field-group quick-add-meaning">
        <span className="flabel">
          Meaning<span lang="ja">意味</span>
        </span>
        <input className="field" value={meaning} onChange={(e) => setMeaning(e.target.value)} />
      </label>
      <label className="field-group">
        <span className="flabel">
          Source<span lang="ja">出典</span>
        </span>
        <input className="field" value={source} placeholder="Minecraft" onChange={(e) => setSource(e.target.value)} />
      </label>
      <button className="btn" disabled={!word.trim() || busy}>
        + Add<span lang="ja">追加</span>
      </button>
      {error && <p className="plate plate--error">{error}</p>}
    </form>
  );
}

/** The vocab inbox: words saved while reading or playing, waiting to become vocab cards or Anki cards. */
export function Vocab() {
  const queryClient = useQueryClient();
  const vocab = useVocab();
  const notes = useNotes();
  const [params, setParams] = useSearchParams();
  const show = (SHOW.find((s) => s.value === params.get("show"))?.value ?? "all") as VocabShow;
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<VocabEntry | null>(null);
  const [adding, setAdding] = useState<VocabEntry | null>(null);
  const [added, setAdded] = useState<{ id: string; slug: string; title: string } | null>(null);

  const all = useMemo(() => vocab.data ?? [], [vocab.data]);
  const shown = filterVocab(all, show, q);
  const titles = useMemo(() => new Map((notes.data ?? []).map((n) => [n.slug, n.meta.title])), [notes.data]);
  const unused = all.filter((e) => !e.used.length).length;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["vocab"] });

  return (
    <main className="vocab">
      <section className="index-hero vocab-hero">
        <TitleBlock lines={["Vocab"]} size={170} slab="単語帳" plateTop="Vocab inbox" plateBottom={<span lang="ja">トルルスの単語</span>} />
        <Mosaic
          className="hero-mosaic"
          seed="blok-vocab"
          cols={10}
          rows={5}
          tile={24}
          density={0.75}
          anchor={[0.15, 0.5]}
          colors={["ink", "accent", "cream", "green", "taupe"]}
        />
        <p className="eyebrow hero-stats">
          <span className="dots">● ●</span>
          <span>
            {all.length} {all.length === 1 ? "word" : "words"} · {unused} not in a note yet
            <span lang="ja">
              単語{all.length}件・未使用{unused}件
            </span>
          </span>
        </p>
      </section>

      <QuickAdd />

      <div className="filters">
        <div className="fgroup">
          <span className="flabel">
            Show<span lang="ja">表示</span>
          </span>
          {SHOW.map((s) => (
            <button
              key={s.value}
              type="button"
              className={show === s.value ? "chip is-on" : "chip"}
              aria-pressed={show === s.value}
              onClick={() => setParams(s.value === "all" ? {} : { show: s.value }, { replace: true })}
            >
              {s.en}
              <span lang="ja">{s.ja}</span>
            </button>
          ))}
        </div>
        <div className="fgroup fgroup--end">
          <input
            className="field vocab-search"
            type="search"
            placeholder="Filter words · 絞り込み"
            aria-label="Filter words"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={!shown.length}
            title="A tab-separated file for Anki's File → Import"
            onClick={() => downloadAnki(shown.map((e) => ({ ...e })))}
          >
            Export {shown.length} for Anki
          </button>
        </div>
      </div>

      {vocab.isError ? (
        <p className="plate plate--error index-message">{vocab.error.message}</p>
      ) : vocab.isPending ? (
        <p className="loading">
          Loading <span lang="ja">読み込み中</span>
        </p>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p className="eyebrow">
            <span className="dots">● ●</span>
            <span>
              {all.length ? "Nothing matches" : "No words yet"}
              <span lang="ja">{all.length ? "該当なし" : "まだ単語はありません"}</span>
            </span>
          </p>
          <p className="hint">
            Add words above, or select a word in a note and choose + Inbox.
          </p>
        </div>
      ) : (
        <div className="vocab-grid">
          {shown.map((entry) => (
            <article key={entry.id} className="vocab-entry">
              <button type="button" className="vocab-entry-main" title="Edit · 編集" onClick={() => setEditing(entry)}>
                <span className="vocab-entry-word" lang="ja">
                  {entry.reading ? (
                    <ruby>
                      {entry.word}
                      <rt>{entry.reading}</rt>
                    </ruby>
                  ) : (
                    entry.word
                  )}
                </span>
                <span className="vocab-entry-meaning">{entry.meaning || <span className="muted">No meaning yet</span>}</span>
                {entry.example && (
                  <span className="vocab-entry-example" lang="ja">
                    <ExampleText example={entry.example} word={entry.word} />
                  </span>
                )}
              </button>
              <footer className="vocab-entry-foot">
                {entry.source && <span className="vocab-entry-source">{entry.source}</span>}
                {entry.used.map((slug) => (
                  <Link key={slug} href={`/notes/${slug}`} className="tag">
                    → {titles.get(slug) ?? slug}
                  </Link>
                ))}
                <time dateTime={entry.added}>{relativeTime(entry.added)}</time>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setAdding(entry)}>
                  + Note<span lang="ja">ノートへ</span>
                </button>
              </footer>
              {added?.id === entry.id && (
                <p className="vocab-entry-added" role="status">
                  Added to <Link href={`/notes/${added.slug}`}>{added.title}</Link>
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {editing && (
        <VocabCardDialog
          mode="edit"
          inbox={{ source: editing.source ?? "" }}
          initial={entryToCard(editing)}
          onSave={async (card, source) => {
            await api(`/vocab/${editing.id}`, { method: "PUT", body: JSON.stringify(cardToInput(card, source, editing.used)) });
            await refresh();
          }}
          onRemove={async () => {
            await api(`/vocab/${editing.id}`, { method: "DELETE" });
            await refresh();
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {adding && (
        <AddToNoteDialog
          entry={adding}
          onAdded={(note) => {
            setAdded({ id: adding.id, slug: note.slug, title: note.meta.title });
            void refresh();
            void queryClient.invalidateQueries({ queryKey: ["note", note.slug] });
          }}
          onClose={() => setAdding(null)}
        />
      )}
    </main>
  );
}
