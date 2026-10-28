import { expect, it } from "vitest";
import { formatBytes, imageUrl } from "./images.ts";

it.each([
  ["./render-01.avif", "/files/kyoto-alley/render-01.avif"],
  ["render-01.avif", "/files/kyoto-alley/render-01.avif"],
  ["https://example.com/a.png", "https://example.com/a.png"],
  ["/images/headshot.avif", null], // truls.dev paths can't be shown here
  ["../other/x.avif", null],
  ["./.hidden.avif", null],
])("imageUrl(%j) → %j", (src, url) => {
  expect(imageUrl("kyoto-alley", src)).toBe(url);
});

it("formatBytes", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(412 * 1024)).toBe("412 KB");
  expect(formatBytes(1.8 * 1024 * 1024)).toBe("1.8 MB");
});
