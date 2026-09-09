import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave } from "./autosave";

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(() => vi.useRealTimers());

describe("project autosave", () => {
  it("coalesces edits and saves the latest value", () => {
    let value = "first";
    const save = vi.fn(() => value === "latest");
    const result = vi.fn();
    const autosave = createAutosave(save, result);
    autosave.schedule();
    vi.advanceTimersByTime(500);
    value = "latest";
    autosave.schedule();
    vi.advanceTimersByTime(599);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result).toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(3000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves within three seconds even when edits never pause", () => {
    const save = vi.fn(() => true);
    const autosave = createAutosave(save, vi.fn());
    for (let i = 0; i < 6; i++) {
      autosave.schedule();
      vi.advanceTimersByTime(500);
    }
    expect(save).toHaveBeenCalledTimes(1);
    autosave.schedule();
    vi.advanceTimersByTime(600);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("flushes queued edits before leaving and cancels duplicate writes", () => {
    const save = vi.fn(() => true);
    const autosave = createAutosave(save, vi.fn());
    expect(autosave.flush()).toBeNull();
    autosave.schedule();
    expect(autosave.flush()).toBe(true);
    expect(autosave.flush()).toBeNull();
    vi.advanceTimersByTime(4000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("reports failed saves and can recover on the next attempt", () => {
    const save = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const result = vi.fn();
    const autosave = createAutosave(save, result);
    autosave.schedule();
    expect(autosave.flush()).toBe(false);
    autosave.schedule();
    expect(autosave.flush()).toBe(true);
    expect(result.mock.calls).toEqual([[false], [true]]);
  });
});
