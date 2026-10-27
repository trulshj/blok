import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { SetupRequest, SetupStatus } from "../../shared/types.ts";
import { api } from "../api.ts";
import { TitleBlock } from "../components/TitleBlock.tsx";

/** First run: pick and create the notes folder. */
export function Setup({ status }: { status: SetupStatus }) {
  const queryClient = useQueryClient();
  const [notesDir, setNotesDir] = useState(status.notes.raw);
  const [gitInit, setGitInit] = useState(true);

  const create = useMutation({
    mutationFn: (body: SetupRequest) => api<SetupStatus>("/setup", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (next) => queryClient.setQueryData(["setup"], next),
  });

  const { config, notes, trulsDev } = status;

  return (
    <main className="screen setup">
      <section className="hero">
        <TitleBlock
          lines={["Setup"]}
          size={160}
          slab="準備"
          plateTop="First run"
          plateBottom={<span lang="ja">はじめまして</span>}
        />
        <p className="eyebrow hero-note">
          <span className="dots">● ●</span>
          <span>
            Pick a folder for your notes
            <span lang="ja">ノートの保存先を選ぶ</span>
          </span>
        </p>
      </section>

      <section className="checks" aria-label="Setup checks">
        <Check state={config.error ? "todo" : config.source === "file" ? "ok" : "todo"} label="Config" ja="設定">
          {config.error ? (
            <>
              <code>{config.path}</code> has a problem: {config.error}
            </>
          ) : config.source === "file" ? (
            <code>{config.path}</code>
          ) : (
            <>Not created yet. Setting up the notes folder writes it.</>
          )}
        </Check>
        <Check state={notes.exists ? "ok" : "todo"} label="Notes folder" ja="ノートフォルダ">
          <code>{notes.path}</code>
          {notes.exists ? null : " doesn't exist yet."}
        </Check>
        <Check state={notes.isGitRepo ? "ok" : "todo"} label="Git repository" ja="リポジトリ">
          {notes.isGitRepo ? "Ready to sync." : "Not a git repository yet. Needed to sync notes between machines."}
        </Check>
        <Check state={trulsDev.exists ? "ok" : "optional"} label="truls.dev" ja="公開先">
          <code>{trulsDev.path}</code>
          {trulsDev.exists ? null : " not found. Only needed for publishing, later."}
        </Check>
      </section>

      <form
        className="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ notesDir, gitInit });
        }}
      >
        <label className="field-group">
          <span className="flabel">
            Notes folder<span lang="ja">ノートフォルダ</span>
          </span>
          <input className="field" value={notesDir} onChange={(e) => setNotesDir(e.target.value)} spellCheck={false} />
        </label>
        <p className="hint">
          Relative paths start from the blok folder. <code>../blok-notes</code> puts it next to blok, which works the
          same on Windows and Mac.
        </p>
        <label className="checkbox">
          <input type="checkbox" checked={gitInit} onChange={(e) => setGitInit(e.target.checked)} />
          Make it a git repository <span className="mono">git init</span>
        </label>
        <div className="actions">
          <button className="btn" disabled={create.isPending || !notesDir.trim()}>
            {create.isPending ? "Creating…" : "Create notes folder"}
            <span lang="ja">作成</span>
          </button>
        </div>
        {create.isError && <p className="plate plate--error">{create.error.message}</p>}
      </form>
    </main>
  );
}

function Check({
  state,
  label,
  ja,
  children,
}: {
  state: "ok" | "todo" | "optional";
  label: string;
  ja: string;
  children: ReactNode;
}) {
  return (
    <div className="check" data-state={state}>
      <span className="check-mark" lang="ja" title={state === "ok" ? "Done" : "Not yet"}>
        {state === "ok" ? "済" : "未"}
      </span>
      <span className="flabel">
        {label}
        <span lang="ja">{ja}</span>
      </span>
      <span className="check-detail">{children}</span>
    </div>
  );
}
