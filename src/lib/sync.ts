import type { SyncResult, SyncStatus } from "../../shared/types.ts";

export type SyncLabel = {
  en: string;
  ja: string;
  /** Dot colour: ok green, pending orange, error red, off grey. */
  tone: "ok" | "pending" | "error" | "off";
  /** Longer explanation for the tooltip. */
  detail: string;
  /** ↑ changes to send, ↓ commits to pull. */
  up: number;
  down: number;
  canSync: boolean;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What the sync button says for a status. */
export function syncLabel(status: SyncStatus, syncing: boolean): SyncLabel {
  const up = status.changed || status.ahead;
  const down = status.behind;
  const waiting = [
    status.changed ? `${plural(status.changed, "changed file")} to commit` : "",
    status.ahead ? `${plural(status.ahead, "commit")} to push` : "",
    status.behind ? `${plural(status.behind, "commit")} to pull` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const base = { up, down, canSync: true };

  if (syncing || status.state === "busy") {
    return { ...base, en: "Syncing…", ja: "同期中", tone: "pending", detail: "Committing, pulling and pushing the notes folder", canSync: false };
  }
  if (status.state === "not-repo") {
    return { ...base, en: "No git", ja: "未設定", tone: "off", detail: "The notes folder isn't a git repository, so it can't sync", canSync: false };
  }
  if (status.error) {
    return { ...base, en: "Sync failed", ja: "同期失敗", tone: "error", detail: status.error };
  }
  if (status.state === "no-remote") {
    return {
      ...base,
      en: "Local only",
      ja: "ローカル",
      tone: up ? "pending" : "off",
      detail: `No remote set, so syncing only commits here${waiting ? ` (${waiting})` : ""}`,
    };
  }
  if (status.state === "clean") {
    return { ...base, en: "Synced", ja: "同期済み", tone: "ok", detail: `Up to date with ${status.upstream ?? "the remote"}` };
  }
  return {
    ...base,
    en: status.state === "behind" ? "Pull" : "Sync",
    ja: status.state === "behind" ? "受信" : "未同期",
    tone: "pending",
    detail: `Click to sync: ${waiting}`,
  };
}

/** "Committed 3 files, pulled 2 commits, pushed 1 commit", or "Already up to date". */
export function syncSummary(result: SyncResult): string {
  const parts = [
    result.committed ? `committed ${plural(result.committed, "file")}` : "",
    result.pulled ? `pulled ${plural(result.pulled, "commit")}` : "",
    result.pushed ? `pushed ${plural(result.pushed, "commit")}` : "",
  ].filter(Boolean);
  if (!parts.length) return "Already up to date";
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
