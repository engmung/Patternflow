// LabEngine keeps the coverage buffers its masked paint layers use. Until
// 22 November 2026 buildEntries made a new Uint8Array for each of them on
// every call, and render calls it every frame. Now the n-th masked paint layer
// of a call takes the n-th kept buffer, with every pixel switched back on
// first. A kept buffer could carry one layer's mask onto another layer, or
// one frame's mask into the next. These tests hold the picture to neither.

import { beforeEach, describe, expect, it, vi } from "vitest";

// Each coverage buffer the engine hands the compositor, in the order it does.
const handed = vi.hoisted(() => [] as Uint8Array[]);

vi.mock("./compositor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./compositor")>();
  return {
    ...actual,
    applyMaskToCoverage: (...args: Parameters<typeof actual.applyMaskToCoverage>) => {
      handed.push(args[0]);
      actual.applyMaskToCoverage(...args);
    },
  };
});

import { LabEngine, type EngineProject } from "./engine";
import type { Layer, PixelLayer } from "./types";

type RGBA = [number, number, number, number];
type Size = { width: number; height: number };

const FRAME: Size = { width: 16, height: 8 };
const SMALL: Size = { width: 8, height: 4 };
const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];
// The composite is opaque: an LED nothing lights is black.
const UNLIT: RGBA = [0, 0, 0, 255];

/** One value per pixel, row by row from the top left. */
function eachPixel<T>(size: Size, at: (x: number, y: number) => T): T[] {
  const out: T[] = [];
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) out.push(at(x, y));
  }
  return out;
}

const picture = (size: Size, at: (x: number, y: number) => RGBA) => eachPixel(size, at).flat();

function pixelLayer(
  id: string,
  size: Size,
  at: (x: number, y: number) => RGBA,
  role: PixelLayer["role"] = "paint",
): PixelLayer {
  return {
    id,
    type: "pixel",
    name: id,
    visible: true,
    opacity: 1,
    blend: "normal",
    role,
    maskInvert: false,
    width: size.width,
    height: size.height,
    data: new Uint8ClampedArray(picture(size, at)),
    rev: 0,
  };
}

const solid = (id: string, size: Size, color: RGBA) => pixelLayer(id, size, () => color);

/** A pixel mask, on where `on` says so. */
const mask = (id: string, size: Size, on: (x: number, y: number) => boolean) =>
  pixelLayer(id, size, (x, y) => (on(x, y) ? [255, 255, 255, 255] : [0, 0, 0, 0]), "mask");

const inTopHalf = (size: Size) => (_x: number, y: number) => y < size.height / 2;
const inLeftHalf = (size: Size) => (x: number) => x < size.width / 2;

// layers[0] is the top of the stack, as in the Layers panel. Blue shows in
// the top half only and red in the left half only.
function twoMasked(size: Size): Layer[] {
  return [
    mask("top-half", size, inTopHalf(size)),
    solid("blue", size, BLUE),
    mask("left-half", size, inLeftHalf(size)),
    solid("red", size, RED),
  ];
}

// Blue above, red at the bottom left, nothing at the bottom right.
const twoMaskedPicture = (size: Size) =>
  picture(size, (x, y) => (inTopHalf(size)(x, y) ? BLUE : inLeftHalf(size)(x) ? RED : UNLIT));

function project(layers: Layer[], size: Size): EngineProject {
  return {
    matrix: size,
    layers,
    activeLayerId: layers[0].id,
    knobs: [0, 0, 0, 0],
    ranges: [[0, 1], [0, 1], [0, 1], [0, 1]],
  };
}

// render returns the engine's own output buffer, and the next frame writes
// over it, so each frame is copied out.
const frame = (engine: LabEngine, layers: Layer[], size: Size = FRAME) =>
  Array.from(engine.render(project(layers, size), 1 / 60, 0).data);

describe("the coverage buffers LabEngine keeps", () => {
  beforeEach(() => {
    handed.length = 0;
  });

  it("gives two masked layers in one stack a buffer each", () => {
    const shown = frame(new LabEngine(), twoMasked(FRAME));
    // On one shared buffer red would take blue's mask, and the bottom left
    // would be unlit.
    expect(shown).toEqual(twoMaskedPicture(FRAME));
    expect(handed).toHaveLength(2);
    expect(handed[0]).not.toBe(handed[1]);
  });

  it("lets two masks over one layer meet in that layer's one buffer", () => {
    const layers = [
      mask("top-half", FRAME, inTopHalf(FRAME)),
      mask("left-half", FRAME, inLeftHalf(FRAME)),
      solid("red", FRAME, RED),
    ];
    const shown = frame(new LabEngine(), layers);
    expect(shown).toEqual(
      picture(FRAME, (x, y) => (inTopHalf(FRAME)(x, y) && inLeftHalf(FRAME)(x) ? RED : UNLIT)),
    );
    expect(handed).toHaveLength(2);
    expect(handed[1]).toBe(handed[0]);
  });

  it("draws a second frame as it drew the first, in the same two buffers", () => {
    const engine = new LabEngine();
    const layers = twoMasked(FRAME);
    const first = frame(engine, layers);
    const second = frame(engine, layers);
    expect(first).toEqual(twoMaskedPicture(FRAME));
    expect(second).toEqual(first);
    expect(handed).toHaveLength(4);
    expect(handed[2]).toBe(handed[0]);
    expect(handed[3]).toBe(handed[1]);
  });

  it("leaves nothing of the last frame's mask when the mask changes", () => {
    const engine = new LabEngine();
    const red = solid("red", FRAME, RED);
    const inRightHalf = (x: number) => x >= FRAME.width / 2;
    frame(engine, [mask("mask", FRAME, inLeftHalf(FRAME)), red]);
    const shown = frame(engine, [mask("mask", FRAME, inRightHalf), red]);
    // A buffer left as it was would still be off on the right, and no red
    // would show at all.
    expect(shown).toEqual(picture(FRAME, (x) => (inRightHalf(x) ? RED : UNLIT)));
    expect(handed[1]).toBe(handed[0]);
  });

  it("keeps the picture through a Pixel panel backdrop and an export's coverage", () => {
    const engine = new LabEngine();
    const layers = twoMasked(FRAME);
    const first = frame(engine, layers);

    // The backdrop behind the top mask while it is edited. Blue has no mask
    // left, so this call takes one buffer where render takes two.
    const backdrop = engine.compositeBackdrop(FRAME, layers, "top-half").data;
    expect(Array.from(backdrop)).toEqual(picture(FRAME, () => BLUE));

    const covered = new Uint8ClampedArray(FRAME.width * FRAME.height);
    engine.coverage(FRAME, layers, covered);
    expect(Array.from(covered)).toEqual(
      eachPixel(FRAME, (x, y) => (inTopHalf(FRAME)(x, y) || inLeftHalf(FRAME)(x) ? 255 : 0)),
    );

    expect(frame(engine, layers)).toEqual(first);
  });

  it("makes buffers of the new size when the frame size changes", () => {
    const engine = new LabEngine();
    expect(frame(engine, twoMasked(SMALL), SMALL)).toEqual(twoMaskedPicture(SMALL));
    // A 32-pixel buffer kept for the 128-pixel frame would mask its first two
    // rows and nothing below them.
    expect(frame(engine, twoMasked(FRAME), FRAME)).toEqual(twoMaskedPicture(FRAME));
    expect(frame(engine, twoMasked(SMALL), SMALL)).toEqual(twoMaskedPicture(SMALL));
    expect(handed.map((buffer) => buffer.length)).toEqual([32, 32, 128, 128, 32, 32]);
  });
});
