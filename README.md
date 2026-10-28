# blok

Truls' notatblokk: a local note-taking app that will grow posts for [truls.dev](https://www.truls.dev).
Notes are markdown files in their own folder, which is its own git repository, so they sync between machines with git.

## Run it (Windows or Mac)

You need Node 24 or newer (see `.nvmrc`) and git.

```bash
npm install
npm run dev
```

Open http://localhost:4747. The first run shows a setup screen that creates the notes folder and can make it a
git repository. By default it's `../blok-notes`, next to this checkout.

## Using it

- Notes save by themselves a moment after you stop typing. `Ctrl/⌘ + S` saves right away.
- `Ctrl/⌘ + K` jumps to search. It finds Japanese words inside sentences too.
- Markup like `##` and `**` hides on every line except the one you're editing.
- If a note changes on disk while you have unsaved edits (a `git pull`, say), blok asks whether to keep
  your version or load the one on disk. It never overwrites either one silently.
- Deleting moves a note to `notes/.trash/`.

## Config

Each machine has its own `blok.config.json`, which isn't committed. The setup screen writes it, or you can copy
`blok.config.example.json`:

| Key           | Default          | What it is                                                  |
| ------------- | ---------------- | ----------------------------------------------------------- |
| `notesDir`    | `../blok-notes`  | Where notes live. Relative paths start from this folder.    |
| `trulsDevDir` | `../truls.dev`   | The truls.dev checkout, for publishing later.               |
| `port`        | `4747`           | Where blok runs. In dev, the API uses the next port (4748). |

## Scripts

| Command             | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `npm run dev`       | Vite for the UI plus the API server, both reloading on changes. |
| `npm start`         | Builds the UI and serves everything from one server.            |
| `npm test`          | Runs the tests (Vitest).                                        |
| `npm run typecheck` | Type-checks with TypeScript.                                    |

The server is plain TypeScript that Node 24 runs directly, so it has no build step.

## Layout

- `server/`: Hono API (config, setup, request guard)
- `server/notes/`: the notes core: frontmatter, slugs, the note store (create, edit, rename, trash) and the
  file watcher behind the live `/api/events` stream
- `src/`: React UI. `src/editor/` has the CodeMirror editor, live styling and autosave.
- `shared/`: types used by both
- `design/`: the design system: `tokens.css`, the tile generator `tiles.js` (shared with the app), and
  `sketch.html`. With `npm run dev` running, the sketch is at http://localhost:4747/design/sketch.html.
