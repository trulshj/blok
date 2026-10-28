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
- Drop or paste images into a note (or use the drop area under the text). They're converted to AVIF, at
  most 2400px wide, without the original metadata (no GPS from phone photos), and saved next to the note.
  Pick a cover in the details panel.

## Syncing between machines

The **Sync** button in the top bar (`● SYNCED 同期済み ↑0 ↓0`) runs these steps on the notes folder:

1. Commits everything. The message names the changed notes and this machine.
2. Fetches from the remote.
3. Rebases onto anything new.
4. Pushes.

↑ is local changes to send, ↓ is commits waiting on the remote, which blok checks at most once a minute.

If the same note changed on both machines in ways git can't combine, blok undoes the sync, so the folder
stays clean and your commit is kept. It then tells you which notes clash and the commands to finish in a
terminal. Git never waits for a password: if it can't log in, push once from a terminal so your
credentials are saved.

## Publishing to truls.dev

A note's details panel has a **truls.dev** section. **Publish…** opens a preview of exactly what will
happen: the file (`src/content/garden/<slug>.md`, or `.mdx` when the note uses components), the
frontmatter, and the images to copy. Then blok:

1. Writes the post and copies images to `public/images/garden/<slug>/`, rewriting `./image.avif` links.
2. Commits only those files in truls.dev, never your other work there.
3. Pushes `main`, which Vercel deploys.

- **Republishing** updates the post and keeps the first publish date.
- **Unpublish** sets `isDraft: true`.
- **Edited posts:** if a post was edited directly in truls.dev, or its slug belongs to another post,
  blok asks before replacing it.
- **Newer commits on GitHub:**
  - If truls.dev is clean, blok rebases first.
  - If it has uncommitted changes, blok leaves them alone: the post stays committed locally, and blok
    asks you to pull.
- **Import:** garden posts already on truls.dev can be imported from the banner on the index.

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

- `server/`: Hono API (config, setup, request guard, git sync)
- `server/publish/`: publishing notes to truls.dev, and importing its garden posts
- `server/notes/`: the notes core: frontmatter, slugs, the note store (create, edit, rename, trash) and the
  file watcher behind the live `/api/events` stream
- `src/`: React UI. `src/editor/` has the CodeMirror editor, live styling and autosave.
- `shared/`: types used by both
- `design/`: the design system: `tokens.css`, the tile generator `tiles.js` (shared with the app), and
  `sketch.html`. With `npm run dev` running, the sketch is at http://localhost:4747/design/sketch.html.
