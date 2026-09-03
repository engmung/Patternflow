// ── Hex ⇄ RGB ────────────────────────────────────────────────────────────────
// The two five-line converters every colour-touching corner of the lab had its
// own copy of (the pixel editor, the ramp panel, the engine). One copy.

/** `#rrggbb` → [r, g, b], each 0..255. No validation: callers hold hex from a colour input. */
export function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** [r, g, b] (any numbers) → `#rrggbb`, each channel rounded and clamped to 0..255. */
export function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${((toByte(r) << 16) | (toByte(g) << 8) | toByte(b)).toString(16).padStart(6, "0")}`;
}
