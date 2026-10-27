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
};

export type Note = NoteSummary & { body: string };

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

/** Server-sent events on /api/events. */
export type BlokEvent = { type: "notes"; slugs: string[] };
