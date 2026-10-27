import { Logo } from "./Logo.tsx";

export function TopBar() {
  return (
    <header className="topbar">
      <a href="/" className="wordmark">
        <Logo />
        <span className="wm-name">
          <span className="wm">Blok</span>
          <span lang="ja">ブロック</span>
        </span>
      </a>
    </header>
  );
}
