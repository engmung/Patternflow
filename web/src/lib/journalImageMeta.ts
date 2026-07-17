import fs from "node:fs";
import path from "node:path";

type ImageMeta = { width: number; height: number };

const FALLBACK: ImageMeta = { width: 1400, height: 900 };
const cache = new Map<string, ImageMeta>();

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function probePng(buffer: Buffer): ImageMeta | null {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function probeJpeg(buffer: Buffer): ImageMeta | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0–SOF15 carry dimensions, except DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

export function getJournalImageMeta(src?: string): ImageMeta {
  if (!src || !src.startsWith("/")) {
    return FALLBACK;
  }

  const cached = cache.get(src);
  if (cached) {
    return cached;
  }

  let meta = FALLBACK;
  try {
    const buffer = fs.readFileSync(path.join(process.cwd(), "public", src));
    meta = probePng(buffer) ?? probeJpeg(buffer) ?? FALLBACK;
  } catch {
    // missing file: fall back to default dimensions
  }

  cache.set(src, meta);
  return meta;
}
