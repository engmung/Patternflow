"use client";

import { useCallback, useEffect, useRef } from "react";
import { buildRampLUT, type ColorRamp } from "@/lib/pattern/harness";
import styles from "./SdfPage.module.css";

// FantasiaGarden (@engmung, 2026-08-11, CC-BY-SA-4.0)
// https://community.patternflow.work/community/p/2888ee5273a047fe
// Adapted to fill the viewport edge-to-edge while keeping the original
// invasion-percolation algorithm and oklchLong ramp intact.
const FANTASIA_RAMP: ColorRamp = {
  mode: "oklchLong",
  wrap: false,
  stops: [
    { position: 0, color: [0, 0, 0] },
    { position: 0.119, color: [197, 76, 68] },
    { position: 0.792, color: [102, 255, 0] },
  ],
};

type FrontierSite = { idx: number; resistance: number };

class FantasiaField {
  readonly w: number;
  readonly h: number;
  readonly n: number;
  resistanceBank: Float32Array;
  resistance: Float32Array;
  invaded: Uint8Array;
  age: Float32Array;
  frontier: FrontierSite[] = [];
  stepCounter = 0;
  maxAge = 1.0;
  resistanceOffset = 0;
  private seed = 0x7f3a1b2c;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.n = w * h;
    this.resistanceBank = new Float32Array(w * h * 2);
    this.resistance = new Float32Array(this.n);
    this.invaded = new Uint8Array(this.n);
    this.age = new Float32Array(this.n);
    this.reseed(3);
    const warmup = 1500;
    for (let i = 0; i < warmup; i++) {
      this.invadeOneSite();
    }
  }

  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  private generateResistanceBank(radius: number) {
    const { w, h } = this;
    const bankH = h * 2;
    const totalN = w * bankH;
    for (let i = 0; i < totalN; i++) {
      this.resistanceBank[i] = this.rand();
    }
    const temp = new Float32Array(totalN);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < bankH; y++) {
        const y0 = Math.max(0, y - radius);
        const y1 = Math.min(bankH - 1, y + radius);
        for (let x = 0; x < w; x++) {
          let sum = 0;
          let count = 0;
          const x0 = Math.max(0, x - radius);
          const x1 = Math.min(w - 1, x + radius);
          for (let sy = y0; sy <= y1; sy++) {
            const row = sy * w;
            for (let sx = x0; sx <= x1; sx++) {
              sum += this.resistanceBank[row + sx];
              count++;
            }
          }
          temp[y * w + x] = sum / count;
        }
      }
      this.resistanceBank.set(temp);
    }
  }

  private getResistance(x: number, y: number): number {
    const bankH = this.h * 2;
    let bankY = (y + this.resistanceOffset) % bankH;
    if (bankY < 0) bankY += bankH;
    return this.resistanceBank[bankY * this.w + x];
  }

  private addNeighbors(idx: number) {
    const { w, h } = this;
    const x = idx % w;
    const y = (idx / w) | 0;
    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (let d = 0; d < 4; d++) {
      const nx = x + dirs[d][0];
      const ny = y + dirs[d][1];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nidx = ny * w + nx;
        if (!this.invaded[nidx]) {
          let found = false;
          for (let f = 0; f < this.frontier.length; f++) {
            if (this.frontier[f].idx === nidx) {
              found = true;
              break;
            }
          }
          if (!found) {
            this.frontier.push({ idx: nidx, resistance: this.resistance[nidx] });
          }
        }
      }
    }
  }

  seedAt(nx: number, ny: number, burst = true) {
    const cx = Math.max(1, Math.min(this.w - 2, Math.floor(nx * this.w)));
    const cy = Math.max(1, Math.min(this.h - 2, Math.floor(ny * this.h)));
    const bankH = this.h * 2;
    const basinR = burst ? 11 : 7;
    const r2 = basinR * basinR;

    // Carve an organic low-resistance basin around the touch point so
    // invasion percolation actively surges outward in branching tendrils.
    for (let dy = -basinR; dy <= basinR; dy++) {
      const py = cy + dy;
      if (py < 0 || py >= this.h) continue;
      let bankY = (py + this.resistanceOffset) % bankH;
      if (bankY < 0) bankY += bankH;

      for (let dx = -basinR; dx <= basinR; dx++) {
        const px = cx + dx;
        if (px < 0 || px >= this.w) continue;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > r2) continue;

        const falloff = Math.sqrt(dist2) / basinR;
        const idx = py * this.w + px;
        // Keep a bit of organic noise so tendrils branch rather than form a plain circle
        const carved = Math.min(
          this.resistance[idx],
          0.015 + falloff * 0.18 + this.rand() * 0.08,
        );
        this.resistance[idx] = carved;
        this.resistanceBank[bankY * this.w + px] = carved;

        // Clear older invaded cells in the inner ring so the fresh wave visibly spreads through them
        if (dist2 <= 16 && dist2 > 2 && this.rand() < 0.72) {
          this.invaded[idx] = 0;
          this.age[idx] = 0;
        }
      }
    }

    // Update any existing frontier sites inside the carved basin
    for (let f = 0; f < this.frontier.length; f++) {
      this.frontier[f].resistance = this.resistance[this.frontier[f].idx];
    }

    // Ignite the core seed and run a quick burst so the spread starts immediately
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 1) continue;
        const idx = (cy + dy) * this.w + (cx + dx);
        this.invaded[idx] = 1;
        this.stepCounter += 6;
        this.age[idx] = this.stepCounter;
        if (this.stepCounter > this.maxAge) this.maxAge = this.stepCounter;
        this.addNeighbors(idx);
      }
    }

    const burstSteps = burst ? 24 : 10;
    for (let i = 0; i < burstSteps; i++) {
      this.invadeOneSite();
    }
  }

  reseed(radius: number) {
    const { w, h } = this;
    this.generateResistanceBank(radius);
    this.invaded.fill(0);
    this.age.fill(0);
    this.frontier.length = 0;
    this.stepCounter = 0;
    this.maxAge = 1.0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this.resistance[y * w + x] = this.getResistance(x, y);
      }
    }

    for (let x = 3; x < w - 3; x++) {
      const idx = (h - 1) * w + x;
      if (this.rand() < 0.16) {
        this.invaded[idx] = 1;
        this.stepCounter++;
        this.age[idx] = this.stepCounter;
        if (this.stepCounter > this.maxAge) this.maxAge = this.stepCounter;
        this.addNeighbors(idx);
      }
    }
  }

  invadeOneSite(): boolean {
    if (this.frontier.length === 0) return false;
    let minIdx = 0;
    let minRes = this.frontier[0].resistance;
    for (let i = 1; i < this.frontier.length; i++) {
      if (this.frontier[i].resistance < minRes) {
        minRes = this.frontier[i].resistance;
        minIdx = i;
      }
    }
    const site = this.frontier[minIdx];
    this.frontier[minIdx] = this.frontier[this.frontier.length - 1];
    this.frontier.pop();

    this.invaded[site.idx] = 1;
    this.stepCounter++;
    this.age[site.idx] = this.stepCounter;
    if (this.stepCounter > this.maxAge) this.maxAge = this.stepCounter;

    this.addNeighbors(site.idx);
    return true;
  }

  private checkScroll(): boolean {
    let topCount = 0;
    const rows = Math.min(8, this.h);
    for (let y = 0; y < rows; y++) {
      const row = y * this.w;
      for (let x = 0; x < this.w; x++) {
        if (this.invaded[row + x]) topCount++;
      }
    }
    return topCount > Math.floor(this.w * 0.3);
  }

  private scrollDown() {
    const { w, h } = this;
    for (let y = h - 1; y >= 1; y--) {
      const srcRow = (y - 1) * w;
      const dstRow = y * w;
      for (let x = 0; x < w; x++) {
        this.invaded[dstRow + x] = this.invaded[srcRow + x];
        this.age[dstRow + x] = this.age[srcRow + x] * 0.95;
      }
    }
    for (let x = 0; x < w; x++) {
      this.invaded[x] = 0;
      this.age[x] = 0;
    }

    this.resistanceOffset = (this.resistanceOffset + 1) % (h * 2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this.resistance[y * w + x] = this.getResistance(x, y);
      }
    }

    this.frontier.length = 0;
    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (this.invaded[idx]) {
          for (let d = 0; d < 4; d++) {
            const nx = x + dirs[d][0];
            const ny = y + dirs[d][1];
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nidx = ny * w + nx;
              if (!this.invaded[nidx]) {
                let found = false;
                for (let f = 0; f < this.frontier.length; f++) {
                  if (this.frontier[f].idx === nidx) {
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  this.frontier.push({ idx: nidx, resistance: this.resistance[nidx] });
                }
              }
            }
          }
        }
      }
    }

    for (let x = 3; x < w - 3; x++) {
      const idx = (h - 1) * w + x;
      if (!this.invaded[idx] && this.rand() < 0.12) {
        this.invaded[idx] = 1;
        this.stepCounter++;
        this.age[idx] = this.stepCounter;
        if (this.stepCounter > this.maxAge) this.maxAge = this.stepCounter;
        this.addNeighbors(idx);
      }
    }
  }

  step() {
    // Original FantasiaGarden midpoint knobs:
    // CorrLength=3..5, Speed=48 (range 1..120), Contrast=1.4 (0.3..2.5), AgeDecay=0.924 (0.85..0.998)
    const steps = 48;
    for (let s = 0; s < steps; s++) {
      if (this.frontier.length === 0 || this.checkScroll()) {
        this.scrollDown();
      }
      if (!this.invadeOneSite()) {
        this.scrollDown();
      }
    }

    const decayBase = Math.pow(0.994, steps * 0.05);
    for (let i = 0; i < this.n; i++) {
      if (this.invaded[i]) {
        this.age[i] *= decayBase;
      }
    }
    this.maxAge *= 0.9995;
  }
}

