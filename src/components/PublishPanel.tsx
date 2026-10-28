import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { PublishInfo, PublishPreview, PublishResult } from "../../shared/types.ts";
import { api } from "../api.ts";
import { relativeTime } from "../lib/format.ts";

type Props = {
  slug: string;
  published: PublishInfo | undefined;
  /** Saves pending edits, so the published post has them. */
  beforePublish: () => Promise<void>;
  /** Why publishing isn't possible right now (unsaved conflict, save error), or null. */
  blocked: string | null;
};

const shortUrl = (url: string) => url.replace(/^https?:\/\//, "");

/** The note's state on truls.dev, with Publish / Update / Unpublish. */
export function PublishPanel({ slug, published, beforePublish, blocked }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const queryClient = useQueryClient();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["note", slug] });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  const unpublish = useMutation({
    mutationFn: async () => {
      await beforePublish();
      return api<PublishResult>(`/notes/${slug}/unpublish`, { method: "POST", body: "{}" });
    },
    onSuccess: (result) => {
      refresh();
      setMessage(
        result.pushError
          ? { kind: "error", text: `Unpublished in truls.dev, but not pushed yet: ${result.pushError}` }
          : { kind: "ok", text: "Unpublished. It disappears from truls.dev with the next deploy." },
      );
    },
    onError: (err) => setMessage({ kind: "error", text: err.message }),
  });

  const state = !published ? "new" : published.draft ? "draft" : "live";
  const url = published ? `https://truls.dev/garden/${published.slug}` : null;

  return (
    <div className="publish-panel" data-state={state}>
      <span className="flabel">
        truls.dev<span lang="ja">公開</span>
      </span>

      {state === "new" && <p className="publish-state">Not on truls.dev yet.</p>}
      {state === "live" && published && url && (
        <p className="publish-state">
          Published {published.pubDate} ·{" "}
          <a href={url} target="_blank" rel="noreferrer">
            {shortUrl(url)} ↗
          </a>
          <span className="hint"> Last sent {relativeTime(published.at)}.</span>
        </p>
      )}
      {state === "draft" && <p className="publish-state">Unpublished: a draft on truls.dev, hidden from the garden.</p>}

      <div className="publish-actions">
        <button
          type="button"
          className="btn"
          disabled={!!blocked || unpublish.isPending}
          onClick={() => {
            setMessage(null);
            setOpen(true);
            dialog.current?.showModal();
          }}
        >
          {state === "live" ? "Update…" : state === "draft" ? "Publish again…" : "Publish…"}
          <span lang="ja">公開</span>
        </button>
        {state === "live" && (
          <button
            type="button"
            className={confirmUnpublish ? "btn btn--danger" : "btn btn--ghost"}
            disabled={!!blocked || unpublish.isPending}
            onClick={() => (confirmUnpublish ? unpublish.mutate() : setConfirmUnpublish(true))}
            onBlur={() => setConfirmUnpublish(false)}
          >
            {unpublish.isPending ? "Unpublishing…" : confirmUnpublish ? "Click again to unpublish" : "Unpublish"}
          </button>
        )}
      </div>
      {blocked && <span className="hint">{blocked}</span>}
      {message && <p className={message.kind === "error" ? "plate plate--error" : "plate plate--ok"}>{message.text}</p>}

      <dialog ref={dialog} className="dialog dialog--wide" onClose={() => setOpen(false)} aria-labelledby="publish-heading">
        {open && (
          <PublishDialog
            slug={slug}
            beforePublish={beforePublish}
            onPublished={refresh}
            onClose={() => dialog.current?.close()}
          />
        )}
      </dialog>
    </div>
  );
}

/** Preview of exactly what publishing writes, then the publish itself. Mounted only while open. */
function PublishDialog({
  slug,
  beforePublish,
  onPublished,
  onClose,
}: {
  slug: string;
  beforePublish: () => Promise<void>;
  onPublished: () => void;
  onClose: () => void;
}) {
  const [force, setForce] = useState(false);
  const preview = useQuery({
    queryKey: ["publish-preview", slug],
    queryFn: async () => {
      await beforePublish(); // preview what's actually on disk
      return api<PublishPreview>(`/notes/${slug}/publish`);
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const publish = useMutation({
    mutationFn: async () => {
      await beforePublish();
      return api<PublishResult>(`/notes/${slug}/publish`, { method: "POST", body: JSON.stringify({ force }) });
    },
    onSuccess: onPublished,
  });

  const p = preview.data;
  const blocking = p?.warnings.filter((w) => w.blocking) ?? [];
  const overridable = blocking.length > 0 && blocking.every((w) => w.code === "edited" || w.code === "slug-taken");
  const canPublish = !!p && (blocking.length === 0 || (overridable && force)) && !publish.isPending;
  const verb = p?.state === "update" ? "Update" : "Publish";

  if (publish.data) {
    const r = publish.data;
    return (
      <div className="dialog-form">
        <p className="eyebrow" id="publish-heading">
          <span className="dots">● ●</span>
          <span>
            {r.pushError ? "Committed, not pushed" : r.commit || r.pushed ? "Published" : "Nothing new to publish"}
            <span lang="ja">{r.pushError ? "未送信" : "公開済み"}</span>
          </span>
        </p>
        {r.pushError ? (
          <p className="plate plate--error">{r.pushError}</p>
        ) : r.pushed ? (
          <p>
            Sent to GitHub{r.commit ? ` (commit ${r.commit})` : ""}. Vercel builds it, and in about a minute it's live at{" "}
            <a href={r.url} target="_blank" rel="noreferrer">
              {shortUrl(r.url)} ↗
            </a>
            .
          </p>
        ) : (
          <p>The post on truls.dev already matches this note.</p>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="dialog-form"
      onSubmit={(e) => {
        e.preventDefault();
        publish.mutate();
      }}
    >
      <p className="eyebrow" id="publish-heading">
        <span className="dots">● ●</span>
        <span>
          {verb} on truls.dev<span lang="ja">公開</span>
        </span>
      </p>

      {preview.isPending && <p className="loading-inline">Checking truls.dev…</p>}
      {preview.isError && <p className="plate plate--error">{preview.error.message}</p>}

      {p && (
        <>
          <dl className="publish-facts">
            <dt>URL</dt>
            <dd>{shortUrl(p.url)}</dd>
            <dt>File</dt>
            <dd>{p.file}</dd>
            <dt>Images</dt>
            <dd>{p.images.length ? p.images.map((img) => <div key={img}>{img}</div>) : "none"}</dd>
          </dl>
          <pre className="publish-frontmatter">{p.frontmatter}</pre>

          {p.warnings.length > 0 && (
            <ul className="publish-warnings">
              {p.warnings.map((w) => (
                <li key={w.code + w.message} data-blocking={w.blocking}>
                  {w.message}
                </li>
              ))}
            </ul>
          )}
          {overridable && (
            <label className="checkbox">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              Replace it anyway
            </label>
          )}
          <p className="hint">
            blok commits only these files in truls.dev and pushes main, which Vercel deploys.
          </p>
        </>
      )}

      {publish.isError && <p className="plate plate--error">{publish.error.message}</p>}
      <div className="actions">
        <button className="btn" disabled={!canPublish}>
          {publish.isPending ? "Publishing…" : verb}
          <span lang="ja">公開</span>
        </button>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
