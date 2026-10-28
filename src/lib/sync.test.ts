import { describe, expect, it } from "vitest";
import type { SyncStatus } from "../../shared/types.ts";
import { syncLabel, syncSummary } from "./sync.ts";

const status = (over: Partial<SyncStatus>): SyncStatus => ({
  state: "clean",
  branch: "main",
  upstream: "origin/main",
  changed: 0,
  ahead: 0,
  behind: 0,
  fetchedAt: null,
  syncedAt: null,
  error: null,
  ...over,
});

describe("syncLabel", () => {
  it.each([
    [status({}), false, "Synced", "ok"],
    [status({ state: "changes", changed: 3 }), false, "Sync", "pending"],
    [status({ state: "behind", behind: 2 }), false, "Pull", "pending"],
    [status({ state: "no-remote" }), false, "Local only", "off"],
    [status({ state: "not-repo" }), false, "No git", "off"],
    [status({ error: "Can't reach the remote" }), false, "Sync failed", "error"],
    [status({ state: "changes", changed: 1 }), true, "Syncing…", "pending"],
  ] as const)("%#: %s", (s, syncing, en, tone) => {
    expect(syncLabel(s, syncing)).toMatchObject({ en, tone });
  });

  it("counts changes up and commits down, and explains them", () => {
    const label = syncLabel(status({ state: "diverged", changed: 2, behind: 1 }), false);
    expect(label).toMatchObject({ up: 2, down: 1, canSync: true });
    expect(label.detail).toBe("Click to sync: 2 changed files to commit, 1 commit to pull");
  });

  it("can't sync without git or while syncing", () => {
    expect(syncLabel(status({ state: "not-repo" }), false).canSync).toBe(false);
    expect(syncLabel(status({}), true).canSync).toBe(false);
  });
});

it("syncSummary", () => {
  expect(syncSummary({ committed: 3, pulled: 2, pushed: 1, status: status({}) })).toBe(
    "Committed 3 files, pulled 2 commits, pushed 1 commit",
  );
  expect(syncSummary({ committed: 0, pulled: 0, pushed: 0, status: status({}) })).toBe("Already up to date");
});
