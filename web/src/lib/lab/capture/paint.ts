// ── Stage painter ────────────────────────────────────────────────────────────
// Puts a CaptureFrame onto a 2D canvas in one of the three looks. Works on an
// OffscreenCanvas (worker) or an HTMLCanvasElement alike; the only state it
// keeps is a staging canvas for the frame pixels.

import type { CaptureFrame } from "./core";
import type { CaptureGeometry, CaptureSettings } from "./types";

type Canvas2D = OffscreenCanvas | HTMLCanvasElement;
type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function context2D(canvas: Canvas2D): Context2D {
  const context = canvas.getContext("2d") as Context2D | null;
  if (!context) throw new Error("2D canvas context unavailable.");
  return context;
}

function resize(canvas: Canvas2D, width: number, height: number) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

export class StagePainter {
  private staging: Canvas2D;

  constructor(makeCanvas: (width: number, height: number) => Canvas2D) {
    this.staging = makeCanvas(1, 1);
  }

  /** Fill or clear the backdrop. */
  private backdrop(context: Context2D, settings: CaptureSettings, width: number, height: number) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    if ("filter" in context) context.filter = "none";
    context.clearRect(0, 0, width, height);
    if (settings.backdrop === "transparent") return;
    context.fillStyle = settings.backdrop === "color" ? settings.backdropColor : "#000000";
    context.fillRect(0, 0, width, height);
  }

  /** Upload the frame's straight RGBA into the staging canvas. */
  private stage(frame: CaptureFrame): Canvas2D {
    const { width, height } = frame.geometry.render;
    resize(this.staging, width, height);
    const context = context2D(this.staging);
    const image = context.createImageData(width, height);
    image.data.set(frame.rgba);
    context.putImageData(image, 0, 0);
    return this.staging;
  }

  /**
   * Orient the context so everything after draws in the UNTURNED picture's
   * coordinates (render × scale) and lands turned clockwise by `rotation`
   * inside the output frame.
   */
  private turn(context: Context2D, geometry: CaptureGeometry) {
    const { output, rotation } = geometry;
    if (rotation === 90) {
      context.translate(output.width, 0);
      context.rotate(Math.PI / 2);
    } else if (rotation === 180) {
      context.translate(output.width, output.height);
      context.rotate(Math.PI);
    } else if (rotation === 270) {
      context.translate(0, output.height);
      context.rotate(-Math.PI / 2);
    }
  }

  /**
   * Place an already-rendered picture — the shader stage's GL canvas — in the
   * output frame: backdrop, turn, blit. It arrives at the render size with
   * straight alpha, so the backdrop control means the same thing it does for
   * a pattern; the cutout controls do not apply, the shader's own alpha is
   * the cutout.
   */
  paintCanvas(
    canvas: Canvas2D,
    source: CanvasImageSource,
    geometry: CaptureGeometry,
    settings: CaptureSettings,
  ) {
    const { output, render, scale, offsetX, offsetY } = geometry;
    resize(canvas, output.width, output.height);
    const context = context2D(canvas);
    this.backdrop(context, settings, output.width, output.height);
    this.turn(context, geometry);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      source,
      0,
      0,
      render.width,
      render.height,
      offsetX,
      offsetY,
      render.width * scale,
      render.height * scale,
    );
    context.imageSmoothingEnabled = true;
  }

  paint(canvas: Canvas2D, frame: CaptureFrame, settings: CaptureSettings) {
    const { output, render, scale, look, offsetX, offsetY } = frame.geometry;
    resize(canvas, output.width, output.height);
    const context = context2D(canvas);
    this.backdrop(context, settings, output.width, output.height);
    const staging = this.stage(frame);
    this.turn(context, frame.geometry);
    // Where the scaled render lands inside the unturned box.
    const drawWidth = render.width * scale;
    const drawHeight = render.height * scale;

    if (look === "native") {
      context.drawImage(staging, 0, 0);
      return;
    }

    if (look === "pixel") {
      context.imageSmoothingEnabled = false;
      context.drawImage(
        staging,
        0,
        0,
        render.width,
        render.height,
        offsetX,
        offsetY,
        drawWidth,
        drawHeight,
      );
      context.imageSmoothingEnabled = true;
      return;
    }

    // LED: a soft glow from the blurred frame, then one round dot per cell.
    const glow = Math.max(0, Math.min(1, settings.ledGlow));
    if (glow > 0 && "filter" in context) {
      context.save();
      context.globalAlpha = glow * 0.85;
      context.imageSmoothingEnabled = true;
      context.filter = `blur(${Math.max(1, scale * 0.9).toFixed(1)}px)`;
      context.drawImage(
        staging,
        0,
        0,
        render.width,
        render.height,
        offsetX,
        offsetY,
        drawWidth,
        drawHeight,
      );
      context.restore();
    }

    const dot = Math.max(0.2, Math.min(1, settings.ledDot));
    const radius = (scale * dot) / 2;
    const half = scale / 2;
    const rgba = frame.rgba;
    const tau = Math.PI * 2;

    // Unlit cells: a faint disc on a solid backdrop, nothing on transparency.
    if (settings.backdrop !== "transparent") {
      context.beginPath();
      for (let y = 0; y < render.height; y++) {
        for (let x = 0; x < render.width; x++) {
          const index = (y * render.width + x) * 4;
          if (rgba[index + 3] !== 0) continue;
          const cx = offsetX + x * scale + half;
          const cy = offsetY + y * scale + half;
          context.moveTo(cx + radius, cy);
          context.arc(cx, cy, radius, 0, tau);
        }
      }
      context.fillStyle = settings.backdrop === "color" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.045)";
      context.fill();
    }

    for (let y = 0; y < render.height; y++) {
      for (let x = 0; x < render.width; x++) {
        const index = (y * render.width + x) * 4;
        const alpha = rgba[index + 3];
        if (alpha === 0) continue;
        context.fillStyle = `rgba(${rgba[index]},${rgba[index + 1]},${rgba[index + 2]},${(alpha / 255).toFixed(3)})`;
        context.beginPath();
        context.arc(offsetX + x * scale + half, offsetY + y * scale + half, radius, 0, tau);
        context.fill();
      }
    }
  }
}
