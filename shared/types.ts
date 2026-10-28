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
  /** Where and when this note went out as a garden post on truls.dev. Set by the server. */
  published?: PublishInfo;
};

export type PublishInfo = {
  /** The post's slug on truls.dev: /garden/<slug> */
  slug: string;
  /** Repo-relative path of the post file, e.g. "src/content/garden/kyoto-alley.md". */
  file: string;
  /** First publish date (YYYY-MM-DD), kept on republish. */
  pubDate: string;
  /** Last publish (ISO). */
  at: string;
  /** sha256 of the file blok last wrote, to notice edits made directly in truls.dev. */
  hash: string;
  /** Unpublished: the post is there with isDraft: true. */
  draft: boolean;
};

/** What the client may send when editing; the server owns the timestamps and publish info. */
export type NoteMetaInput = Omit<NoteMeta, "created" | "updated" | "published">;

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

// ---------- publishing to truls.dev ----------

export type PublishWarning = {
  code: "no-site" | "not-repo" | "wrong-branch" | "unfinished-git" | "edited" | "slug-taken" | "missing-image" | "other-commits" | "file-gone";
  message: string;
  /** Stops publishing; "edited" and "slug-taken" can be overridden with force. */
  blocking: boolean;
};

export type PublishPreview = {
  /** new: never published; update: live now; draft: unpublished (isDraft). */
  state: "new" | "update" | "draft";
  slug: string;
  file: string;
  url: string;
  /** The frontmatter block as it will be written. */
  frontmatter: string;
  /** Repo-relative image files that will be copied. */
  images: string[];
  warnings: PublishWarning[];
};

export type PublishResult = {
  url: string;
  /** Short commit hash, or null when nothing changed. */
  commit: string | null;
  pushed: boolean;
  /** Why the push didn't happen, if it didn't. */
  pushError: string | null;
  published: PublishInfo;
};

export type ImportablePost = { file: string; slug: string; title: string; draft: boolean };

// ---------- Japanese ----------

/** A word from the reading service. `reading` is a hiragana suggestion, set for words with kanji. */
export type ReadingToken = { surface: string; reading: string | null };

/** POST /api/japanese/readings: the words of each text, in order. */
export type ReadingsRequest = { texts: string[] };
export type ReadingsResponse = { results: ReadingToken[][] };

// ---------- vocab inbox ----------

/** A word saved for later, in blok-notes/vocab/<id>.yaml. */
export type VocabEntry = {
  /** The file name: YYYYMMDD-HHmmss-xxxx. */
  id: string;
  word: string;
  reading: string;
  meaning: string;
  /** Example sentence; {word} highlights, {漢字|かんじ} adds furigana, as in vocab cards. */
  example?: string;
  translation?: string;
  /** A note about the word, like the card's context. */
  context?: string;
  /** Where the word came from: a game, a book, a sign. */
  source?: string;
  /** ISO timestamp, set by the server. */
  added: string;
  /** Notes the word went into as a vocab card. */
  used: string[];
};

export type VocabInput = Omit<VocabEntry, "id" | "added" | "used"> & { used?: string[] };

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
export type BlokEvent = { type: "notes"; slugs: string[] } | { type: "vocab" };
