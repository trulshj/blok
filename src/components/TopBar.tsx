import { Link, useLocation } from "wouter";
import { Logo } from "./Logo.tsx";
import { NewNote } from "./NewNote.tsx";
import { SearchBox } from "./SearchBox.tsx";
import { SyncButton } from "./SyncButton.tsx";

/** Wordmark, plus navigation, search and "+ New" once the notes folder is set up. */
export function TopBar({ ready }: { ready: boolean }) {
  const [location] = useLocation();
  const onNotes = location === "/" || location.startsWith("/notes/");
  const onVocab = location === "/vocab";

  return (
    <header className="topbar">
      <Link href="/" className="wordmark" aria-label="blok, all notes">
        <Logo />
        <span className="wm-name">
          <span className="wm">Blok</span>
          <span lang="ja">ブロック</span>
        </span>
      </Link>
      {ready && (
        <>
          <nav className="nav" aria-label="Sections">
            <Link href="/" className={onNotes ? "is-on" : undefined} aria-current={onNotes ? "page" : undefined}>
              Notes<span lang="ja">ノート</span>
            </Link>
            <Link href="/vocab" className={onVocab ? "is-on" : undefined} aria-current={onVocab ? "page" : undefined}>
              Vocab<span lang="ja">単語帳</span>
            </Link>
          </nav>
          <SearchBox />
          <SyncButton />
          <NewNote />
        </>
      )}
    </header>
  );
}
