import { NOTE_LANGS, NOTE_STATUSES, NOTE_TYPES } from "../../shared/types.ts";
import { isFiltered, toggle, type Filters, type SortKey } from "../lib/filters.ts";
import { LANG_LABELS, STATUS_LABELS, TYPE_LABELS } from "../lib/labels.ts";
import { Stamp } from "./Stamp.tsx";

type Props = {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
  tags: [string, number][];
};

/** Type, language, status and tag filters plus sorting. Empty selections mean "all". */
export function FilterBar({ filters, onChange, tags }: Props) {
  return (
    <div className="filters" role="group" aria-label="Filter notes">
      <div className="fgroup">
        <span className="flabel">
          Type<span lang="ja">種類</span>
        </span>
        <button
          type="button"
          className={filters.types.length === 0 ? "chip is-on" : "chip"}
          aria-pressed={filters.types.length === 0}
          onClick={() => onChange({ types: [] })}
        >
          All<span lang="ja">すべて</span>
        </button>
        {NOTE_TYPES.map((type) => {
          const on = filters.types.includes(type);
          return (
            <button
              key={type}
              type="button"
              className={on ? "chip is-on" : "chip"}
              data-type={type}
              aria-pressed={on}
              onClick={() => onChange({ types: toggle(filters.types, type) })}
            >
              <i className="sw" />
              {TYPE_LABELS[type].short}
              <span lang="ja">{TYPE_LABELS[type].ja}</span>
            </button>
          );
        })}
      </div>

      <div className="fgroup">
        <span className="flabel">
          Lang<span lang="ja">言語</span>
        </span>
        {NOTE_LANGS.map((lang) => {
          const on = filters.langs.includes(lang);
          return (
            <button
              key={lang}
              type="button"
              className={on ? "chip is-on" : "chip"}
              aria-pressed={on}
              title={LANG_LABELS[lang].ja}
              onClick={() => onChange({ langs: toggle(filters.langs, lang) })}
            >
              {LANG_LABELS[lang].code}
            </button>
          );
        })}
      </div>

      <div className="fgroup">
        <span className="flabel">
          Status<span lang="ja">状態</span>
        </span>
        <div className="fstamps">
          {NOTE_STATUSES.map((status) => {
            const on = filters.statuses.includes(status);
            // with nothing picked every stamp shows as active, since all statuses are shown
            const lit = on || filters.statuses.length === 0;
            return (
              <button
                key={status}
                type="button"
                className={lit ? "stamp-btn is-on" : "stamp-btn"}
                aria-pressed={on}
                title={STATUS_LABELS[status].en}
                onClick={() => onChange({ statuses: toggle(filters.statuses, status) })}
              >
                <Stamp status={status} size={34} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="fgroup fgroup--end">
        <label className="fgroup">
          <span className="flabel">
            Tag<span lang="ja">タグ</span>
          </span>
          <select className="select" value={filters.tag ?? ""} onChange={(e) => onChange({ tag: e.target.value || null })}>
            <option value="">All tags</option>
            {tags.map(([tag, count]) => (
              <option key={tag} value={tag}>
                #{tag} ({count})
              </option>
            ))}
          </select>
        </label>
        {isFiltered(filters) && (
          <button
            type="button"
            className="chip chip--clear"
            onClick={() => onChange({ types: [], langs: [], statuses: [], tag: null, q: "" })}
          >
            Clear<span lang="ja">解除</span>
          </button>
        )}
        <label className="sort">
          <span className="visually-hidden">Sort by</span>
          <select className="select" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })}>
            <option value="updated">Updated ↓</option>
            <option value="created">Created ↓</option>
            <option value="title">Title A–Z</option>
          </select>
        </label>
      </div>
    </div>
  );
}
