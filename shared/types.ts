// Shapes shared by the server and the client.

export type SetupStatus = {
  /** The notes folder exists with a notes/ subfolder and the config is usable. */
  ready: boolean;
  config: {
    source: "file" | "defaults";
    path: string;
    error: string | null;
  };
  notes: {
    /** As written in the config, e.g. "../blok-notes". */
    raw: string;
    path: string;
    exists: boolean;
    isGitRepo: boolean;
  };
  trulsDev: {
    raw: string | null;
    path: string | null;
    exists: boolean;
  };
};

export type SetupRequest = {
  notesDir: string;
  gitInit: boolean;
};

// ---------- notes ----------
// The fields mirror the truls.dev garden schema, so publishing later is a mapping.

export const NOTE_TYPES = ["writing", "art", "story", "note", "visualization"] as const;
export const NOTE_LANGS = ["no", "en", "ja"] as const;
export const NOTE_STATUSES = ["seedling", "budding", "evergreen"] as const;

export type NoteType = (typeof NOTE_TYPES)[number];
export type NoteLang = (typeof NOTE_LANGS)[number];
export type NoteStatus = (typeof NOTE_STATUSES)[number];

export type NoteMeta = {
  title: string;
  /** Optional Japanese title, shown on the vertical slab (和題). */
  titleJa?: string;
  type: NoteType;
  lang: NoteLang;
  status: NoteStatus;
  tags: string[];
  excerpt?: string;
  image?: { src: string; alt: string };
  /** ISO timestamps, set by the server. */
  created: string;
  updated: string;
};

/** What the client may send when editing; the server owns created/updated. */
export type NoteMetaInput = Omit<NoteMeta, "created" | "updated">;

export type NoteSummary = {
  slug: string;
  meta: NoteMeta;
  /** Frontmatter values blok couldn't use, e.g. "type: unknown value poem". Defaults were used instead. */
  problems: string[];
  /** Plain text from the start of the body, for cards. */
  preview: string;
};

export type Note = NoteSummary & { body: string };

export type SearchResult = { slug: string; score: number };

/** An image in a note's folder. `src` is how markdown links it: "./render-01.avif". */
export type NoteImage = { file: string; src: string; width: number; height: number; bytes: number };

/** A freshly uploaded image, with markdown ready to insert. */
export type UploadedImage = NoteImage & { markdown: string };

export type CreateNoteRequest = Partial<NoteMetaInput> & { title: string; body?: string };

export type UpdateNoteRequest = {
  meta: NoteMetaInput;
  body: string;
  /** The `updated` value the client loaded. If the file has changed since, the save is refused. */
  baseUpdated?: string;
};

export type RenameNoteRequest = {
  /** New slug. Leave out to derive it from the current title. */
  slug?: string;
};

// ---------- git sync of the notes folder ----------

export type SyncStatus = {
  /** not-repo: no git; no-remote: git but nowhere to push; otherwise how it compares to the remote. */
  state: "not-repo" | "no-remote" | "clean" | "changes" | "behind" | "diverged" | "busy";
  branch: string | null;
  /** e.g. "origin/main" */
  upstream: string | null;
  /** Files changed since the last commit. */
  changed: number;
  /** Commits to push, and to pull as of the last fetch. */
  ahead: number;
  behind: number;
  fetchedAt: string | null;
  syncedAt: string | null;
  /** Why the last sync failed, until the next one works. */
  error: string | null;
};

export type SyncResult = { committed: number; pulled: number; pushed: number; status: SyncStatus };

/** Server-sent events on /api/events. */
export type BlokEvent = { type: "notes"; slugs: string[] };
