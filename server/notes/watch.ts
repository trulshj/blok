import { watch } from "chokidar";
import { relative, sep } from "node:path";
import { isValidSlug } from "./slug.ts";

export type NotesWatcher = { ready: Promise<void>; close: () => Promise<void> };

/**
 * Watches the notes/ folder and calls `onChange` with the slugs of note folders that changed,
 * whether blok, an editor or a git pull changed them. Bursts are batched into one call.
 */
export function watchNotes(dir: string, onChange: (slugs: string[]) => void, { debounceMs = 150 } = {}): NotesWatcher {
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;

  const slugOf = (path: string) => relative(dir, path).split(sep)[0] ?? "";

  const watcher = watch(dir, {
    ignoreInitial: true,
    // skip .trash and other dot-folders, and blok's own temp files
    ignored: (path: string) => slugOf(path).startsWith(".") || path.endsWith(".tmp"),
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 },
  });

  watcher.on("all", (_event, path) => {
    const slug = slugOf(path);
    if (!isValidSlug(slug)) return;
    pending.add(slug);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const slugs = [...pending].sort();
      pending.clear();
      onChange(slugs);
    }, debounceMs);
  });

  const ready = new Promise<void>((done) => watcher.once("ready", () => done()));

  return {
    ready,
    close: async () => {
      clearTimeout(timer);
      await watcher.close();
    },
  };
}
