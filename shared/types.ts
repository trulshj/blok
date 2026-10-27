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
