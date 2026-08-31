// ── Capture client ───────────────────────────────────────────────────────────
// The main-thread handle on the capture worker: owns the Worker, ships
// project/settings updates, paces frames, and turns export messages into
// promises. The panel is the only consumer; nothing in the store knows the
// worker exists.

import type { MatrixSize } from "@/lib/patternMatrix";
import type { Layer } from "../types";
import type {
  AutoVerdict,
  CaptureSettings,
  FrameMessage,
  FromWorker,
  ShowAutomation,
  ToWorker,
  VideoRequest,
  WireLayer,
  WireProject,
} from "./types";

/** What the client reads from the store — the render-relevant slice only. */
export type ProjectSlice = {
  matrix: MatrixSize;
  layers: Layer[];
  activeLayerId: string;
  knobs: number[];
  ranges: Array<[number, number]>;
};

export type CaptureClientHandlers = {
  onFrame: (frame: FrameMessage) => void;
  onState: (state: { time: number; playing: boolean }) => void;
  onProgress: (done: number, total: number) => void;
  onFatal: (message: string) => void;
  /** The auto probe's standalone verdict (frames don't flow while idle). */
  onAuto?: (auto: AutoVerdict | null) => void;
};

type Pending =
  | { kind: "image"; resolve: (blob: Blob) => void; reject: (error: Error) => void }
  | {
      kind: "video";
      resolve: (result: { blob: Blob; extension: string }) => void;
      reject: (error: Error) => void;
    };

export function captureSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}

export class CaptureClient {
  private worker: Worker;
  private pending = new Map<number, Pending>();
  private nextRequestId = 1;
  private sentPixelRevs = new Map<string, number>();
  private disposed = false;

  constructor(private readonly handlers: CaptureClientHandlers) {
    this.worker = new Worker(new URL("./capture.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<FromWorker>) => this.receive(event.data);
    this.worker.onerror = (event) => {
      const message = event.message || "The capture worker crashed.";
      this.failAll(message);
      this.handlers.onFatal(message);
    };
  }

  private send(message: ToWorker) {
    if (this.disposed) return;
    this.worker.postMessage(message);
  }

  private receive(message: FromWorker) {
    switch (message.type) {
      case "ready":
        return;
      case "frame":
        this.handlers.onFrame(message);
        return;
      case "state":
        this.handlers.onState({ time: message.time, playing: message.playing });
        return;
      case "progress":
        this.handlers.onProgress(message.done, message.total);
        return;
      case "image": {
        const pending = this.pending.get(message.requestId);
        this.pending.delete(message.requestId);
        if (pending?.kind === "image") pending.resolve(message.blob);
        return;
      }
      case "video": {
        const pending = this.pending.get(message.requestId);
        this.pending.delete(message.requestId);
        if (pending?.kind === "video") {
          pending.resolve({ blob: message.blob, extension: message.extension });
        }
        return;
      }
      case "failed": {
        const pending = this.pending.get(message.requestId);
        this.pending.delete(message.requestId);
        pending?.reject(new Error(message.message));
        return;
      }
      case "auto":
        this.handlers.onAuto?.(message.auto);
        return;
      case "fatal":
        this.failAll(message.message);
        this.handlers.onFatal(message.message);
        return;
    }
  }

  private failAll(message: string) {
    for (const pending of this.pending.values()) pending.reject(new Error(message));
    this.pending.clear();
  }

  /**
   * Ship the project. Pixel buffers go only when their `rev` moved since the
   * last send — the worker keeps the previous copy — so a knob drag costs a
   * few numbers, not a re-upload of every bitmap.
   */
  sendProject(slice: ProjectSlice) {
    const live = new Set<string>();
    const layers: WireLayer[] = slice.layers.map((layer) => {
      if (layer.type !== "pixel") return layer;
      live.add(layer.id);
      const { data, ...rest } = layer;
      if (this.sentPixelRevs.get(layer.id) === layer.rev) return rest;
      this.sentPixelRevs.set(layer.id, layer.rev);
      return { ...rest, data };
    });
    for (const id of this.sentPixelRevs.keys()) {
      if (!live.has(id)) this.sentPixelRevs.delete(id);
    }
    const project: WireProject = {
      matrix: slice.matrix,
      layers,
      activeLayerId: slice.activeLayerId,
      knobs: slice.knobs,
      ranges: slice.ranges,
    };
    this.send({ type: "project", project });
  }

  sendSettings(settings: CaptureSettings) {
    this.send({ type: "settings", settings });
  }

  setVisible(visible: boolean) {
    this.send({ type: "visible", visible });
  }

  play() {
    this.send({ type: "play" });
  }

  pause() {
    this.send({ type: "pause" });
  }

  restart() {
    this.send({ type: "restart" });
  }

  step(frames: number) {
    this.send({ type: "step", frames });
  }

  frameShown() {
    this.send({ type: "frame-shown" });
  }

  exportImage(opts?: {
    automation?: ShowAutomation;
    warmSeconds?: number;
  }): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const requestId = this.nextRequestId++;
      this.pending.set(requestId, { kind: "image", resolve, reject });
      this.send({
        type: "export-image",
        requestId,
        automation: opts?.automation,
        warmSeconds: opts?.warmSeconds,
      });
    });
  }

  exportVideo(
    video: VideoRequest,
    automation?: ShowAutomation,
    warmSeconds?: number,
  ): Promise<{ blob: Blob; extension: string }> {
    return new Promise((resolve, reject) => {
      const requestId = this.nextRequestId++;
      this.pending.set(requestId, { kind: "video", resolve, reject });
      this.send({ type: "export-video", requestId, video, automation, warmSeconds });
    });
  }

  cancelExport() {
    this.send({ type: "cancel-export" });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.failAll("Capture panel closed.");
    this.worker.terminate();
  }
}
