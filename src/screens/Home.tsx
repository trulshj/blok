import type { SetupStatus } from "../../shared/types.ts";
import { TitleBlock } from "../components/TitleBlock.tsx";

/** Placeholder home until the notes list lands (build step 3–4). */
export function Home({ status }: { status: SetupStatus }) {
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
          <span>
            No notes yet
            <span lang="ja">ノートはまだありません</span>
          </span>
        </p>
      </section>
      <p className="placeholder">
        Notes are stored in <code>{status.notes.path}</code>. The notes list and editor come next.
      </p>
    </main>
  );
}
