import { expect, it } from "vitest";
import { kanaReading } from "./kana.ts";

it("kanaReading turns romaji into hiragana and leaves kana alone", () => {
  expect(kanaReading("taimatsu")).toBe("たいまつ");
  expect(kanaReading("Kan|ji")).toBe("かん|じ");
  expect(kanaReading("どうくつ")).toBe("どうくつ");
  expect(kanaReading("ドア")).toBe("ドア");
});
