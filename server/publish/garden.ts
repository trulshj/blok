import { Document, isScalar, isSeq } from "yaml";
import { furiganaToHtml } from "../../shared/furigana.ts";
import { escapeBraces, mapProse, scanMdx } from "../../shared/mdx.ts";
import type { Note } from "../../shared/types.ts";
import { findVocabCards } from "../../shared/vocabcard.ts";
import { preview } from "../notes/preview.ts";

/** Where garden posts and their images live in the truls.dev repo. */
export const GARDEN_DIR = "src/content/garden";
export const GARDEN_IMAGES = "public/images/garden";
export const SITE_URL = "https://truls.dev";

export type GardenPost = {
  /** Repo-relative path of the post file. */
  file: string;
  /** The whole file: frontmatter and body. */
  content: string;
  /** The frontmatter block on its own, for previews. */
  frontmatter: string;
  /** Images to copy: a file in the note's folder → a repo-relative target. */
  images: { name: string; target: string }[];
};

// an image in the note's own folder: "./render.avif" or "render.avif"
const LOCAL_IMAGE = /^(?:\.\/)?([^/\\:?#]+\.(?:avif|png|jpe?g|webp|gif|svg))$/i;

/** MDX if the body imports anything or uses components (<VocabCard …/>); plain markdown otherwise. */
export function needsMdx(body: string): boolean {
  return /^\s*(import|export)\s/m.test(body) || /<[A-Z][A-Za-z0-9]*[\s/>]/.test(body);
}

/** Points images in the note's folder at the post's public folder; returns the new body and the files used. */
export function rewriteImages(body: string, slug: string): { body: string; names: string[] } {
  const names = new Set<string>();
  const rewritten = body.replace(/(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g, (whole, open: string, src: string, close: string) => {
    const local = LOCAL_IMAGE.exec(src);
    if (!local?.[1]) return whole; // /images/…, http(s) and anything else stay as they are
    names.add(local[1]);
    return `${open}/images/garden/${slug}/${local[1]}${close}`;
  });
  return { body: rewritten, names: [...names] };
}

export const VOCABCARD_IMPORT = 'import VocabCard from "../../components/VocabCard.astro";';

/**
 * The body as truls.dev gets it:
 * - Furigana in the text becomes <ruby>. Inside <VocabCard … /> it stays {…|…}, which the component reads.
 * - In .mdx, other { and } in the text are escaped, so MDX shows them instead of running them as code.
 * - A body with vocab cards gets the VocabCard import if it doesn't have it.
 */
export function publishBody(body: string, { mdx }: { mdx: boolean }): string {
  const regions = scanMdx(body);
  const out = mapProse(body, regions, (prose) => (mdx ? escapeBraces(furiganaToHtml(prose)) : furiganaToHtml(prose)));
  const needsImport = mdx && findVocabCards(body, regions).length > 0 && !/^import\s+VocabCard\b/m.test(body);
  return needsImport ? `${VOCABCARD_IMPORT}\n\n${out}` : out;
}

/**
 * The garden post for a note, in the style of the existing posts on truls.dev: title, pubDate
 * (a plain date), isDraft, excerpt, type, lang, status, inline tags, then image and titleJa
 * (which the site ignores until it learns about them).
 */
export function toGardenPost(note: Note, { slug, pubDate, draft }: { slug: string; pubDate: string; draft: boolean }): GardenPost {
  const { meta } = note;
  const { body, names } = rewriteImages(note.body, slug);
  const cover = meta.image ? LOCAL_IMAGE.exec(meta.image.src)?.[1] : undefined;
  if (cover && !names.includes(cover)) names.push(cover);

  const fields: Record<string, unknown> = {
    title: meta.title,
    pubDate,
    isDraft: draft,
    excerpt: meta.excerpt || preview(note.body) || undefined,
    type: meta.type,
    lang: meta.lang,
    status: meta.status,
    tags: meta.tags.length ? meta.tags : undefined,
    image: meta.image ? { src: cover ? `/images/garden/${slug}/${cover}` : meta.image.src, alt: meta.image.alt } : undefined,
    titleJa: meta.titleJa,
  };
  const doc = new Document(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)));
  const tags = doc.get("tags", true);
  if (isSeq(tags)) tags.flow = true;
  // a bare `no` is the boolean false to YAML 1.1 parsers; quote it so every parser reads Norwegian
  const lang = doc.get("lang", true);
  if (isScalar(lang)) lang.type = "QUOTE_DOUBLE";

  const frontmatter = `---\n${doc.toString({ lineWidth: 0 })}---\n`;
  const mdx = needsMdx(note.body);
  return {
    file: `${GARDEN_DIR}/${slug}.${mdx ? "mdx" : "md"}`,
    content: `${frontmatter}\n${publishBody(body, { mdx }).trimEnd()}\n`,
    frontmatter,
    images: names.map((name) => ({ name, target: `${GARDEN_IMAGES}/${slug}/${name}` })),
  };
}

export const postUrl = (slug: string) => `${SITE_URL}/garden/${slug}`;

/** Today as YYYY-MM-DD in local time, for pubDate. */
export function localDate(when: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}`;
}
