// ── What the toolbar holds ───────────────────────────────────────────────────
// The current tool and its settings — brush, colour, alpha, fill, tolerance,
// the swatch row. Nothing here touches the layer; the pointer hook does.

import { useCallback, useMemo, useState } from "react";
import type { RGBA } from "@/lib/lab/pixelTools";
import { hexToRgb } from "@/lib/pattern/color";
import type { Tool } from "./tools";

export function usePixelToolState() {
  const [tool, setTool] = useState<Tool>("pen");
  const [size, setSize] = useState(1);
  const [colorHex, setColorHex] = useState("#ff4d00");
  const [alpha, setAlpha] = useState(1);
  const [fillShapes, setFillShapes] = useState(true);
  const [tolerance, setTolerance] = useState(0.12);
  const [contiguous, setContiguous] = useState(true);
  const [swatches, setSwatches] = useState<string[]>([
    "#ffffff", "#171512", "#ff4d00", "#ffe89a", "#081840", "#2ec27e",
  ]);

  const rememberSwatch = useCallback((hex: string) => {
    setSwatches((current) => [hex, ...current.filter((entry) => entry !== hex)].slice(0, 10));
  }, []);

  const currentColor: RGBA = useMemo(() => {
    const [r, g, b] = hexToRgb(colorHex);
    return [r, g, b, Math.round(alpha * 255)];
  }, [colorHex, alpha]);

  return {
    tool,
    setTool,
    size,
    setSize,
    colorHex,
    setColorHex,
    alpha,
    setAlpha,
    fillShapes,
    setFillShapes,
    tolerance,
    setTolerance,
    contiguous,
    setContiguous,
    swatches,
    rememberSwatch,
    currentColor,
  };
}

export type PixelToolState = ReturnType<typeof usePixelToolState>;
