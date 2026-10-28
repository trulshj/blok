import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { altFromName, ImageError, toAvif } from "./images.ts";

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#FFA947" } });

describe("toAvif", () => {
  it("makes AVIF, at most 2400px on the long side", async () => {
    const { data, width, height } = await toAvif(await solid(3000, 1500).png().toBuffer());
    const meta = await sharp(data).metadata();

    expect([width, height]).toEqual([2400, 1200]);
    expect(meta.format).toBe("heif");
    expect(meta.compression).toBe("av1");
  });

  it("never enlarges small images", async () => {
    const { width, height } = await toAvif(await solid(640, 480).jpeg().toBuffer());
    expect([width, height]).toEqual([640, 480]);
  });

  it("turns photos upright and drops their metadata (no GPS in the repo)", async () => {
    const photo = await solid(200, 100)
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "Truls", Make: "Phone" } } })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();

    const { data, width, height } = await toAvif(photo);
    expect([width, height]).toEqual([100, 200]); // rotated by the EXIF orientation
    const meta = await sharp(data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("turns SVGs into pixels", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><script>alert(1)</script><rect width="120" height="60" fill="#151413"/></svg>');
    const { data, width } = await toAvif(svg);
    expect(width).toBe(120);
    expect(data.includes(Buffer.from("script"))).toBe(false);
  });

  it("rejects files that aren't images", async () => {
    await expect(toAvif(Buffer.from("not an image"))).rejects.toThrow(ImageError);
  });
});

it.each([
  ["Render_01-final.png", "Render 01 final"],
  ["スクリーンショット 2026-10-28.png", "スクリーンショット 2026 10 28"],
  ["[weird] name.jpg", "weird name"],
])("altFromName(%j) → %j", (name, alt) => {
  expect(altFromName(name)).toBe(alt);
});
