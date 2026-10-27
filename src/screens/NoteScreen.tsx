import { useMemo } from "react";
import { Link } from "wouter";
import { CodeBadge } from "../components/CodeBadge.tsx";
import { Mosaic } from "../components/Mosaic.tsx";
import { Stamp } from "../components/Stamp.tsx";
import { TitleBlock } from "../components/TitleBlock.tsx";
import { stationCodes } from "../lib/codes.ts";
import { dateTime, splitTitle, titleSize } from "../lib/format.ts";
import { LANG_LABELS, STATUS_LABELS, TYPE_LABELS } from "../lib/labels.ts";
import { useNote, useNotes } from "../queries.ts";

/** Read-only view of one note. The editor replaces the body part in build step 5. */
export function NoteScreen({ slug }: { slug: string }) {
  const note = useNote(slug);
  const notes = useNotes();
  const code = useMemo(() => stationCodes(notes.data ?? []).get(slug), [notes.data, slug]);

  const back = (
    <Link href="/" className="back">
      ← All notes<span lang="ja">ノート一覧</span>
    </Link>
  );

  if (note.isPending) {
    return (
      <main className="screen">
        {back}
        <p className="loading">
          Loading <span lang="ja">読み込み中</span>
        </p>
      </main>
    );
  }
  if (note.isError) {
    return (
      <main className="screen">
        {back}
        <p className="plate plate--error">{note.error.message}</p>
      </main>
    );
  }

  const { meta, body, problems } = note.data;
  const lines = splitTitle(meta.title);
  const type = TYPE_LABELS[meta.type];

  return (
    <main className="screen note-screen" data-type={meta.type}>
      {back}

      <div className="note-head">
        <TitleBlock
          lines={lines}
          size={titleSize(lines, 900, 118)}
          slab={meta.titleJa}
          stamp={<Stamp status={meta.status} size={104} />}
          plateBottomSide="left"
          plateBottom={
            <>
              <CodeBadge code={code} />
              {type.en}
              <span lang="ja">{type.ja}</span>
            </>
          }
        />
        <Mosaic
          className="note-mosaic"
          seed={slug}
          cols={7}
          rows={7}
          tile={22}
          density={0.8}
          anchor={[0.15, 0.5]}
          colors={["ink", "t", "taupe", "cream"]}
        />
      </div>

      {problems.map((problem) => (
        <p key={problem} className="plate plate--error">
          {problem}
        </p>
      ))}

      <dl className="facts">
        <dt>Status</dt>
        <dd>
          {STATUS_LABELS[meta.status].en} <span lang="ja">{STATUS_LABELS[meta.status].kanji}</span>
        </dd>
        <dt>Language</dt>
        <dd>
          {LANG_LABELS[meta.lang].code} <span lang="ja">{LANG_LABELS[meta.lang].ja}</span>
        </dd>
        {meta.tags.length > 0 && (
          <>
            <dt>Tags</dt>
            <dd>
              {meta.tags.map((tag) => (
                <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`} className="tag">
                  #{tag}
                </Link>
              ))}
            </dd>
          </>
        )}
        <dt>Created</dt>
        <dd>{dateTime(meta.created)}</dd>
        <dt>Updated</dt>
        <dd>{dateTime(meta.updated)}</dd>
      </dl>

      {meta.excerpt && <p className="lead">{meta.excerpt}</p>}
      {body.trim() ? <pre className="raw-body">{body}</pre> : <p className="hint">This note is empty.</p>}
      <p className="hint">The editor comes in the next build step. For now this shows the markdown as written.</p>
    </main>
  );
}
