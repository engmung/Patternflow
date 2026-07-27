// ── Pixel layer editing operations ───────────────────────────────────────────
// All operations mutate the RGBA buffer in place (the caller bumps the layer's
// `rev` afterwards). Coordinates are integer pixel positions; out-of-bounds
// writes are clipped. Colors are straight RGBA byte tuples; drawing REPLACES
// the pixel (alpha included) — pixel-art semantics, not painting.

export type RGBA = [number, number, number, number];

export type PixelSurface = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export function colorAt(surface: PixelSurface, x: number, y: number): RGBA {
  const { data, width, height } = surface;
  if (x < 0 || x >= width || y < 0 || y >= height) return [0, 0, 0, 0];
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function setPixel(surface: PixelSurface, x: number, y: number, color: RGBA) {
  const { data, width, height } = surface;
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const i = (y * width + x) * 4;
  data[i] = color[0];
  data[i + 1] = color[1];
  data[i + 2] = color[2];
  data[i + 3] = color[3];
}

/** Square brush stamp. Size 1 = single pixel; larger sizes bias up-left. */
export function drawDot(surface: PixelSurface, x: number, y: number, size: number, color: RGBA) {
  const offset = Math.floor((size - 1) / 2);
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      setPixel(surface, x - offset + dx, y - offset + dy, color);
    }
  }
}

/** Bresenham line stamped with the brush, so fast strokes leave no gaps. */
export function drawLine(
  surface: PixelSurface,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
  color: RGBA,
) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    drawDot(surface, x, y, size, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

export function drawRect(
  surface: PixelSurface,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: RGBA,
  filled: boolean,
) {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (filled || y === top || y === bottom || x === left || x === right) {
        setPixel(surface, x, y, color);
      }
    }
  }
}

export function drawEllipse(
  surface: PixelSurface,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: RGBA,
  filled: boolean,
) {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const rx = Math.max(0.5, (right - left) / 2);
  const ry = Math.max(0.5, (bottom - top) / 2);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      const inside = d <= 1;
      if (!inside) continue;
      if (filled) {
        setPixel(surface, x, y, color);
        continue;
      }
      // Outline: inside, but with at least one 4-neighbour outside.
      const nOut =
        ((x - 1 - cx) / rx) ** 2 + ny * ny > 1 ||
        ((x + 1 - cx) / rx) ** 2 + ny * ny > 1 ||
        nx * nx + ((y - 1 - cy) / ry) ** 2 > 1 ||
        nx * nx + ((y + 1 - cy) / ry) ** 2 > 1;
      if (nOut) setPixel(surface, x, y, color);
    }
  }
}

// Perceptually-adequate color distance for tolerance matching, 0..1. Fully
// transparent pixels form their own class: they only ever match each other,
// no matter the RGB underneath.
function colorDistance(a: RGBA, b: RGBA): number {
  const aTransparent = a[3] < 8;
  const bTransparent = b[3] < 8;
  if (aTransparent || bTransparent) return aTransparent === bTransparent ? 0 : 1;
  const dr = (a[0] - b[0]) / 255;
  const dg = (a[1] - b[1]) / 255;
  const db = (a[2] - b[2]) / 255;
  const da = (a[3] - b[3]) / 255;
  return Math.sqrt((dr * dr + dg * dg + db * db + da * da) / 4);
}

function matches(surface: PixelSurface, x: number, y: number, target: RGBA, tolerance: number) {
  return colorDistance(colorAt(surface, x, y), target) <= tolerance;
}

/** Flood fill (4-way) from a seed pixel, with color tolerance. */
export function floodFill(
  surface: PixelSurface,
  x: number,
  y: number,
  color: RGBA,
  tolerance = 0,
) {
  const { width, height } = surface;
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const target = colorAt(surface, x, y);
  // Filling a region with its own exact color would loop forever.
  if (colorDistance(target, color) === 0 && tolerance === 0) return;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [y * width + x];
  while (stack.length > 0) {
    const index = stack.pop()!;
    if (visited[index]) continue;
    visited[index] = 1;
    const px = index % width;
    const py = (index / width) | 0;
    if (!matches(surface, px, py, target, tolerance)) continue;
    setPixel(surface, px, py, color);
    if (px > 0) stack.push(index - 1);
    if (px < width - 1) stack.push(index + 1);
    if (py > 0) stack.push(index - width);
    if (py < height - 1) stack.push(index + width);
  }
}

/**
 * Background removal ("누끼"): make every pixel similar to the clicked color
 * transparent. Contiguous = flood from the click (classic magic eraser);
 * otherwise the whole layer is scanned (drop a chroma background in one go).
 */
export function magicErase(
  surface: PixelSurface,
  x: number,
  y: number,
  tolerance: number,
  contiguous: boolean,
) {
  const target = colorAt(surface, x, y);
  if (target[3] < 8) return; // already transparent
  const clear: RGBA = [0, 0, 0, 0];
  if (contiguous) {
    floodFill(surface, x, y, clear, tolerance);
    return;
  }
  const { data, width, height } = surface;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      const candidate: RGBA = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (colorDistance(candidate, target) <= tolerance) {
        data[i + 3] = 0;
      }
    }
  }
}

export function clearSurface(surface: PixelSurface) {
  surface.data.fill(0);
}

export type ImportFit = "contain" | "cover" | "stretch" | "center";

/** User placement on top of the base fit: a scale factor and a pixel offset. */
export type ImportTransform = { scale: number; offsetX: number; offsetY: number };

