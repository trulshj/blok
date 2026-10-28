import { EditorState } from "@codemirror/state";
import { expect, it } from "vitest";
import { japaneseWordAt, paragraphAt } from "./selectionTools.ts";

it("japaneseWordAt finds one word in a run of Japanese", () => {
  const text = "の光が石畳に映って";
  expect(japaneseWordAt(text, text.indexOf("畳"))).toEqual({ from: 3, to: 5 });
  expect(japaneseWordAt("plain words", 2)).toBeNull();
});

it("paragraphAt spans the lines between blank lines", () => {
  const state = EditorState.create({ doc: "one\n\ntwo\nthree\n\nfour" });
  expect(paragraphAt(state, 6)).toEqual({ from: 5, to: 14 });
  expect(paragraphAt(state, 4)).toEqual({ from: 4, to: 4 });
});
