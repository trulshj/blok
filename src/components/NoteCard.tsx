import type { CSSProperties } from "react";
import { Link } from "wouter";
import type { NoteSummary } from "../../shared/types.ts";
import type { StationCode } from "../lib/codes.ts";
import { relativeTime, splitTitle, titleSize } from "../lib/format.ts";
import { imageUrl } from "../lib/images.ts";
import { LANG_LABELS, TYPE_LABELS } from "../lib/labels.ts";
import { CodeBadge } from "./CodeBadge.tsx";
import { Mosaic } from "./Mosaic.tsx";
import { Stamp } from "./Stamp.tsx";

type Props = {
  note: NoteSummary;
  code: StationCode | undefined;
  /** The big 2×2 card at the start of the grid. */
  feature?: boolean;
  activeTag: string | null;
  onTag: (tag: string) => void;
};

export function NoteCard({ note, code, feature = false, activeTag, onTag }: Props) {
  const { meta } = note;
  const type = TYPE_LABELS[meta.type];
  const href = `/notes/${note.slug}`;
  const lines = splitTitle(meta.title);
  const cover = meta.image ? imageUrl(note.slug, meta.image.src) : null;

  return (
    <article className={feature ? "card card--feature" : "card"} data-type={meta.type}>
      <span className="card-stamp">
        <Stamp status={meta.status} size={feature ? 72 : 46} />
      </span>

      <header className="card-head">
        <CodeBadge code={code} />
        <span className="card-type">
          {type.short}
          <span lang="ja">{type.ja}</span>
        </span>
        {meta.published && !meta.published.draft && (
          <span className="card-published" lang="ja" title={`Published on truls.dev/garden/${meta.published.slug}`}>
            公開
          </span>
        )}
        {note.problems.length > 0 && (
          <span className="card-warn" title={note.problems.join("\n")} aria-label="Frontmatter problems">
            !
          </span>
        )}
        {!feature && <Mosaic seed={note.slug} cols={4} rows={2} tile={11} density={0.95} colors={["ink", "t", "taupe", "paper"]} />}
      </header>

      {/* the cover image, or the note's own tile pattern when it has none */}
      {feature && cover && (
        <figure className="card-cover-figure">
          <img className="card-cover-img" src={cover} alt={meta.image?.alt ?? ""} loading="lazy" />
          <span className="plate">{meta.image?.src.replace(/^\.\//, "")}</span>
        </figure>
      )}
      {feature && !cover && (
        <Mosaic
          className="card-cover"
          seed={note.slug}
          cols={20}
          rows={5}
          tile={24}
          density={0.85}
          anchor={[0.5, 0.5]}
          colors={["ink", "t", "taupe", "paper"]}
        />
      )}

      {feature ? (
        <h3 className="block-title card-block-title" style={{ "--title-size": `${titleSize(lines, 560, 66)}px` } as CSSProperties}>
          <Link href={href} className="card-link" aria-label={meta.title}>
            {lines.map((line, i) => (
              <span className="bt" key={i}>
                {line}
              </span>
            ))}
          </Link>
        </h3>
      ) : (
        <h3 className="card-title">
          <Link href={href} className="card-link">
            {meta.title}
          </Link>
        </h3>
      )}
      {meta.titleJa && (
        <p className="card-title-ja" lang="ja">
          {meta.titleJa}
        </p>
      )}

      {(meta.excerpt || note.preview) && <p className="card-excerpt">{meta.excerpt || note.preview}</p>}

      <footer className="card-foot">
        <span className="lang" title={`${LANG_LABELS[meta.lang].en} · ${LANG_LABELS[meta.lang].ja}`}>
          {LANG_LABELS[meta.lang].code}
        </span>
        {meta.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={tag === activeTag ? "tag is-on" : "tag"}
            onClick={() => onTag(tag)}
            title={`Show notes tagged #${tag}`}
          >
            #{tag}
          </button>
        ))}
        <time dateTime={meta.updated} title={`Updated ${new Date(meta.updated).toLocaleString("en-GB")}`}>
          {relativeTime(meta.updated)}
        </time>
      </footer>
    </article>
  );
}
