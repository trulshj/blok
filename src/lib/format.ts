const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then "12 Mar" or "10 Jun 2025". */
export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY);

  if (diff < MINUTE) return "just now";
  if (days === 0 && diff < 60 * MINUTE) return `${Math.floor(diff / MINUTE)} min ago`;
  if (days === 0) return `${Math.floor(diff / (60 * MINUTE))} h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** "28 Oct 2026, 09:05" in local time. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** One or two lines for a staggered block title, split at the space nearest the middle. */
export function splitTitle(title: string, maxOneLine = 14): string[] {
  const text = title.trim();
  if (text.length <= maxOneLine) return [text];
  const middle = text.length / 2;
  let best = -1;
  for (let i = text.indexOf(" "); i !== -1; i = text.indexOf(" ", i + 1)) {
    if (best === -1 || Math.abs(i - middle) < Math.abs(best - middle)) best = i;
  }
  return best === -1 ? [text] : [text.slice(0, best), text.slice(best + 1)];
}

/** A font size (px) for block titles that keeps the longest line within roughly `width` px (Bebas Neue caps ≈ .42em wide). */
export function titleSize(lines: string[], width: number, max: number): number {
  const longest = Math.max(...lines.map((l) => [...l].length), 1);
  return Math.max(28, Math.min(max, Math.floor(width / (longest * 0.42))));
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
