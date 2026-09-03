// What jsdom lacks and the lab panels touch. Nothing here asserts; it only
// keeps the panels from throwing so the tests can look at the store.

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});

// ── canvas ──────────────────────────────────────────────────────────────────
// A 2D context that swallows drawing and hands back real ImageData-shaped
// objects, so the paint loops and the overlay run to completion.
type Ctx = Record<string, unknown>;

function fakeContext(canvas: HTMLCanvasElement): Ctx {
  const ctx: Ctx = {
    canvas,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    imageSmoothingEnabled: true,
    createImageData(w: number, h: number) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    getImageData(_x: number, _y: number, w: number, h: number) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
  };
  for (const name of [
    "putImageData", "clearRect", "fillRect", "strokeRect", "drawImage", "beginPath", "moveTo",
    "lineTo", "stroke", "fill", "arc", "rect", "save", "restore", "scale", "translate",
    "setTransform", "closePath",
  ]) {
    ctx[name] = () => {};
  }
  return ctx;
}

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: function getContext(this: HTMLCanvasElement) {
    return fakeContext(this);
  },
});

// The panels map pointer positions onto pixels through the overlay canvas's
// box. jsdom lays nothing out, so a canvas reports its own width × height in
// CSS pixels at the origin: clientX is the pixel column, clientY the row.
Object.defineProperty(HTMLCanvasElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value: function getBoundingClientRect(this: HTMLCanvasElement) {
    const width = this.width || 0;
    const height = this.height || 0;
    return { left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) };
  },
});

// ── the rest ────────────────────────────────────────────────────────────────
if (typeof window.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: ResizeObserverStub });
}

// Paint loops run on requestAnimationFrame; a test never needs a frame to
// land, and a loop that keeps ticking between tests is noise.
Object.defineProperty(window, "requestAnimationFrame", {
  configurable: true,
  value: () => 0,
});
Object.defineProperty(window, "cancelAnimationFrame", { configurable: true, value: () => {} });

if (!("setPointerCapture" in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => {} });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => {} });
}

if (!("PointerEvent" in window)) {
  // jsdom without PointerEvent: a MouseEvent that carries the pointer fields.
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: PointerEventStub });
}

Object.defineProperty(window.URL, "createObjectURL", { configurable: true, value: () => "blob:test" });
Object.defineProperty(window.URL, "revokeObjectURL", { configurable: true, value: () => {} });
