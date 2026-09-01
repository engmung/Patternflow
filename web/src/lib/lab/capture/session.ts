// ── Capture session: the camera, shared between two panels ───────────────────
// The Capture panel used to own the whole apparatus — worker, project push,
// stage canvas — which made it a second window with a third clock. Now the
// module splits along the Blender line: the CAPTURE PANEL is the camera back
// (settings and the shutter), the PREVIEW PANEL is the viewport that can
// enter camera view (the 📷 viewfinder), and this session is the camera
// body both talk to. It owns the one CaptureClient, keeps the worker fed
// with the live project and settings, fans worker events out to whichever
// panels are listening, and holds the viewfinder switch.
//
// The worker only renders while the viewfinder is attached, on and visible —
// switched off, the whole apparatus idles and Capture is pure controls.
//
// Capture stays an add-on: the lab store never imports this. The Preview
// panel's viewfinder hook is the one place the rest of the lab touches the
// capture module — remove capture, remove that hook, and the lab is whole.

import { useLabStore } from "@/lib/lab/store";
import { CaptureClient, captureSupported, type ProjectSlice } from "./client";
import { loadCaptureSettings } from "./settings";
import type {
  AutoVerdict,
  CaptureSettings,
  FrameMessage,
  ShaderStatus,
  ShowAutomation,
  VideoRequest,
} from "./types";

const PROJECT_SEND_DEBOUNCE_MS = 40;
/** Frame-ack backstop for documents whose rAF is stalled (see onFrame). */
const ACK_BACKSTOP_MS = 200;

export type CaptureSessionState = {
  /** Viewfinder on — the Preview panel shows the output render. */
  view: boolean;
  /** Size of the latest viewfinder frame (the output), for labels. */
  output: { width: number; height: number } | null;
};

export type CaptureSessionEvents = {
  /** Per-layer errors from the latest frame, named for people. */
  errors?: (errors: Record<string, string>) => void;
  auto?: (auto: AutoVerdict | null) => void;
  /** How the shader twin compiled, whenever a source arrives. */
  shader?: (status: ShaderStatus) => void;
  progress?: (done: number, total: number) => void;
  fatal?: (message: string) => void;
};

type Session = {
  supported: boolean;
  getState(): CaptureSessionState;
  subscribe(listener: (state: CaptureSessionState) => void): () => void;
  setView(on: boolean): void;
  /** The Preview panel mounts its canvas here while camera view is on. */
  attachViewfinder(canvas: HTMLCanvasElement): () => void;
  /** Settings changes flow through here (the Capture panel owns the state). */
  applySettings(settings: CaptureSettings): void;
  /** The GLSL twin for a code layer, or null to drop it. */
  setShaderSource(source: string | null, layerId: string | null): void;
  /**
   * Knob push buttons. The Knobs panel presses the live engine directly; these
   * carry the same press to the stage's engine — and to a shader's uBtn
   * uniforms — so what you can trigger in the preview you can also export.
   * They never start the worker: no camera, nothing to press.
   */
  pressButton(index: number): void;
  releaseButton(index: number): void;
  releaseAllButtons(): void;
  /** Latest settings the session pushed — for output-size labels. */
  settings(): CaptureSettings;
  /** Flush the project to the worker NOW (exports call this first). */
  sendProjectNow(): void;
  on(events: CaptureSessionEvents): () => void;
  exportImage(opts?: { automation?: ShowAutomation; warmSeconds?: number }): Promise<Blob>;
  exportVideo(
    video: VideoRequest,
    automation?: ShowAutomation,
    warmSeconds?: number,
  ): Promise<{ blob: Blob; extension: string }>;
  cancelExport(): void;
};

