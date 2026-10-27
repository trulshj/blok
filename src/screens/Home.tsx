import { useQuery } from "@tanstack/react-query";
import type { NoteSummary, SetupStatus } from "../../shared/types.ts";
import { api } from "../api.ts";
import { TitleBlock } from "../components/TitleBlock.tsx";

/** Placeholder home until the notes list lands (build step 4). Updates live through /api/events. */
export function Home({ status }: { status: SetupStatus }) {
  const notes = useQuery({ queryKey: ["notes"], queryFn: () => api<{ notes: NoteSummary[] }>("/notes") });
  const count = notes.data?.notes.length ?? 0;

  return (
    <main className="screen home">
      <section className="hero">
        <TitleBlock
          lines={["Blok"]}
          size={200}
          slab="ノート帳"
          plateTop="Truls' notatblokk"
          plateBottom={<span lang="ja">トルルスのノート</span>}
        />
        <p className="eyebrow hero-note">
          <span className="dots">● ●</span>
          {count === 0 ? (
            <span>
              No notes yet
              <span lang="ja">ノートはまだありません</span>
            </span>
          ) : (
            <span>
              {count} {count === 1 ? "note" : "notes"}
              <span lang="ja">ノート{count}件</span>
            </span>
          )}
        </p>
      </section>

      {count > 0 && (
        <ul className="plain-list">
          {notes.data?.notes.map((note) => (
            <li key={note.slug} data-type={note.meta.type}>
              <span className="plain-list-type">{note.meta.type}</span>
              <span className="plain-list-title">{note.meta.title}</span>
              <code>{note.slug}</code>
            </li>
          ))}
        </ul>
      )}

      <p className="placeholder">
        Notes are stored in <code>{status.notes.path}</code>. The real notes list and editor come next.
      </p>
    </main>
  );
}
