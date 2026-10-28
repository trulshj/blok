import { useState } from "react";
import { slugify } from "../../shared/slug.ts";
import { NOTE_LANGS, NOTE_STATUSES, NOTE_TYPES, type NoteMeta, type NoteMetaInput } from "../../shared/types.ts";
import type { StationCode } from "../lib/codes.ts";
import { dateTime } from "../lib/format.ts";
import { LANG_LABELS, STATUS_LABELS, TYPE_LABELS } from "../lib/labels.ts";
import { Stamp } from "./Stamp.tsx";
import { TagInput } from "./TagInput.tsx";

type Props = {
  slug: string;
  meta: NoteMetaInput;
  dates: Pick<NoteMeta, "created" | "updated">;
  code: StationCode | undefined;
  onChange: (patch: Partial<NoteMetaInput>) => void;
  onRename: () => Promise<void>;
  onTrash: () => Promise<void>;
};

/** The note's details, edited in place and autosaved with the text. */
export function MetaPanel({ slug, meta, dates, code, onChange, onRename, onTrash }: Props) {
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [busy, setBusy] = useState<"rename" | "trash" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // the slug a fresh note with this title would get; offer a rename when the title has moved on
  const suggested = meta.title.trim() ? slugify(meta.title, new Date(dates.created)) : slug;
  const matches = slug === suggested || new RegExp(`^${suggested}-\\d+$`).test(slug);

  const act = async (kind: "rename" | "trash", task: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <aside className="meta" aria-label="Note details">
      <label className="meta-sec">
        <span className="flabel">
          Title<span lang="ja">題名</span>
        </span>
        <input id="note-title" className="field" value={meta.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>

      <label className="meta-sec">
        <span className="flabel">
          Japanese title<span lang="ja">和題</span>
        </span>
        <input
          className="field"
          lang="ja"
          value={meta.titleJa ?? ""}
          placeholder="Optional"
          onChange={(e) => onChange({ titleJa: e.target.value })}
        />
        <span className="hint">Shown on the vertical slab.</span>
      </label>

      <div className="meta-sec">
        <span className="flabel">
          Type<span lang="ja">種類</span>
        </span>
        <div className="seg">
          {NOTE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={type === meta.type ? "chip is-on" : "chip"}
              data-type={type}
              aria-pressed={type === meta.type}
              onClick={() => onChange({ type })}
            >
              <i className="sw" />
              {TYPE_LABELS[type].short}
            </button>
          ))}
        </div>
      </div>

      <div className="meta-sec">
        <span className="flabel">
          Language<span lang="ja">言語</span>
        </span>
        <div className="seg">
          {NOTE_LANGS.map((lang) => (
            <button
              key={lang}
              type="button"
              className={lang === meta.lang ? "chip is-on" : "chip"}
              aria-pressed={lang === meta.lang}
              aria-label={LANG_LABELS[lang].en}
              title={`${LANG_LABELS[lang].en} · ${LANG_LABELS[lang].ja}`}
              onClick={() => onChange({ lang })}
            >
              {LANG_LABELS[lang].code}
            </button>
          ))}
        </div>
      </div>

      <div className="meta-sec">
        <span className="flabel">
          Status<span lang="ja">状態</span>
        </span>
        <div className="status-pick">
          {NOTE_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={status === meta.status ? "is-on" : undefined}
              aria-pressed={status === meta.status}
              onClick={() => onChange({ status })}
            >
              <Stamp status={status} size={58} />
              {STATUS_LABELS[status].en}
            </button>
          ))}
        </div>
      </div>

      <div className="meta-sec">
        <span className="flabel">
          Tags<span lang="ja">タグ</span>
        </span>
        <TagInput tags={meta.tags} onChange={(tags) => onChange({ tags })} />
      </div>

      <label className="meta-sec">
        <span className="flabel">
          Excerpt<span lang="ja">抜粋</span>
        </span>
        <textarea
          className="field"
          rows={3}
          value={meta.excerpt ?? ""}
          placeholder="Optional. Cards show the first paragraph otherwise."
          onChange={(e) => onChange({ excerpt: e.target.value })}
        />
      </label>

      <dl className="dates">
        {code && (
          <>
            <dt>Code</dt>
            <dd>
              {code.letter}·{code.number}
            </dd>
          </>
        )}
        <dt>Created</dt>
        <dd>{dateTime(dates.created)}</dd>
        <dt>Updated</dt>
        <dd>{dateTime(dates.updated)}</dd>
        <dt>File</dt>
        <dd>notes/{slug}/</dd>
      </dl>

      {!matches && (
        <button type="button" className="btn btn--ghost" disabled={busy !== null} onClick={() => act("rename", onRename)}>
          {busy === "rename" ? "Renaming…" : `Rename file to ${suggested}`}
        </button>
      )}

      <div className="publish" aria-disabled="true">
        <span>
          Publish to truls.dev<span lang="ja">公開</span>
        </span>
        <span className="mono">PHASE 2</span>
      </div>

      <button
        type="button"
        className={confirmTrash ? "btn btn--danger" : "btn btn--ghost"}
        disabled={busy !== null}
        onClick={() => (confirmTrash ? act("trash", onTrash) : setConfirmTrash(true))}
        onBlur={() => setConfirmTrash(false)}
      >
        {busy === "trash" ? "Moving…" : confirmTrash ? "Click again to move to trash" : "Move to trash"}
        <span lang="ja">ゴミ箱へ</span>
      </button>
      {error && <p className="plate plate--error">{error}</p>}
    </aside>
  );
}
