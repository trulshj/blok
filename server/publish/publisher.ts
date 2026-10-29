import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import type {
  ImportablePost,
  NoteMeta,
  PublishInfo,
  PublishPreview,
  PublishResult,
  PublishWarning,
} from "../../shared/types.ts";
import {
  branchName,
  counts,
  explainGitError,
  git,
  gitMaybe,
  isRepo,
  operationInProgress,
  rebaseOnto,
  refExists,
  remoteName,
} from "../git.ts";
import { parseNoteFile, rawFrontmatter } from "../notes/frontmatter.ts";
import type { NoteStore } from "../notes/store.ts";
import { GARDEN_DIR, GARDEN_IMAGES, localDate, postUrl, toGardenPost } from "./garden.ts";

export class PublishError extends Error {
  code: PublishWarning["code"] | "busy";
  constructor(code: PublishError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** Warnings that `force` may override: both mean "this replaces a post file blok didn't write". */
const OVERRIDABLE = new Set<PublishWarning["code"]>(["edited", "slug-taken"]);

/** sha256 of a post, ignoring line endings (a checkout on Windows may turn LF into CRLF). */
const fingerprint = (text: string) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");

/**
 * Publishes notes into the truls.dev repo as garden posts: writes the post and its images,
 * commits only those paths (never anything else lying around in truls.dev), and pushes main,
 * which Vercel deploys. Also imports existing garden posts as notes.
 */
export function createPublisher({ siteDir, store, now = () => new Date() }: { siteDir: string; store: NoteStore; now?: () => Date }) {
  let busy = false;
  const abs = (rel: string) => join(siteDir, ...rel.split("/"));

  async function siteWarnings(): Promise<PublishWarning[]> {
    if (!existsSync(siteDir)) {
      return [{ code: "no-site", message: `truls.dev isn't at ${siteDir}. Set trulsDevDir in blok.config.json.`, blocking: true }];
    }
    if (!isRepo(siteDir)) {
      return [{ code: "not-repo", message: `${siteDir} isn't a git repository.`, blocking: true }];
    }
    const warnings: PublishWarning[] = [];
    const branch = await branchName(siteDir);
    if (branch !== "main") {
      warnings.push({
        code: "wrong-branch",
        message: `truls.dev is on ${branch ?? "a detached HEAD"}, but posts go out from main. Switch to main first.`,
        blocking: true,
      });
    }
    if (operationInProgress(siteDir)) {
      warnings.push({ code: "unfinished-git", message: "A rebase or merge is unfinished in truls.dev. Finish it first.", blocking: true });
    }
    const remote = await remoteName(siteDir);
    if (remote && branch && (await refExists(siteDir, `${remote}/${branch}`))) {
      const [ahead] = await counts(siteDir, `${remote}/${branch}`);
      if (ahead > 0) {
        warnings.push({
          code: "other-commits",
          message: `truls.dev has ${ahead} unpushed ${ahead === 1 ? "commit" : "commits"} of its own, which will be pushed too.`,
          blocking: false,
        });
      }
    }
    return warnings;
  }

  /** Everything publishing would do, without doing it. */
  async function plan(slug: string, draft: boolean) {
    const note = await store.get(slug);
    const prev = note.meta.published;
    const gardenSlug = prev?.slug ?? slug;
    const pubDate = prev?.pubDate ?? localDate(now());
    const post = toGardenPost(note, { slug: gardenSlug, pubDate, draft });
    const warnings = await siteWarnings();

    if (!warnings.some((w) => w.code === "no-site" || w.code === "not-repo")) {
      if (prev) {
        const onDisk = await readFile(abs(prev.file), "utf8").catch(() => null);
        if (onDisk === null) {
          warnings.push({ code: "file-gone", message: `${prev.file} is no longer in truls.dev; publishing writes it again.`, blocking: false });
        } else if (fingerprint(onDisk) !== prev.hash) {
          warnings.push({
            code: "edited",
            message: `${prev.file} was edited in truls.dev after blok last published it. Publishing replaces those edits.`,
            blocking: true,
          });
        }
      } else {
        const clash = [".md", ".mdx"].map((ext) => `${GARDEN_DIR}/${gardenSlug}${ext}`).find((f) => existsSync(abs(f)));
        if (clash) {
          warnings.push({
            code: "slug-taken",
            message: `truls.dev already has ${clash}, which isn't linked to this note. Publishing replaces it.`,
            blocking: true,
          });
        }
      }
    }

    const missing = post.images.filter((img) => !existsSync(join(store.dir, slug, img.name)));
    for (const img of missing) {
      warnings.push({ code: "missing-image", message: `${img.name} is linked but isn't in the note's folder.`, blocking: false });
    }
    post.images = post.images.filter((img) => !missing.includes(img));

    return { note, prev, post, gardenSlug, pubDate, warnings };
  }

  async function preview(slug: string): Promise<PublishPreview> {
    const { prev, post, gardenSlug, warnings } = await plan(slug, false);
    return {
      state: !prev ? "new" : prev.draft ? "draft" : "update",
      slug: gardenSlug,
      file: post.file,
      url: postUrl(gardenSlug),
      frontmatter: post.frontmatter,
      images: post.images.map((img) => img.target),
      warnings,
    };
  }

  /** Writes, commits and pushes the post. With `draft`, it's an unpublish (isDraft: true). */
  async function publish(slug: string, { force = false, draft = false } = {}): Promise<PublishResult> {
    if (busy) throw new PublishError("busy", "Already publishing; wait a moment.");
    busy = true;
    try {
      const { note, prev, post, gardenSlug, pubDate, warnings } = await plan(slug, draft);
      const stop = warnings.find((w) => w.blocking && !(force && OVERRIDABLE.has(w.code)));
      if (stop) throw new PublishError(stop.code, stop.message);

      // 1. the post file, written whole or not at all; drop the old one if the extension changed
      const paths = [post.file];
      await mkdir(dirname(abs(post.file)), { recursive: true });
      const temp = `${abs(post.file)}.${randomUUID().slice(0, 8)}.tmp`;
      await writeFile(temp, post.content);
      await rename(temp, abs(post.file));
      if (prev && prev.file !== post.file && existsSync(abs(prev.file))) {
        await unlink(abs(prev.file));
        paths.push(prev.file);
      }

      // 2. images: blok owns public/images/garden/<slug>/, so it also removes what the post stopped using
      const imageDir = `${GARDEN_IMAGES}/${gardenSlug}`;
      if (post.images.length) await mkdir(abs(imageDir), { recursive: true });
      for (const img of post.images) await copyFile(join(store.dir, slug, img.name), abs(img.target));
      if (existsSync(abs(imageDir))) {
        const keep = new Set(post.images.map((img) => img.name));
        for (const file of await readdir(abs(imageDir))) if (!keep.has(file)) await unlink(join(abs(imageDir), file));
      }
      if (existsSync(abs(imageDir)) || (await gitMaybe(siteDir, ["ls-files", "--", imageDir]))) paths.push(imageDir);

      // 3. commit just these paths
      await git(siteDir, ["add", "-A", "--", ...paths]);
      const staged = (await git(siteDir, ["diff", "--cached", "--name-only", "--", ...paths])).split("\n").filter(Boolean);
      let commit: string | null = null;
      if (staged.length) {
        const verb = draft ? "Unpublish" : prev && !prev.draft ? "Update" : "Publish";
        try {
          await git(siteDir, ["commit", "--quiet", "-m", `${verb} ${note.meta.title}\n\nFrom blok on ${hostname()}`, "--", ...paths]);
        } catch (err) {
          throw new PublishError("unfinished-git", explainGitError(err));
        }
        commit = await git(siteDir, ["rev-parse", "--short", "HEAD"]);
      }

      // 4. push, after catching up with the remote
      let pushed = false;
      let pushError: string | null = null;
      try {
        pushed = await push();
      } catch (err) {
        pushError = err instanceof Error ? err.message : String(err);
      }

      const published: PublishInfo = {
        slug: gardenSlug,
        file: post.file,
        pubDate,
        at: now().toISOString(),
        hash: fingerprint(post.content),
        draft,
      };
      await store.setPublished(slug, published);
      return { url: postUrl(gardenSlug), commit, pushed, pushError, published };
    } finally {
      busy = false;
    }
  }

  /** Pushes truls.dev's branch; resolves false when there was nothing to push. */
  async function push(): Promise<boolean> {
    const remote = await remoteName(siteDir);
    const branch = await branchName(siteDir);
    if (!remote || !branch) throw new Error("truls.dev has no remote to push to.");
    try {
      await git(siteDir, ["fetch", "--quiet", remote]);
    } catch (err) {
      throw new Error(explainGitError(err));
    }
    const upstream = `${remote}/${branch}`;
    if (await refExists(siteDir, upstream)) {
      const [, behind] = await counts(siteDir, upstream);
      if (behind > 0) {
        // rebasing needs a clean tree; stashing someone's work in progress could leave conflict markers in it
        const dirty = await git(siteDir, ["status", "--porcelain", "--untracked-files=no"]);
        if (dirty) {
          throw new Error(
            `GitHub has ${behind} newer ${behind === 1 ? "commit" : "commits"} for truls.dev, and truls.dev has uncommitted changes, ` +
              `so blok left it alone. The post is committed in ${siteDir}; commit or stash your other changes, git pull, then publish again.`,
          );
        }
        const conflicted = await rebaseOnto(siteDir, upstream);
        if (conflicted) {
          throw new Error(
            `truls.dev changed on GitHub in a way that clashes with this publish (${conflicted.join(", ") || "some files"}). ` +
              `It's committed in ${siteDir}; run git pull --rebase there, sort it out, and push.`,
          );
        }
      }
      const [ahead] = await counts(siteDir, upstream);
      if (ahead === 0) return false;
    }
    try {
      await git(siteDir, ["push", "--quiet", remote, branch]);
    } catch (err) {
      throw new Error(explainGitError(err));
    }
    return true;
  }

  // ---------- importing existing garden posts ----------

  async function gardenFiles(): Promise<string[]> {
    if (!existsSync(abs(GARDEN_DIR))) return [];
    const linked = new Set((await store.list()).map((n) => n.meta.published?.file).filter(Boolean));
    return (await readdir(abs(GARDEN_DIR)))
      .filter((f) => /\.mdx?$/.test(f))
      .map((f) => `${GARDEN_DIR}/${f}`)
      .filter((f) => !linked.has(f))
      .sort();
  }

  async function importable(): Promise<ImportablePost[]> {
    return Promise.all(
      (await gardenFiles()).map(async (file) => {
        const raw = rawFrontmatter(await readFile(abs(file), "utf8"));
        const slug = file.slice(GARDEN_DIR.length + 1).replace(/\.mdx?$/, "");
        return { file, slug, title: typeof raw.title === "string" ? raw.title : slug, draft: raw.isDraft === true };
      }),
    );
  }

  /** Creates a note for every garden post that isn't linked yet. Safe to run again. */
  async function importPosts(): Promise<{ slug: string; title: string }[]> {
    const imported: { slug: string; title: string }[] = [];
    for (const file of await gardenFiles()) {
      const text = await readFile(abs(file), "utf8");
      const raw = rawFrontmatter(text);
      const slug = file.slice(GARDEN_DIR.length + 1).replace(/\.mdx?$/, "");

      // dates from the file's git history: first commit = created, last = updated
      const log = ((await gitMaybe(siteDir, ["log", "--format=%aI", "--follow", "--", file])) ?? "").split("\n").filter(Boolean);
      const pubDate = dateOnly(raw.pubDate) ?? localDate(now());
      const created = log.at(-1) ?? new Date(`${pubDate}T12:00:00`).toISOString();
      const updated = log[0] ?? created;

      const parsed = parseNoteFile(text, { title: slug, created: new Date(created), updated: new Date(updated) });
      // garden defaults where the post leaves fields out (blok's own defaults differ)
      const meta: NoteMeta = {
        ...parsed.meta,
        type: raw.type === undefined ? "longread" : parsed.meta.type,
        lang: raw.lang === undefined ? "no" : parsed.meta.lang,
        created,
        updated,
        published: { slug, file, pubDate, at: updated, hash: fingerprint(text), draft: raw.isDraft === true },
      };
      const note = await store.importNote(slug, meta, parsed.body);
      imported.push({ slug: note.slug, title: note.meta.title });
    }
    return imported;
  }

  return { preview, publish, unpublish: (slug: string, opts: { force?: boolean } = {}) => publish(slug, { ...opts, draft: true }), importable, importPosts };
}

export type Publisher = ReturnType<typeof createPublisher>;

/** "2025-06-10" from a frontmatter date (a string, or a Date if something parsed it as one). */
function dateOnly(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}
