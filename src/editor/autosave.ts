/**
 * Autosave timing, kept apart from React so it can be tested with fake timers.
 *
 * Saves `debounceMs` after the last edit, and at least every `maxWaitMs` while edits keep coming.
 * One save runs at a time; edits made during a save trigger another one. A conflict (the note
 * changed on disk since it was loaded) stops autosaving until it's resolved with reset() or overwrite().
 */

export type SaveStatus =
  | { state: "saved"; at: string }
  | { state: "dirty" }
  | { state: "saving" }
  | { state: "blocked"; message: string }
  | { state: "error"; message: string }
  | { state: "conflict" };

/** Thrown by `save` when the version on disk isn't the one the draft was based on. */
export class ConflictError extends Error {}

type Options = {
  /** The version on disk the draft starts from. */
  base: string;
  /** Writes the draft. `base` is the version it builds on, or undefined to overwrite. Resolves with the new version. */
  save: (base: string | undefined) => Promise<string>;
  onStatus: (status: SaveStatus) => void;
  /** Why the draft can't be saved right now (e.g. an empty title), or null. */
  blocked?: () => string | null;
  debounceMs?: number;
  maxWaitMs?: number;
  now?: () => number;
};

export type Autosaver = ReturnType<typeof createAutosaver>;

export function createAutosaver({
  base: initialBase,
  save,
  onStatus,
  blocked = () => null,
  debounceMs = 800,
  maxWaitMs = 5000,
  now = Date.now,
}: Options) {
  let base = initialBase;
  let revision = 0; // bumped on every edit
  let savedRevision = 0; // the revision on disk
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirtySince: number | null = null;
  let inFlight: Promise<void> | null = null;
  let conflict = false;
  let last: SaveStatus["state"] | null = null;

  const unsaved = () => revision !== savedRevision;

  function emit(status: SaveStatus) {
    // "dirty" and "saving" carry no details, so don't repeat them on every keystroke
    if ((status.state === "dirty" || status.state === "saving") && status.state === last) return;
    last = status.state;
    onStatus(status);
  }

  function schedule() {
    clearTimeout(timer);
    const t = now();
    dirtySince ??= t;
    const wait = Math.max(0, Math.min(debounceMs, dirtySince + maxWaitMs - t));
    timer = setTimeout(() => void run(false), wait);
  }

  async function run(overwrite: boolean): Promise<void> {
    if (inFlight) {
      await inFlight;
      if (overwrite || (unsaved() && !conflict)) return run(overwrite);
      return;
    }
    clearTimeout(timer);
    if (conflict && !overwrite) return;
    if (!unsaved() && !overwrite) return;

    const reason = blocked();
    if (reason) {
      emit({ state: "blocked", message: reason });
      return;
    }

    dirtySince = null;
    const revisionSaving = revision;
    emit({ state: "saving" });

    inFlight = (async () => {
      try {
        base = await save(overwrite ? undefined : base);
        savedRevision = revisionSaving;
        conflict = false;
        if (unsaved()) {
          emit({ state: "dirty" });
          schedule();
        } else {
          emit({ state: "saved", at: base });
        }
      } catch (err) {
        if (err instanceof ConflictError) {
          conflict = true;
          emit({ state: "conflict" });
        } else {
          emit({ state: "error", message: (err as Error).message });
        }
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return {
    /** Call after every edit. */
    change() {
      revision++;
      if (conflict) return;
      emit({ state: "dirty" });
      schedule();
    },
    /** Save now if there's anything unsaved (Ctrl/⌘+S, renames). */
    saveNow: () => run(false),
    /** Save over whatever is on disk, to resolve a conflict with "keep mine". */
    overwrite: () => run(true),
    /** The draft now equals `version` on disk, e.g. after loading a change made elsewhere. */
    reset(version: string) {
      clearTimeout(timer);
      dirtySince = null;
      base = version;
      savedRevision = revision;
      conflict = false;
      emit({ state: "saved", at: version });
    },
    /** The note changed on disk while there are unsaved edits. */
    markConflict() {
      clearTimeout(timer);
      conflict = true;
      emit({ state: "conflict" });
    },
    /** Stop the pending timer (on unmount). */
    cancel() {
      clearTimeout(timer);
    },
    base: () => base,
    hasUnsaved: unsaved,
    isSaving: () => inFlight !== null,
  };
}