/**
 * Rasterize an image into a layer-sized RGBA buffer. `smooth: false` keeps
 * hard nearest-neighbour pixels (right for pixel art sources); `true` lets the
 * browser filter (right for photos being shrunk onto the matrix). The optional
 * transform scales around the center and shifts in layer pixels, so the import
 * dialog can size and place the image freely.
 */
export function rasterizeImage(
  image: CanvasImageSource & { width: number; height: number },
  width: number,
  height: number,
  fit: ImportFit,
  smooth: boolean,
  transform?: ImportTransform,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return new Uint8ClampedArray(width * height * 4);
  context.imageSmoothingEnabled = smooth;
  context.imageSmoothingQuality = "high";

  const sw = image.width;
  const sh = image.height;
  let dw = width;
  let dh = height;
  if (fit === "contain" || fit === "cover") {
    const scale =
      fit === "contain" ? Math.min(width / sw, height / sh) : Math.max(width / sw, height / sh);
    dw = sw * scale;
    dh = sh * scale;
  } else if (fit === "center") {
    dw = sw;
    dh = sh;
  }
  const userScale = transform?.scale ?? 1;
  dw *= userScale;
  dh *= userScale;
  context.drawImage(
    image,
    (width - dw) / 2 + (transform?.offsetX ?? 0),
    (height - dh) / 2 + (transform?.offsetY ?? 0),
    dw,
    dh,
  );
  return new Uint8ClampedArray(context.getImageData(0, 0, width, height).data);
}

/**
 * Cut a rectangular region out of the surface: returns the lifted RGBA pixels
 * and clears the region to transparent (the select tool's "lift").
 */
export function cutRegion(
  surface: PixelSurface,
  left: number,
  top: number,
  w: number,
  h: number,
): Uint8ClampedArray {
  const { data, width } = surface;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((top + y) * width + (left + x)) * 4;
      const di = (y * w + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
      data[si] = 0;
      data[si + 1] = 0;
      data[si + 2] = 0;
      data[si + 3] = 0;
    }
  }
  return out;
}

/** Nearest-neighbour rescale — pixels stay hard-edged, just bigger/smaller. */
export function scaleNearest(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  scale: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const si = (sy * width + sx) * 4;
      const di = (y * outW + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return { data: out, width: outW, height: outH };
}

/** Alpha-over stamp of a smaller buffer at (dx, dy), clipped to the surface. */
export function stampRegionOver(
  surface: PixelSurface,
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dx: number,
  dy: number,
) {
  const { data, width, height } = surface;
  for (let y = 0; y < srcH; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= height) continue;
    for (let x = 0; x < srcW; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= width) continue;
      const si = (y * srcW + x) * 4;
      const sa = src[si + 3] / 255;
      if (sa <= 0) continue;
      const di = (ty * width + tx) * 4;
      if (sa >= 1) {
        data[di] = src[si];
        data[di + 1] = src[si + 1];
        data[di + 2] = src[si + 2];
        data[di + 3] = 255;
        continue;
      }
      const da = data[di + 3] / 255;
      const outA = sa + da * (1 - sa);
      if (outA <= 0) {
        data[di + 3] = 0;
        continue;
      }
      data[di] = (src[si] * sa + data[di] * da * (1 - sa)) / outA;
      data[di + 1] = (src[si + 1] * sa + data[di + 1] * da * (1 - sa)) / outA;
      data[di + 2] = (src[si + 2] * sa + data[di + 2] * da * (1 - sa)) / outA;
      data[di + 3] = outA * 255;
    }
  }
}

/**
 * Composite `src` over `dst` in place (straight alpha) — how an import lands
 * on a layer without wiping what's already drawn there.
 */
export function stampOver(dst: Uint8ClampedArray, src: Uint8ClampedArray) {
  const length = Math.min(dst.length, src.length);
  for (let i = 0; i < length; i += 4) {
    const sa = src[i + 3] / 255;
    if (sa <= 0) continue;
    if (sa >= 1) {
      dst[i] = src[i];
      dst[i + 1] = src[i + 1];
      dst[i + 2] = src[i + 2];
      dst[i + 3] = 255;
      continue;
    }
    const da = dst[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) {
      dst[i + 3] = 0;
      continue;
    }
    dst[i] = (src[i] * sa + dst[i] * da * (1 - sa)) / outA;
    dst[i + 1] = (src[i + 1] * sa + dst[i + 1] * da * (1 - sa)) / outA;
    dst[i + 2] = (src[i + 2] * sa + dst[i + 2] * da * (1 - sa)) / outA;
    dst[i + 3] = outA * 255;
  }
}

/** Copy a buffer into a differently-sized frame, contents centered. */
export function resizeSurface(
  data: Uint8ClampedArray,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): Uint8ClampedArray {
  if (fromW === toW && fromH === toH) return data;
  const out = new Uint8ClampedArray(toW * toH * 4);
  const offsetX = Math.floor((toW - fromW) / 2);
  const offsetY = Math.floor((toH - fromH) / 2);
  for (let y = 0; y < fromH; y++) {
    const ty = y + offsetY;
    if (ty < 0 || ty >= toH) continue;
    for (let x = 0; x < fromW; x++) {
      const tx = x + offsetX;
      if (tx < 0 || tx >= toW) continue;
      const src = (y * fromW + x) * 4;
      const dst = (ty * toW + tx) * 4;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = data[src + 3];
    }
  }
  return out;
}
