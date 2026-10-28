import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";
import type { Note } from "../../shared/types.ts";
import { localDate, needsMdx, publishBody, rewriteImages, toGardenPost, VOCABCARD_IMPORT } from "./garden.ts";

// A copy of truls.dev's garden schema (src/content.config.ts). Astro reads frontmatter with
// js-yaml, where a plain 2026-10-28 is a Date; YAML 1.1 parsing mimics that here.
const GardenSchema = z.object({
  title: z.string(),
  pubDate: z.date(),
  isDraft: z.boolean().optional(),
  excerpt: z.string().optional(),
  image: z.object({ src: z.string(), alt: z.string() }).optional(),
  type: z.enum(["writing", "art", "story", "note", "visualization"]).default("writing"),
  lang: z.enum(["no", "en", "ja"]).default("no"),
  status: z.enum(["seedling", "budding", "evergreen"]).default("seedling"),
  tags: z.array(z.string()).optional(),
});

const frontmatterOf = (content: string) => parse(content.split("---\n")[1] ?? "", { version: "1.1" }) as Record<string, unknown>;

function note(over: Partial<Note["meta"]> = {}, body = "Walked Pontochō on Street View.\n\n![first pass](./render-01.avif)\n"): Note {
  return {
    slug: "kyoto-alley",
    problems: [],
    preview: "",
    body,
    meta: {
      title: "Kyoto alley: blockout",
      titleJa: "京都の路地",
      type: "art",
      lang: "no",
      status: "budding",
      tags: ["blender", "kyoto"],
      created: "2026-10-21T19:42:00.000Z",
      updated: "2026-10-28T08:00:00.000Z",
      ...over,
    },
  };
}

describe("toGardenPost", () => {
  it("writes frontmatter that truls.dev's schema accepts, with pubDate as a real date", () => {
    const post = toGardenPost(note(), { slug: "kyoto-alley", pubDate: "2026-10-28", draft: false });
    const data = frontmatterOf(post.content);

    const parsed = GardenSchema.parse(data);
    expect(parsed.pubDate).toBeInstanceOf(Date);
    expect(parsed).toMatchObject({ title: "Kyoto alley: blockout", lang: "no", type: "art", status: "budding", isDraft: false });
    expect(data.titleJa).toBe("京都の路地");
  });

  it("matches the style of the existing posts", () => {
    const post = toGardenPost(note(), { slug: "kyoto-alley", pubDate: "2026-10-28", draft: false });
    expect(post.frontmatter).toBe(
      [
        "---",
        'title: "Kyoto alley: blockout"',
        "pubDate: 2026-10-28",
        "isDraft: false",
        "excerpt: Walked Pontochō on Street View.",
        "type: art",
        'lang: "no"',
        "status: budding",
        "tags: [ blender, kyoto ]",
        "titleJa: 京都の路地",
        "---",
        "",
      ].join("\n"),
    );
    expect(post.file).toBe("src/content/garden/kyoto-alley.md");
  });

  it("points images at the post's public folder and lists them to copy, cover included", () => {
    const post = toGardenPost(note({ image: { src: "./cover.avif", alt: "The alley at night" } }), {
      slug: "kyoto-alley",
      pubDate: "2026-10-28",
      draft: false,
    });
    expect(post.content).toContain("![first pass](/images/garden/kyoto-alley/render-01.avif)");
    expect(frontmatterOf(post.content).image).toEqual({ src: "/images/garden/kyoto-alley/cover.avif", alt: "The alley at night" });
    expect(post.images).toEqual([
      { name: "render-01.avif", target: "public/images/garden/kyoto-alley/render-01.avif" },
      { name: "cover.avif", target: "public/images/garden/kyoto-alley/cover.avif" },
    ]);
  });

  it("uses the note's excerpt when it has one, and marks drafts", () => {
    const post = toGardenPost(note({ excerpt: "Lanterns and noren." }), { slug: "kyoto-alley", pubDate: "2026-10-28", draft: true });
    expect(frontmatterOf(post.content)).toMatchObject({ excerpt: "Lanterns and noren.", isDraft: true });
  });

  it("writes .mdx when the body uses components", () => {
    const body = 'import VocabCard from "../../components/VocabCard.astro";\n\n<VocabCard word="松明" />\n';
    const post = toGardenPost(note({}, body), { slug: "minecraft-vocab-1", pubDate: "2026-10-28", draft: false });
    expect(post.file).toBe("src/content/garden/minecraft-vocab-1.mdx");
    expect(post.content.endsWith('<VocabCard word="松明" />\n')).toBe(true);
  });
});

describe("publishBody", () => {
  it("turns furigana in the text into ruby, in .md and .mdx", () => {
    const ruby = "<ruby>提灯<rp>(</rp><rt>ちょうちん</rt><rp>)</rp></ruby>";
    expect(publishBody("## {提灯|ちょうちん}の光", { mdx: false })).toBe(`## ${ruby}の光`);
    expect(publishBody("{提灯|ちょうちん}の光", { mdx: true })).toBe(`${ruby}の光`);
  });

  it("leaves furigana in code and in VocabCard attributes as written", () => {
    const body = [
      "`{本|ほん}`",
      "```\n{本|ほん}\n```",
      VOCABCARD_IMPORT,
      '<VocabCard\n  word="松明"\n  example="{洞窟|どうくつ}の{松明}"\n/>',
    ].join("\n\n");
    expect(publishBody(body, { mdx: true })).toBe(body);
  });

  it("escapes other braces in .mdx text only", () => {
    expect(publishBody("a {b} c", { mdx: true })).toBe("a \\{b\\} c");
    expect(publishBody("a {b} c", { mdx: false })).toBe("a {b} c");
    expect(publishBody("\\{本|ほん} stays literal", { mdx: true })).toBe("\\{本|ほん\\} stays literal");
  });

  it("adds the VocabCard import when a body uses cards without it", () => {
    expect(publishBody('Intro\n\n<VocabCard word="羊" definition="Sheep" />', { mdx: true })).toBe(
      `${VOCABCARD_IMPORT}\n\nIntro\n\n<VocabCard word="羊" definition="Sheep" />`,
    );
  });
});

describe("rewriteImages", () => {
  it("leaves site paths and web addresses alone", () => {
    const body = "![a](/images/headshot-1.avif) ![b](https://example.com/b.png) ![c](render.avif \"title\")";
    expect(rewriteImages(body, "x")).toEqual({
      body: '![a](/images/headshot-1.avif) ![b](https://example.com/b.png) ![c](/images/garden/x/render.avif "title")',
      names: ["render.avif"],
    });
  });
});

it.each([
  ["Plain **markdown** with <b>html</b>", false],
  ['import X from "./x";\n\ntext', true],
  ["Text with <VocabCard word=\"x\" />", true],
  ["export const meta = {};", true],
])("needsMdx(%j) is %s", (body, mdx) => {
  expect(needsMdx(body)).toBe(mdx);
});

it("localDate gives YYYY-MM-DD in local time", () => {
  expect(localDate(new Date(2026, 9, 28, 23, 30))).toBe("2026-10-28");
});
