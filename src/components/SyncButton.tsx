import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { SyncResult, SyncStatus } from "../../shared/types.ts";
import { api, ApiError } from "../api.ts";
import { syncLabel, syncSummary } from "../lib/sync.ts";
import { useSyncStatus } from "../queries.ts";

/** "● SYNCED 同期済み ↑0 ↓0": the notes folder's git state; click to commit, pull and push. */
export function SyncButton() {
  const status = useSyncStatus();
  const queryClient = useQueryClient();
  const [report, setReport] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const sync = useMutation({
    mutationFn: () => api<SyncResult>("/sync", { method: "POST", body: "{}" }),
    onSuccess: (result) => {
      queryClient.setQueryData(["sync"], result.status);
      setReport({ kind: "ok", text: syncSummary(result) });
    },
    onError: (err) => {
      setReport({ kind: "error", text: err.message });
      // a failed sync answers with the fresh status; use it rather than waiting for a refetch
      const status = err instanceof ApiError ? (err.data.status as SyncStatus | undefined) : undefined;
      if (status) queryClient.setQueryData(["sync"], status);
      else void queryClient.invalidateQueries({ queryKey: ["sync"] });
    },
  });

  // a success note fades after a few seconds; errors stay until dismissed
  useEffect(() => {
    if (report?.kind !== "ok") return;
    const timer = setTimeout(() => setReport(null), 5000);
    return () => clearTimeout(timer);
  }, [report]);

  if (!status.data) return null;
  const label = syncLabel(status.data, sync.isPending);

  return (
    <div className="sync-wrap">
      <button
        type="button"
        className="sync"
        data-tone={label.tone}
        disabled={!label.canSync}
        title={label.detail}
        onClick={() => {
          setReport(null);
          sync.mutate();
        }}
      >
        <i className="sync-dot" aria-hidden="true" />
        {label.en}
        <span lang="ja">{label.ja}</span>
        <span className="mono" aria-label={`${label.up} to send, ${label.down} to pull`}>
          ↑{label.up} ↓{label.down}
        </span>
      </button>
      {report && (
        <div className={`sync-pop sync-pop--${report.kind}`} role={report.kind === "error" ? "alert" : "status"}>
          <p>{report.text}</p>
          <button type="button" className="sync-pop-close" aria-label="Dismiss" onClick={() => setReport(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
