// "Copy GLSL prompt" in the Graphic Export panel. The prompt is built from the
// focused code layer, and until 22 November 2026 the layer's Recolor toggle
// stayed behind: a twin of a recoloured RGB pattern was told to keep the raw
// colours the preview no longer shows.
//
// jsdom has no Worker and no OffscreenCanvas, so the capture session is stood
// in for. The stand-in says the Shader source is picked, which is when the
// panel shows the button.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CapturePanel from "./CapturePanel";
import { useLabStore } from "@/lib/lab/store";
import type { CodeLayer } from "@/lib/lab/types";

vi.mock("@/lib/lab/capture/session", async () => {
  const { DEFAULT_CAPTURE_SETTINGS } = await import("@/lib/lab/capture/types");
  const settings = { ...DEFAULT_CAPTURE_SETTINGS, source: "shader" as const };
  return {
    captureSession: {
      supported: true,
      settings: () => settings,
      getState: () => ({ view: false, output: null }),
      subscribe: () => () => {},
      on: () => () => {},
      applySettings: () => {},
      setShaderSource: () => {},
      setView: () => {},
      sendProjectNow: () => {},
      cancelExport: () => {},
    },
  };
});

const RGB = `export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++)
    for (let x = 0; x < display.width; x++) display.setPixel(x, y, x * 2, y * 4, 128);
}`;

/** Change the focused code layer, which is the starter pattern after a reset. */
function setFocusLayer(patch: Partial<CodeLayer>) {
  const state = useLabStore.getState();
  useLabStore.setState({
    layers: state.layers.map((layer) =>
      layer.id === state.activeLayerId && layer.type === "code" ? { ...layer, ...patch } : layer,
    ),
  });
}

/** Press the button and hand back what reached the clipboard. */
async function copiedPrompt(): Promise<string> {
  const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<CapturePanel />);
  fireEvent.click(screen.getByText("Copy GLSL prompt"));
  await act(async () => {});
  expect(writeText).toHaveBeenCalledTimes(1);
  return writeText.mock.calls[0][0];
}

beforeEach(() => {
  useLabStore.getState().discardProject();
});

afterEach(() => {
  delete (navigator as { clipboard?: unknown }).clipboard;
});

describe("CapturePanel copy GLSL prompt", () => {
  it("asks for the ramp at each pixel's luminance when the focused layer has Recolor on", async () => {
    setFocusLayer({ code: RGB, recolor: true });
    const prompt = await copiedPrompt();
    expect(prompt).toContain("the layer has Recolor on");
    expect(prompt).toContain("fragColor = ramp(dot(c, vec3(0.2126, 0.7152, 0.0722)));");
    expect(prompt).not.toContain("keep the same colours");
  });

  it("asks for the pattern's own colours when Recolor is off", async () => {
    setFocusLayer({ code: RGB, recolor: false });
    const prompt = await copiedPrompt();
    expect(prompt).toContain("keep the same colours");
    expect(prompt).not.toContain("the layer has Recolor on");
  });
});
