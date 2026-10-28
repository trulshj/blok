import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, createAutosaver, type SaveStatus } from "./autosave.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** An autosaver whose save() resolves with v1, v2… unless a test takes over. */
function setup(options: { blocked?: () => string | null } = {}) {
  const statuses: SaveStatus[] = [];
  let version = 0;
  const save = vi.fn(async (_base: string | undefined) => `v${++version}`);
  const saver = createAutosaver({ base: "v0", save, onStatus: (s) => statuses.push(s), ...options });
  const states = () => statuses.map((s) => s.state);
  return { saver, save, statuses, states };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

it("saves 800 ms after the last edit, based on the loaded version", async () => {
  const { saver, save, statuses } = setup();
  saver.change();
  await vi.advanceTimersByTimeAsync(500);
  saver.change(); // restarts the wait
  await vi.advanceTimersByTimeAsync(799);
  expect(save).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledExactlyOnceWith("v0");
  expect(statuses.at(-1)).toEqual({ state: "saved", at: "v1" });
  expect(saver.base()).toBe("v1");
  expect(saver.hasUnsaved()).toBe(false);
});

it("saves at least every 5 s while edits keep coming", async () => {
  const { saver, save } = setup();
  for (let t = 0; t < 6000; t += 300) {
    saver.change();
    await vi.advanceTimersByTimeAsync(300);
  }
  expect(save).toHaveBeenCalledTimes(1);
});

it("reports dirty and saving once, not on every keystroke", async () => {
  const { saver, states } = setup();
  saver.change();
  saver.change();
  saver.change();
  await vi.advanceTimersByTimeAsync(800);
  expect(states()).toEqual(["dirty", "saving", "saved"]);
});

it("saves again when edits arrive during a save, building on the new version", async () => {
  const { saver, save } = setup();
  const first = deferred<string>();
  save.mockImplementationOnce(() => first.promise);

  saver.change();
  await vi.advanceTimersByTimeAsync(800);
  saver.change(); // typed while the first save is in flight
  first.resolve("v1");
  await vi.advanceTimersByTimeAsync(800);

  expect(save.mock.calls.map((c) => c[0])).toEqual(["v0", "v1"]);
  expect(saver.hasUnsaved()).toBe(false);
});

describe("conflicts", () => {
  it("stops autosaving until resolved", async () => {
    const { saver, save, states } = setup();
    save.mockRejectedValueOnce(new ConflictError("changed elsewhere"));

    saver.change();
    await vi.advanceTimersByTimeAsync(800);
    expect(states().at(-1)).toBe("conflict");

    saver.change();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.hasUnsaved()).toBe(true);
  });

  it("keep mine: overwrite saves without a base version, then autosave resumes", async () => {
    const { saver, save, statuses } = setup();
    save.mockRejectedValueOnce(new ConflictError("changed elsewhere"));
    saver.change();
    await vi.advanceTimersByTimeAsync(800);

    await saver.overwrite();
    expect(save).toHaveBeenLastCalledWith(undefined);
    expect(statuses.at(-1)).toEqual({ state: "saved", at: "v1" });

    saver.change();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenLastCalledWith("v1");
  });

  it("load theirs: reset drops unsaved edits and follows the version on disk", async () => {
    const { saver, save, statuses } = setup();
    saver.change();
    saver.markConflict();
    saver.reset("v9");

    expect(saver.hasUnsaved()).toBe(false);
    expect(statuses.at(-1)).toEqual({ state: "saved", at: "v9" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();

    saver.change();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenLastCalledWith("v9");
  });
});

it("doesn't save while blocked, and tries again after the next edit", async () => {
  let title = "";
  const { saver, save, statuses } = setup({ blocked: () => (title ? null : "Give the note a title") });

  saver.change();
  await vi.advanceTimersByTimeAsync(800);
  expect(save).not.toHaveBeenCalled();
  expect(statuses.at(-1)).toEqual({ state: "blocked", message: "Give the note a title" });

  title = "Kyoto";
  saver.change();
  await vi.advanceTimersByTimeAsync(800);
  expect(save).toHaveBeenCalledOnce();
});

it("reports errors and retries on the next edit or saveNow", async () => {
  const { saver, save, statuses } = setup();
  save.mockRejectedValueOnce(new Error("Can't reach the blok server"));

  saver.change();
  await vi.advanceTimersByTimeAsync(800);
  expect(statuses.at(-1)).toEqual({ state: "error", message: "Can't reach the blok server" });
  expect(saver.hasUnsaved()).toBe(true);

  await saver.saveNow();
  expect(save).toHaveBeenCalledTimes(2);
  expect(saver.hasUnsaved()).toBe(false);
});

it("saveNow does nothing when everything is saved", async () => {
  const { saver, save } = setup();
  await saver.saveNow();
  expect(save).not.toHaveBeenCalled();
});