function createSession(): Session {
  const supported = captureSupported();
  let client: CaptureClient | null = null;
  let settings: CaptureSettings = loadCaptureSettings();
  let shaderSource: string | null = null;
  let shaderLayerId: string | null = null;
  let view = false;
  let output: { width: number; height: number } | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let bitmapContext: ImageBitmapRenderingContext | CanvasRenderingContext2D | null = null;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;

  const stateListeners = new Set<(state: CaptureSessionState) => void>();
  const eventListeners = new Set<CaptureSessionEvents>();

  const getState = (): CaptureSessionState => ({ view, output });
  const notify = () => {
    const state = getState();
    for (const listener of stateListeners) listener(state);
  };

  const projectSlice = (): ProjectSlice => {
    const state = useLabStore.getState();
    return {
      matrix: state.matrix,
      layers: state.layers,
      activeLayerId: state.activeLayerId,
      knobs: state.knobs,
      ranges: state.ranges,
    };
  };

  // "Visible" is the viewfinder's intent only — on and attached. Hidden-tab
  // power saving needs no check here: frames are paced by a rAF ack, and a
  // hidden document stops ticking rAFs, so the worker parks itself after one
  // frame and resumes with the tab. One mechanism, no listener.
  const syncVisible = () => {
    client?.setVisible(view && canvas !== null);
  };

  const onFrame = (frame: FrameMessage) => {
    if (canvas) {
      if (canvas.width !== frame.width) canvas.width = frame.width;
      if (canvas.height !== frame.height) canvas.height = frame.height;
      // bitmaprenderer hands the frame over with zero copies. A canvas that
      // ever held a 2d context refuses it — getContext returns null, and
      // silently dropping frames there is a BLACK VIEWFINDER (learned the
      // hard way) — so fall back to drawing the bitmap through 2d.
      const context =
        bitmapContext ??
        (bitmapContext = canvas.getContext("bitmaprenderer") ?? canvas.getContext("2d"));
      if (context && "transferFromImageBitmap" in context) {
        context.transferFromImageBitmap(frame.bitmap);
      } else if (context) {
        context.drawImage(frame.bitmap, 0, 0);
        frame.bitmap.close();
      } else {
        frame.bitmap.close();
      }
    } else {
      frame.bitmap.close();
    }
    // Ack once the browser has had a chance to paint — rAF paces the worker
    // to the display instead of to its own render speed. Documents whose rAF
    // is stalled or heavily throttled (hidden tabs, embedded panes) would
    // freeze the stage on its first frame, so a timeout backstop keeps a
    // slow trickle flowing there instead.
    let acked = false;
    const ack = () => {
      if (acked) return;
      acked = true;
      client?.frameShown();
    };
    const raf = requestAnimationFrame(ack);
    window.setTimeout(() => {
      if (!acked) {
        cancelAnimationFrame(raf);
        ack();
      }
    }, ACK_BACKSTOP_MS);
    if (!output || output.width !== frame.width || output.height !== frame.height) {
      output = { width: frame.width, height: frame.height };
      notify();
    }
    for (const listener of eventListeners) listener.errors?.(frame.errors);
  };

  /** The worker exists from first use and idles forever after — cheap. */
  const ensure = (): CaptureClient | null => {
    if (!supported || typeof window === "undefined") return null;
    if (client) return client;
    client = new CaptureClient({
      onFrame,
      onState: () => undefined,
      onProgress: (done, total) => {
        for (const listener of eventListeners) listener.progress?.(done, total);
      },
      onAuto: (auto) => {
        for (const listener of eventListeners) listener.auto?.(auto);
      },
      onShader: (status) => {
        for (const listener of eventListeners) listener.shader?.(status);
      },
      onFatal: (message) => {
        for (const listener of eventListeners) listener.fatal?.(message);
      },
    });
    client.sendSettings(settings);
    client.sendProject(projectSlice());
    if (shaderSource) client.sendShader(shaderSource, shaderLayerId);
    useLabStore.subscribe((state, previous) => {
      if (
        state.layers !== previous.layers ||
        state.matrix !== previous.matrix ||
        state.knobs !== previous.knobs ||
        state.ranges !== previous.ranges ||
        state.activeLayerId !== previous.activeLayerId
      ) {
        if (sendTimer !== null) clearTimeout(sendTimer);
        sendTimer = setTimeout(() => {
          sendTimer = null;
          client?.sendProject(projectSlice());
        }, PROJECT_SEND_DEBOUNCE_MS);
      }
    });
    syncVisible();
    return client;
  };

  return {
    supported,
    getState,
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    setView(on) {
      if (view === on) return;
      view = on;
      if (on) ensure();
      syncVisible();
      notify();
    },
    attachViewfinder(element) {
      canvas = element;
      bitmapContext = null;
      ensure();
      syncVisible();
      return () => {
        if (canvas === element) {
          canvas = null;
          bitmapContext = null;
          syncVisible();
        }
      };
    },
    applySettings(next) {
      settings = next;
      ensure()?.sendSettings(next);
    },
    setShaderSource(source, layerId) {
      shaderSource = source && source.trim() ? source : null;
      shaderLayerId = layerId;
      ensure()?.sendShader(shaderSource, layerId);
    },
    pressButton(index) {
      client?.pressButton(index);
    },
    releaseButton(index) {
      client?.releaseButton(index);
    },
    releaseAllButtons() {
      for (let index = 0; index < 4; index++) client?.releaseButton(index);
    },
    settings: () => settings,
    sendProjectNow() {
      ensure()?.sendProject(projectSlice());
    },
    on(events) {
      eventListeners.add(events);
      ensure();
      return () => eventListeners.delete(events);
    },
    exportImage(opts) {
      const active = ensure();
      if (!active) return Promise.reject(new Error("Capture is not supported here."));
      return active.exportImage(opts);
    },
    exportVideo(video, automation, warmSeconds) {
      const active = ensure();
      if (!active) return Promise.reject(new Error("Capture is not supported here."));
      return active.exportVideo(video, automation, warmSeconds);
    },
    cancelExport() {
      client?.cancelExport();
    },
  };
}

// One camera per page, dev reloads included.
const host = globalThis as { __pfCaptureSession?: Session };
export const captureSession: Session = (host.__pfCaptureSession ??= createSession());
