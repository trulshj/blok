import { describe, expect, it } from "vitest";
import { escapeBraces, mapProse, regionAt, scanMdx, type Region } from "./mdx.ts";

const kinds = (text: string) => scanMdx(text).map((r: Region) => [r.kind, text.slice(r.from, r.to)]);

describe("scanMdx", () => {
  it("finds fenced code blocks, closed or not", () => {
    const text = "Before\n\n```js\nconst a = {x|y};\n```\n\nAfter\n\n~~~\nopen to the end";
    expect(kinds(text)).toEqual([
      ["code", "```js\nconst a = {x|y};\n```"],
      ["code", "~~~\nopen to the end"],
    ]);
  });

  it("finds inline code spans, with matching backtick runs", () => {
    expect(kinds("a `{漢字|かんじ}` b ``x ` y`` c")).toEqual([
      ["code", "`{漢字|かんじ}`"],
      ["code", "``x ` y``"],
    ]);
  });

  it("leaves a lone backtick as text, and stops code spans at a blank line", () => {
    expect(kinds("it`s fine")).toEqual([]);
    expect(kinds("a `b\n\nc` d")).toEqual([]);
  });

  it("finds multi-line JSX components with quoted and {…} attributes", () => {
    const card = '<VocabCard\n  word="松明"\n  example="洞窟の{松明}を>置く"\n  extra={{ a: "}" }}\n/>';
    expect(kinds(`Text\n\n${card}\n\nMore`)).toEqual([["jsx", card]]);
  });

  it("finds HTML tags and comments, fragments and closing tags", () => {
    expect(kinds("<ruby>漢<rt>かん</rt></ruby> <!-- {x|y} --> <>a</>")).toEqual([
      ["html", "<ruby>"],
      ["html", "<rt>"],
      ["html", "</rt>"],
      ["html", "</ruby>"],
      ["html", "<!-- {x|y} -->"],
      ["jsx", "<>"],
      ["jsx", "</>"],
    ]);
  });

  it("doesn't take comparisons or hearts for tags", () => {
    expect(kinds("a < b and c > d, <3, 1<2")).toEqual([]);
  });

  it("doesn't let a tag run across a blank line", () => {
    expect(kinds("<b\n\nnot a tag>")).toEqual([]);
  });

  it("finds import/export blocks at the start of a paragraph only", () => {
    const text = 'import VocabCard from "../../components/VocabCard.astro";\nimport X from "x";\n\nWe import things.\nexport is a word here';
    expect(kinds(text)).toEqual([["esm", 'import VocabCard from "../../components/VocabCard.astro";\nimport X from "x";']]);
  });

  it("skips escaped characters", () => {
    expect(kinds("\\`not code\\` \\<b>")).toEqual([]);
  });
});

describe("regionAt", () => {
  it("finds the region around a position", () => {
    const regions = scanMdx("a `b` c <X/> d");
    expect(regionAt(regions, 0)).toBeUndefined();
    expect(regionAt(regions, 2)?.kind).toBe("code");
    expect(regionAt(regions, 5)).toBeUndefined(); // to is exclusive
    expect(regionAt(regions, 9)?.kind).toBe("jsx");
  });
});

describe("mapProse and escapeBraces", () => {
  it("rewrites only the prose", () => {
    const text = "x {a} `{b}` <C d={e} /> {f}";
    expect(mapProse(text, scanMdx(text), escapeBraces)).toBe("x \\{a\\} `{b}` <C d={e} /> \\{f\\}");
  });

  it("keeps braces that are already escaped", () => {
    expect(escapeBraces("\\{a\\} {b}")).toBe("\\{a\\} \\{b\\}");
  });
});