export default function FantasiaGardenCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<FantasiaField | null>(null);
  const visibleRef = useRef(true);
  const draggingRef = useRef(false);
  const lastDragRef = useRef(0);

  const triggerAt = useCallback((e: React.PointerEvent<HTMLCanvasElement>, burst: boolean) => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    sim.seedAt(nx, ny, burst);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      draggingRef.current = true;
      lastDragRef.current = performance.now();
      triggerAt(e, true);
    },
    [triggerAt],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      const now = performance.now();
      if (now - lastDragRef.current < 45) return;
      lastDragRef.current = now;
      triggerAt(e, false);
    },
    [triggerAt],
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isWide = window.innerWidth >= 768;
    const gridW = isWide ? 104 : 64;
    const gridH = isWide ? 64 : 128;
    canvas.width = gridW;
    canvas.height = gridH;

    const lut = buildRampLUT(FANTASIA_RAMP);
    const sim = new FantasiaField(gridW, gridH);
    simRef.current = sim;

    const imageData = ctx.createImageData(gridW, gridH);
    const pixels = imageData.data;

    const drawFrame = () => {
      const invMaxAge = sim.maxAge > 1.0 ? 1.0 / sim.maxAge : 1.0;
      const contrastInv = 1.0 / 1.4;

      for (let i = 0; i < sim.n; i++) {
        const pi = i * 4;
        if (sim.invaded[i]) {
          let v = sim.age[i] * invMaxAge;
          if (v < 0) v = 0;
          else if (v > 1) v = 1;
          v = Math.pow(v, contrastInv);
          const li = Math.max(0, Math.min(255, Math.round(v * 255))) * 3;
          pixels[pi] = lut[li];
          pixels[pi + 1] = lut[li + 1];
          pixels[pi + 2] = lut[li + 2];
          pixels[pi + 3] = 255;
        } else {
          pixels[pi] = 0;
          pixels[pi + 1] = 0;
          pixels[pi + 2] = 0;
          pixels[pi + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    drawFrame();
    if (reduceMotion) return;

    const observer = new IntersectionObserver(
      (entries) => {
        visibleRef.current = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.02 },
    );
    observer.observe(canvas);

    let rafId = 0;
    let lastTick = 0;
    const FRAME_MS = 1000 / 24;

    const loop = (now: number) => {
      rafId = window.requestAnimationFrame(loop);
      if (!visibleRef.current) return;
      if (now - lastTick < FRAME_MS) return;
      lastTick = now;
      sim.step();
      drawFrame();
    };

    rafId = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className={styles.fieldCanvas}
      aria-label="FantasiaGarden generative light field. Tap or drag to grow a new wave."
    />
  );
}
