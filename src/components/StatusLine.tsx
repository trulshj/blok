import type { SaveStatus } from "../editor/autosave.ts";

const TEXT: Record<SaveStatus["state"], { en: string; ja: string }> = {
  saved: { en: "Saved", ja: "保存済み" },
  dirty: { en: "Unsaved", ja: "未保存" },
  saving: { en: "Saving…", ja: "保存中" },
  blocked: { en: "Not saved", ja: "未保存" },
  error: { en: "Couldn't save", ja: "保存失敗" },
  conflict: { en: "Changed elsewhere", ja: "競合" },
};

type Props = {
  status: SaveStatus;
  stats: { words: number; cjk: number };
  slug: string;
  onRetry: () => void;
};

/** Save state, word count and file path along the bottom of the note screen. */
export function StatusLine({ status, stats, slug, onRetry }: Props) {
  const text = TEXT[status.state];
  const time =
    status.state === "saved" ? new Date(status.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <footer className="statusline">
      <span className="save-state" data-state={status.state} role="status">
        <i className="save-dot" aria-hidden="true" />
        {text.en} <span lang="ja">{text.ja}</span>
        {time && <span className="muted">· {time}</span>}
        {(status.state === "error" || status.state === "blocked") && <span className="save-message">{status.message}</span>}
      </span>
      {status.state === "error" && (
        <button type="button" className="link-btn" onClick={onRetry}>
          Retry
        </button>
      )}
      <span>
        {stats.words} {stats.words === 1 ? "word" : "words"}
        {stats.cjk > 0 && <span lang="ja"> · {stats.cjk}字</span>}
      </span>
      <span className="path">notes/{slug}/index.md</span>
    </footer>
  );
}
