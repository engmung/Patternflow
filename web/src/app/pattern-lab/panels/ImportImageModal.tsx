"use client";

// ── Import an image into a pixel layer ───────────────────────────────────────
// The modal the Pixel panel opens for "Import image": fit modes, background
// removal, drag to position, and a live backdrop of the rest of the stack.
// Lived at the bottom of PixelPanel.tsx until 2026-09; same code, own file.

import { useEffect, useRef, useState } from "react";
import { rasterizeImage, type ImportFit, type RGBA } from "@/lib/lab/pixelTools";
import { labEngine } from "@/lib/lab/engine";
import { useLabStore } from "@/lib/lab/store";
import styles from "../PatternLab.module.css";

export default function ImportImageModal({
  width,
  height,
  layerId,
  onApply,
  onClose,
}: {
  width: number;
  height: number;
  layerId: string;
  onApply: (data: Uint8ClampedArray) => void;
  onClose: () => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fit, setFit] = useState<ImportFit>("contain");
  const [smooth, setSmooth] = useState(true);
  const [removeBg, setRemoveBg] = useState(false);
  const [bgTolerance, setBgTolerance] = useState(0.12);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showLayers, setShowLayers] = useState(true);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const backdropRef = useRef<HTMLCanvasElement | null>(null);
  const resultRef = useRef<Uint8ClampedArray | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  const loadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setScale(1);
      setOffset({ x: 0, y: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Live backdrop: the rest of the stack keeps animating behind the preview.
  useEffect(() => {
    if (!showLayers) {
      const canvas = backdropRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, width, height);
      return;
    }
    let frameId = 0;
    const tick = () => {
      const canvas = backdropRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context) {
        const state = useLabStore.getState();
        const frame = labEngine.compositeBackdrop(state.matrix, state.layers, layerId);
        if (frame.width === width && frame.height === height) {
          const imageData = context.createImageData(frame.width, frame.height);
          imageData.data.set(frame.data);
          context.putImageData(imageData, 0, 0);
        }
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [showLayers, layerId, width, height]);

  // Recompute + paint the image whenever an option or the placement changes.
  useEffect(() => {
    const canvas = previewRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, width, height);
    if (!image) {
      resultRef.current = null;
      return;
    }
    const data = rasterizeImage(image, width, height, fit, smooth, {
      scale,
      offsetX: offset.x,
      offsetY: offset.y,
    });

    if (removeBg) {
      // Background = the most common corner color of the SOURCE image (the
      // rasterized buffer's corners may be transparent letterbox padding).
      const probe = document.createElement("canvas");
      probe.width = image.width;
      probe.height = image.height;
      const probeContext = probe.getContext("2d", { willReadFrequently: true });
      let target: RGBA | null = null;
      if (probeContext) {
        probeContext.drawImage(image, 0, 0);
        const corners: Array<[number, number]> = [
          [0, 0],
          [image.width - 1, 0],
          [0, image.height - 1],
          [image.width - 1, image.height - 1],
        ];
        const counts = new Map<string, { color: RGBA; count: number }>();
        for (const [x, y] of corners) {
          const px = probeContext.getImageData(x, y, 1, 1).data;
          const color: RGBA = [px[0], px[1], px[2], px[3]];
          if (color[3] === 0) continue;
          const id = color.join(",");
          const entry = counts.get(id) ?? { color, count: 0 };
          entry.count += 1;
          counts.set(id, entry);
        }
        target = [...counts.values()].sort((a, b) => b.count - a.count)[0]?.color ?? null;
      }
      if (target) {
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) continue;
          const dr = (data[i] - target[0]) / 255;
          const dg = (data[i + 1] - target[1]) / 255;
          const db = (data[i + 2] - target[2]) / 255;
          if (Math.sqrt((dr * dr + dg * dg + db * db) / 3) <= bgTolerance) data[i + 3] = 0;
        }
      }
    }

    resultRef.current = data;
    const imageData = context.createImageData(width, height);
    imageData.data.set(data);
    context.putImageData(imageData, 0, 0);
  }, [image, fit, smooth, removeBg, bgTolerance, scale, offset, width, height]);

  const clampScale = (value: number) => Math.max(0.05, Math.min(8, value));

  const onPreviewPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
  };

  const onPreviewPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const perPixel = width / rect.width;
    setOffset({
      x: Math.round(drag.baseX + (event.clientX - drag.startX) * perPixel),
      y: Math.round(drag.baseY + (event.clientY - drag.startY) * perPixel),
    });
  };

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Import image"
      onClick={onClose}
    >
      <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>Import image → {width}×{height}</span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <input
            type="file"
            accept="image/*"
            aria-label="Choose image"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) loadFile(file);
            }}
          />
          <div
            style={{
              position: "relative",
              margin: "12px 0",
              background:
                "repeating-conic-gradient(#c9c2b1 0% 25%, #b5ad9a 0% 50%) 0 0 / 12px 12px",
              border: "1px solid rgba(23,21,18,0.3)",
              aspectRatio: `${width} / ${height}`,
              maxWidth: 480,
            }}
          >
            <canvas
              ref={backdropRef}
              width={width}
              height={height}
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                imageRendering: "pixelated",
              }}
            />
            <canvas
              ref={previewRef}
              width={width}
              height={height}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                imageRendering: "pixelated",
                cursor: image ? "move" : "default",
                touchAction: "none",
              }}
              aria-label="Import preview — drag to position, wheel to scale"
              onPointerDown={onPreviewPointerDown}
              onPointerMove={onPreviewPointerMove}
              onPointerUp={() => (dragRef.current = null)}
              onPointerCancel={() => (dragRef.current = null)}
              onWheel={(event) => {
                if (!image) return;
                event.preventDefault();
                setScale((current) => clampScale(current * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
              }}
            />
          </div>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 12 }}
          >
            <label>
              fit{" "}
              <select value={fit} onChange={(event) => setFit(event.target.value as ImportFit)}>
                <option value="contain">contain</option>
                <option value="cover">cover</option>
                <option value="stretch">stretch</option>
                <option value="center">center 1:1</option>
              </select>
            </label>
            <label title="Size on top of the fit — also mouse wheel over the preview">
              scale{" "}
              <input
                type="range"
                min={0.05}
                max={4}
                step={0.01}
                value={Math.min(4, scale)}
                onChange={(event) => setScale(clampScale(Number(event.target.value)))}
              />{" "}
              {Math.round(scale * 100)}%
            </label>
            <button
              type="button"
              style={{ font: "inherit" }}
              title="Back to centered, 100%"
              onClick={() => {
                setScale(1);
                setOffset({ x: 0, y: 0 });
              }}
            >
              reset
            </button>
            <label title="Show the other layers behind the image while placing it">
              <input
                type="checkbox"
                checked={showLayers}
                onChange={(event) => setShowLayers(event.target.checked)}
              />{" "}
              show layers
            </label>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              fontSize: 12,
              marginTop: 8,
            }}
          >
            <label title="Off = hard nearest-neighbour pixels (best for pixel-art sources)">
              <input
                type="checkbox"
                checked={smooth}
                onChange={(event) => setSmooth(event.target.checked)}
              />{" "}
              smooth scaling
            </label>
            <label title="Cut the corner background color to transparent (누끼)">
              <input
                type="checkbox"
                checked={removeBg}
                onChange={(event) => setRemoveBg(event.target.checked)}
              />{" "}
              remove background
            </label>
            {removeBg && (
              <label>
                tol{" "}
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.01}
                  value={bgTolerance}
                  onChange={(event) => setBgTolerance(Number(event.target.value))}
                />
              </label>
            )}
          </div>
          <p className={styles.modalNote}>
            Drag the image to place it · mouse wheel to scale. Apply stamps it over the layer&apos;s
            existing pixels — fine-tune afterwards with the magic eraser and pencil.
          </p>
          <div className={styles.variantActions} style={{ marginTop: 12 }}>
            <button
              type="button"
              disabled={!image}
              onClick={() => {
                if (resultRef.current) onApply(resultRef.current);
              }}
            >
              Apply to layer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
