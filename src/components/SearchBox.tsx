import { useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "wouter";
import { MOD_KEY_LABEL } from "../lib/platform.ts";

/** Search field in the top bar. Lives in the index URL (?q=), and jumps to the index from other screens. */
export function SearchBox() {
  const [location, navigate] = useLocation();
  const [params, setParams] = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const q = location === "/" ? (params.get("q") ?? "") : "";

  // Ctrl+K / ⌘K focuses search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const change = (value: string) => {
    if (location !== "/") {
      navigate(value ? `/?q=${encodeURIComponent(value)}` : "/");
      return;
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("q", value);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  };

  return (
    <label className="search">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M10 10l4.5 4.5" stroke="currentColor" strokeWidth="2" />
      </svg>
      <input
        ref={input}
        type="search"
        value={q}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            change("");
            e.currentTarget.blur();
          }
        }}
        placeholder="Search notes · 検索"
        aria-label="Search notes"
        spellCheck={false}
      />
      <kbd>{MOD_KEY_LABEL}</kbd>
    </label>
  );
}
