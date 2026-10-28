import { useState } from "react";
import { normalizeTags } from "../../shared/tags.ts";

/** Tags as removable chips plus a field: Enter or comma adds, Backspace on an empty field removes the last one. */
export function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState("");

  const add = (raw: string) => {
    const next = normalizeTags([...tags, ...raw.split(",")]);
    if (next.length !== tags.length) onChange(next);
    setText("");
  };

  return (
    <div className="tags-edit">
      {tags.map((tag) => (
        <span key={tag} className="tag-chip">
          #{tag}
          <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(tags.filter((t) => t !== tag))}>
            ×
          </button>
        </span>
      ))}
      <input
        className="tags-edit-input"
        value={text}
        placeholder="+ add"
        aria-label="Add a tag"
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return; // Enter confirms Japanese input, it shouldn't add the tag yet
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => text.trim() && add(text)}
      />
    </div>
  );
}
