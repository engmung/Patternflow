"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import s from "./VideoBaker.module.css";
import {
  encodePFV1,
  decodePFV1,
  imageDataToRgb565,
  rgb565ToImageData,
  estimatePfvSize,
  formatBytes,
  fpsFromMilli,
  PFV_WIDTH,
  PFV_HEIGHT,
  type PFV1Header,
} from "@/lib/pfv";
import {
  processFrame,
  DEFAULT_PIPELINE,
  type PipelineOptions,
  type FitMode,
  type DitherMode,
  type Rotation,
} from "@/lib/ledPipeline";
import {
  supportsWebCodecs,
  extractFramesWebCodecs,
  extractFramesLegacy,
  getVideoInfo,
  type SourceInfo,
} from "@/lib/videoDecoder";
import {
  supportsWebSerial,
  uploadPfvToDevice,
  listDeviceFiles,
  clearDeviceFiles,
  deleteDeviceFile,
  type UploadProgress,
  type DeviceInfo,
} from "@/lib/serialUpload";

// ── Types ──────────────────────────────────────────────

type TargetFps = 8 | 12 | 15 | 30;

const SIZE_WARNING_BYTES = 4 * 1024 * 1024; // 4 MB

interface BakerState {
  sourceFile: File | null;
  sourceUrl: string | null;
  sourceInfo: SourceInfo | null;
  targetFps: TargetFps;
  trimStart: number;
  trimEnd: number;
  pipeline: PipelineOptions;
  bakedFrames: Uint16Array[];
  previewFrames: ImageData[];
  currentFrame: number;
  isPlaying: boolean;
  isBaking: boolean;
  bakeProgress: number;
  error: string | null;
  pfvHeader: PFV1Header | null;
}

const INITIAL: BakerState = {
  sourceFile: null,
  sourceUrl: null,
  sourceInfo: null,
  targetFps: 12,
  trimStart: 0,
  trimEnd: 0,
  pipeline: { ...DEFAULT_PIPELINE },
  bakedFrames: [],
  previewFrames: [],
  currentFrame: 0,
  isPlaying: false,
  isBaking: false,
  bakeProgress: 0,
  error: null,
  pfvHeader: null,
};

// ── Helpers ────────────────────────────────────────────

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return m > 0 ? `${m}:${s.padStart(4, "0")}` : `${s}s`;
}

// ── Component ──────────────────────────────────────────

export default function VideoBakerClient() {
  const [st, setSt] = useState<BakerState>(INITIAL);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pfvInputRef = useRef<HTMLInputElement>(null);
  const playTimerRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadProgress | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [canUseSerial, setCanUseSerial] = useState(false);

  // ── Canvas rendering ─────────────────────────────────

  useEffect(() => {
    setCanUseSerial(supportsWebSerial());
  }, []);

  const drawFrame = useCallback((frameIdx: number, frames: ImageData[]) => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const idx = Math.max(0, Math.min(frames.length - 1, frameIdx));
    ctx.putImageData(frames[idx], 0, 0);
  }, []);

  useEffect(() => {
    drawFrame(st.currentFrame, st.previewFrames);
  }, [st.currentFrame, st.previewFrames, drawFrame]);

  // ── Live pipeline preview (single frame) ─────────────

  const renderLivePreview = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    if (st.bakedFrames.length > 0) return; // don't overwrite baked preview
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const frame = processFrame(
      video,
      video.videoWidth,
      video.videoHeight,
      st.pipeline,
    );
    ctx.putImageData(frame, 0, 0);
  }, [st.pipeline, st.bakedFrames.length]);

  // Debounced live preview on pipeline changes
  useEffect(() => {
    if (!st.sourceUrl || st.bakedFrames.length > 0) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(renderLivePreview, 60);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [st.pipeline, st.sourceUrl, st.bakedFrames.length, renderLivePreview]);

  // ── Playback loop ────────────────────────────────────

  useEffect(() => {
    if (st.isPlaying && st.previewFrames.length > 1) {
      const interval = 1000 / st.targetFps;
      playTimerRef.current = window.setInterval(() => {
        setSt((p) => ({
          ...p,
          currentFrame: (p.currentFrame + 1) % p.previewFrames.length,
        }));
      }, interval);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [st.isPlaying, st.previewFrames.length, st.targetFps]);

  // ── Cleanup source URL ───────────────────────────────

  useEffect(() => {
    return () => {
      if (st.sourceUrl) URL.revokeObjectURL(st.sourceUrl);
    };
  }, [st.sourceUrl]);

  // ── File handling ────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    // Revoke old URL
    setSt((p) => {
      if (p.sourceUrl) URL.revokeObjectURL(p.sourceUrl);
      return p;
    });

    const url = URL.createObjectURL(file);

    setSt((p) => ({
      ...p,
      sourceFile: file,
      sourceUrl: url,
      sourceInfo: null,
      bakedFrames: [],
      previewFrames: [],
      currentFrame: 0,
      isPlaying: false,
      error: null,
      pfvHeader: null,
      trimStart: 0,
      trimEnd: 0,
    }));

    try {
      const info = await getVideoInfo(file);
      setSt((p) => ({
        ...p,
        sourceInfo: info,
        trimEnd: info.duration,
      }));
    } catch (e) {
      setSt((p) => ({
        ...p,
        error: `Failed to read video: ${e instanceof Error ? e.message : String(e)}`,
      }));
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  // ── Video preview seek ───────────────────────────────

  const seekVideo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);

  // ── Bake ─────────────────────────────────────────────

  const handleBake = useCallback(async () => {
    if (!st.sourceFile) return;

    setSt((p) => ({
      ...p,
      isBaking: true,
      bakeProgress: 0,
      error: null,
      bakedFrames: [],
      previewFrames: [],
      currentFrame: 0,
      isPlaying: false,
    }));

    try {
      const opts = {
        targetFps: st.targetFps,
        trimStart: st.trimStart,
        trimEnd: st.trimEnd,
        onProgress: (p: number) => {
          setSt((prev) => ({ ...prev, bakeProgress: p * 0.6 }));
        },
      };

      let sourceBitmaps: (VideoFrame | ImageBitmap)[] = [];
      let srcW = 0;
      let srcH = 0;

      if (supportsWebCodecs()) {
        try {
          console.log("[baker] WebCodecs path");
          const result = await extractFramesWebCodecs(st.sourceFile, opts);
          sourceBitmaps = result.frames;
          srcW = result.info.width;
          srcH = result.info.height;
          console.log(`[baker] WebCodecs → ${sourceBitmaps.length} frames`);
        } catch (wcErr) {
          console.warn("[baker] WebCodecs failed, fallback:", wcErr);
          sourceBitmaps = [];
        }
      }

      if (sourceBitmaps.length === 0) {
        console.log("[baker] Legacy <video> path");
        const result = await extractFramesLegacy(st.sourceFile, opts);
        sourceBitmaps = result.bitmaps;
        srcW = result.info.width;
        srcH = result.info.height;
        console.log(`[baker] Legacy → ${sourceBitmaps.length} frames`);
      }

      if (sourceBitmaps.length === 0) {
        throw new Error("No frames extracted — try a different video file.");
      }

      const bakedFrames: Uint16Array[] = [];
      const previewFrames: ImageData[] = [];

      for (let i = 0; i < sourceBitmaps.length; i++) {
        const processed = processFrame(
          sourceBitmaps[i] as CanvasImageSource,
          srcW,
          srcH,
          st.pipeline,
        );
        bakedFrames.push(imageDataToRgb565(processed));
        previewFrames.push(processed);

        if ("close" in sourceBitmaps[i]) {
          (sourceBitmaps[i] as VideoFrame).close();
        }

        setSt((p) => ({
          ...p,
          bakeProgress: 0.6 + ((i + 1) / sourceBitmaps.length) * 0.4,
        }));
      }

      console.log(`[baker] Done: ${bakedFrames.length} frames`);

      setSt((p) => ({
        ...p,
        bakedFrames,
        previewFrames,
        isBaking: false,
        bakeProgress: 1,
        currentFrame: 0,
      }));
    } catch (e) {
      setSt((p) => ({
        ...p,
        isBaking: false,
        error: `Bake failed: ${e instanceof Error ? e.message : String(e)}`,
      }));
    }
  }, [st.sourceFile, st.targetFps, st.trimStart, st.trimEnd, st.pipeline]);

  // ── Export PFV ───────────────────────────────────────

  const handleExport = useCallback(() => {
    if (st.bakedFrames.length === 0) return;
    const buffer = encodePFV1(st.bakedFrames, st.targetFps);
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const name = st.sourceFile?.name?.replace(/\.[^.]+$/, "") ?? "clip";
    a.download = `${name}_${PFV_WIDTH}x${PFV_HEIGHT}_${st.targetFps}fps.pfv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [st.bakedFrames, st.targetFps, st.sourceFile]);

  // ── Load PFV (Phase 2) ──────────────────────────────

  const handleLoadPfv = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const buffer = await file.arrayBuffer();
        const { header, frames } = decodePFV1(buffer);
        const previews = frames.map((f) => rgb565ToImageData(f));
        const fps = Math.round(fpsFromMilli(header.fpsMilli)) as TargetFps;

        setSt((p) => ({
          ...p,
          sourceFile: file,
          sourceUrl: null,
          sourceInfo: {
            duration: frames.length / fpsFromMilli(header.fpsMilli),
            width: header.width,
            height: header.height,
          },
          targetFps: fps,
          bakedFrames: frames,
          previewFrames: previews,
          currentFrame: 0,
          isPlaying: false,
          error: null,
          pfvHeader: header,
        }));
      } catch (e) {
        setSt((p) => ({
          ...p,
          error: `PFV load failed: ${e instanceof Error ? e.message : String(e)}`,
        }));
      }
    },
    [],
  );

  // ── Pipeline update helper ───────────────────────────

  const setPipeline = useCallback(
    (key: keyof PipelineOptions, value: number | string) => {
      setSt((p) => ({
        ...p,
        pipeline: { ...p.pipeline, [key]: value },
      }));
    },
    [],
  );

  // ── Derived values ───────────────────────────────────

  const trimDuration = st.trimEnd - st.trimStart;
  const estimatedFrames = Math.max(0, Math.floor(trimDuration * st.targetFps));
  const estimatedSize = estimatePfvSize(estimatedFrames);
  const hasBaked = st.bakedFrames.length > 0;
  const hasSource = !!st.sourceFile && !!st.sourceInfo;
  const sizeWarning = estimatedSize > SIZE_WARNING_BYTES;
  const showLiveCanvas = hasSource && !hasBaked; // show canvas even before bake for live preview

  // ── Render ───────────────────────────────────────────

  return (
    <div className={s.shell}>
      {/* Header */}
      <div className={s.header}>
        <Link href="/" className={s.brand}>Patternflow</Link>
        <div className={s.headerMeta}>
          <span>Video Baker</span>
          <span>·</span>
          <span>Experimental</span>
        </div>
      </div>

      <div className={s.workspace}>
        {/* ─── Left: Source + Preview ─── */}
        <div className={s.previewColumn}>

          {/* Source video player */}
          {st.sourceUrl && (
            <div className={s.videoSection}>
              <div className={s.miniLabel}>Source</div>
              <div className={s.videoWrap}>
                <video
                  ref={videoRef}
                  src={st.sourceUrl}
                  muted
                  playsInline
                  preload="auto"
                  className={s.sourceVideo}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = st.trimStart;
                    }
                  }}
                />
              </div>

              {/* Trim controls */}
              {st.sourceInfo && (
                <div className={s.trimSection}>
                  <div className={s.trimRow}>
                    <span className={s.trimLabel}>IN</span>
                    <input
                      type="range"
                      min={0}
                      max={st.sourceInfo.duration}
                      step={0.1}
                      value={st.trimStart}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSt((p) => ({
                          ...p,
                          trimStart: Math.min(v, p.trimEnd - 0.1),
                        }));
                        seekVideo(v);
                      }}
                      className={s.trimSlider}
                    />
                    <span className={s.trimTime}>{fmtTime(st.trimStart)}</span>
                  </div>
                  <div className={s.trimRow}>
                    <span className={s.trimLabel}>OUT</span>
                    <input
                      type="range"
                      min={0}
                      max={st.sourceInfo.duration}
                      step={0.1}
                      value={st.trimEnd}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSt((p) => ({
                          ...p,
                          trimEnd: Math.max(v, p.trimStart + 0.1),
                        }));
                        seekVideo(v);
                      }}
                      className={s.trimSlider}
                    />
                    <span className={s.trimTime}>{fmtTime(st.trimEnd)}</span>
                  </div>
                  <div className={s.trimInfo}>
                    <span>Duration: <strong>{fmtTime(trimDuration)}</strong></span>
                    <span>≈ {estimatedFrames} frames</span>
                    <span>≈ {formatBytes(estimatedSize)}</span>
                  </div>
                </div>
              )}

              {/* Source info */}
              <div className={s.sourceInfo}>
                <span>{st.sourceInfo?.width}×{st.sourceInfo?.height}</span>
                <span>{fmtTime(st.sourceInfo?.duration ?? 0)} total</span>
                {st.sourceFile && <span>{formatBytes(st.sourceFile.size)}</span>}
                {st.sourceInfo?.codec && <span>{st.sourceInfo.codec}</span>}
              </div>
            </div>
          )}

          {/* LED preview (live + baked) */}
          <div className={s.ledSection}>
            <div className={s.miniLabel}>
              {hasBaked ? "Baked Preview — 128×64" : "LED Preview — 128×64"}
            </div>
            <div className={s.matrixFrame}>
              {(hasBaked || showLiveCanvas) ? (
                <canvas ref={canvasRef} width={PFV_WIDTH} height={PFV_HEIGHT} />
              ) : (
                <div className={s.emptyMatrix}>DROP VIDEO TO START</div>
              )}
            </div>
          </div>

          {/* Transport controls */}
          {hasBaked && (
            <div className={s.transport}>
              {/* Skip to start */}
              <button
                title="First frame"
                onClick={() => setSt((p) => ({ ...p, currentFrame: 0, isPlaying: false }))}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <rect x="1" y="2" width="2" height="10" />
                  <polygon points="13,2 5,7 13,12" />
                </svg>
              </button>

              {/* Step back */}
              <button
                title="Previous frame"
                onClick={() =>
                  setSt((p) => ({
                    ...p,
                    currentFrame: Math.max(0, p.currentFrame - 1),
                    isPlaying: false,
                  }))
                }
              >
                <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                  <polygon points="12,1 2,7 12,13" />
                </svg>
              </button>

              {/* Play / Pause */}
              <button
                className={`${s.playBtn} ${st.isPlaying ? s.active : ""}`}
                title={st.isPlaying ? "Pause" : "Play"}
                onClick={() => setSt((p) => ({ ...p, isPlaying: !p.isPlaying }))}
              >
                {st.isPlaying ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="2" y="1" width="3.5" height="12" rx="0.5" />
                    <rect x="8.5" y="1" width="3.5" height="12" rx="0.5" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <polygon points="2,1 13,7 2,13" />
                  </svg>
                )}
              </button>

              {/* Step forward */}
              <button
                title="Next frame"
                onClick={() =>
                  setSt((p) => ({
                    ...p,
                    currentFrame: Math.min(p.previewFrames.length - 1, p.currentFrame + 1),
                    isPlaying: false,
                  }))
                }
              >
                <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                  <polygon points="0,1 10,7 0,13" />
                </svg>
              </button>

              {/* Skip to end */}
              <button
                title="Last frame"
                onClick={() =>
                  setSt((p) => ({
                    ...p,
                    currentFrame: p.previewFrames.length - 1,
                    isPlaying: false,
                  }))
                }
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <polygon points="1,2 9,7 1,12" />
                  <rect x="11" y="2" width="2" height="10" />
                </svg>
              </button>

              {/* Timeline scrubber */}
              <input
                type="range"
                className={s.timeline}
                min={0}
                max={st.previewFrames.length - 1}
                value={st.currentFrame}
                onChange={(e) =>
                  setSt((p) => ({ ...p, currentFrame: Number(e.target.value), isPlaying: false }))
                }
              />
              <span className={s.frameCounter}>
                {st.currentFrame + 1} / {st.previewFrames.length}
              </span>
            </div>
          )}

          {/* Drop zone (no file yet) */}
          {!st.sourceFile && (
            <div
              className={`${s.dropZone} ${dragOver ? s.dropZoneActive : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <p>Drop video file or click to browse</p>
              <span>MP4, WebM supported</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={onFileChange}
                style={{ display: "none" }}
              />
            </div>
          )}

          {/* PFV metadata */}
          {st.pfvHeader && (
            <div className={s.pfvMeta}>
              <span>Format: <strong>{st.pfvHeader.magic}</strong></span>
              <span>Res: <strong>{st.pfvHeader.width}×{st.pfvHeader.height}</strong></span>
              <span>Frames: <strong>{st.pfvHeader.frameCount}</strong></span>
              <span>FPS: <strong>{fpsFromMilli(st.pfvHeader.fpsMilli)}</strong></span>
              <span>CRC: <strong>0x{st.pfvHeader.dataCrc32.toString(16)}</strong></span>
              <span>Flags: <strong>0x{st.pfvHeader.flags.toString(16)}</strong></span>
            </div>
          )}

          {st.error && <div className={s.errorBox}>{st.error}</div>}
        </div>

        {/* ─── Right: Controls ─── */}
        <div className={s.controlColumn}>
          <h3 className={s.sectionTitle}>Bake Settings</h3>

          <div className={s.devNote}>
            <strong>In development</strong>
            <ul>
              <li>Serial upload needs more hardware-side testing and recovery handling.</li>
              <li>Some browser codecs and seek timing can still fail during bake.</li>
              <li>Long clips should move from full PSRAM loading to streamed playback later.</li>
            </ul>
          </div>

          <div className={s.settingRow}>
            <label>FPS</label>
            <div className={s.toggleGroup}>
              {([8, 12, 15, 30] as TargetFps[]).map((fps) => (
                <button
                  key={fps}
                  className={st.targetFps === fps ? s.active : ""}
                  onClick={() => setSt((p) => ({ ...p, targetFps: fps }))}
                >{fps}</button>
              ))}
            </div>
            <span className={s.value}>{st.targetFps} fps</span>
          </div>

          <div className={s.settingRow}>
            <label>Fit</label>
            <div className={s.toggleGroup}>
              {(["cover", "contain"] as FitMode[]).map((mode) => (
                <button
                  key={mode}
                  className={st.pipeline.fitMode === mode ? s.active : ""}
                  onClick={() => setPipeline("fitMode", mode)}
                >{mode}</button>
              ))}
            </div>
            <span className={s.value}>{st.pipeline.fitMode}</span>
          </div>

          {/* Crop position (cover only) */}
          {st.pipeline.fitMode === "cover" && (
            <>
              <div className={s.settingRow}>
                <label>Crop X</label>
                <input type="range" min={0} max={1} step={0.01}
                  value={st.pipeline.cropX}
                  onChange={(e) => setPipeline("cropX", Number(e.target.value))}
                />
                <span className={s.value}>{Math.round(st.pipeline.cropX * 100)}%</span>
              </div>
              <div className={s.settingRow}>
                <label>Crop Y</label>
                <input type="range" min={0} max={1} step={0.01}
                  value={st.pipeline.cropY}
                  onChange={(e) => setPipeline("cropY", Number(e.target.value))}
                />
                <span className={s.value}>{Math.round(st.pipeline.cropY * 100)}%</span>
              </div>
            </>
          )}

          {/* Rotation */}
          <div className={s.settingRow}>
            <label>Rotate</label>
            <div className={s.toggleGroup}>
              {([0, 90, 180, 270] as Rotation[]).map((deg) => (
                <button
                  key={deg}
                  className={st.pipeline.rotation === deg ? s.active : ""}
                  onClick={() => setPipeline("rotation", deg)}
                >{deg}°</button>
              ))}
            </div>
            <span className={s.value}>{st.pipeline.rotation}°</span>
          </div>

          {/* Size warning */}
          {sizeWarning && hasSource && (
            <div className={s.sizeWarning}>
              ⚠ Estimated PFV size ({formatBytes(estimatedSize)}) exceeds 4 MB.
              This may not fit in ESP32 flash. Consider shorter duration or lower FPS.
            </div>
          )}

          {/* LED Pipeline */}
          <h3 className={s.sectionTitle}>LED Pipeline</h3>

          {([
            ["brightness", "Bright", 0, 200, 1],
            ["contrast", "Contrast", 0, 200, 1],
            ["saturation", "Satur.", 0, 200, 1],
            ["gamma", "Gamma", 0.2, 3.0, 0.05],
          ] as [keyof PipelineOptions, string, number, number, number][]).map(
            ([key, label, min, max, step]) => (
              <div className={s.settingRow} key={key}>
                <label>{label}</label>
                <input type="range" min={min} max={max} step={step}
                  value={st.pipeline[key] as number}
                  onChange={(e) => setPipeline(key, Number(e.target.value))}
                />
                <span className={s.value}>
                  {Number(st.pipeline[key]).toFixed(key === "gamma" ? 2 : 0)}
                </span>
              </div>
            ),
          )}

          <div className={s.settingRow}>
            <label>Dither</label>
            <div className={s.toggleGroup}>
              {(["off", "floyd-steinberg", "ordered"] as DitherMode[]).map((mode) => (
                <button
                  key={mode}
                  className={st.pipeline.dither === mode ? s.active : ""}
                  onClick={() => setPipeline("dither", mode)}
                >
                  {mode === "floyd-steinberg" ? "F-S" : mode}
                </button>
              ))}
            </div>
            <span className={s.value}>{st.pipeline.dither}</span>
          </div>

          {/* Progress */}
          {st.isBaking && (
            <div className={s.progressWrap}>
              <div className={s.progressBar}>
                <div className={s.progressFill} style={{ width: `${st.bakeProgress * 100}%` }} />
              </div>
              <div className={s.progressLabel}>
                Baking… {Math.round(st.bakeProgress * 100)}%
              </div>
            </div>
          )}

          {/* Actions */}
          <div className={s.actions}>
            <button
              className={s.primary}
              disabled={!hasSource || st.isBaking}
              onClick={handleBake}
            >
              {st.isBaking ? "Baking…" : "Bake"}
            </button>
            <button disabled={!hasBaked} onClick={handleExport}>Export PFV</button>
            <button onClick={() => pfvInputRef.current?.click()}>Load PFV</button>
            {st.sourceFile && (
              <button onClick={() => {
                if (st.sourceUrl) URL.revokeObjectURL(st.sourceUrl);
                setSt(INITIAL);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}>
                Clear
              </button>
            )}
          </div>

          {/* Upload to Device */}
          {hasBaked && canUseSerial && (
            <button
              className={`${s.uploadBtn} ${uploadStatus?.phase === "sending" ? s.uploading : ""}`}
              disabled={uploadStatus?.phase === "sending"}
              onClick={async () => {
                try {
                  const buffer = encodePFV1(st.bakedFrames, st.targetFps);
                  const name = st.sourceFile?.name?.replace(/\.[^.]+$/, "") ?? "clip";
                  const fname = `${name}.pfv`;
                  setUploadStatus({ phase: "connecting", percent: 0, message: "Select port." });
                  await uploadPfvToDevice(buffer, fname, setUploadStatus);
                } catch (e) {
                  setUploadStatus({
                    phase: "error",
                    percent: 0,
                    message: e instanceof Error ? e.message : String(e),
                  });
                }
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="6" y="1" width="2" height="8" />
                <polygon points="3,7 7,12 11,7" />
                <rect x="1" y="13" width="12" height="1" />
              </svg>
              {uploadStatus?.phase === "sending"
                ? `Uploading ${uploadStatus.percent}%`
                : "Upload to Device"}
            </button>
          )}

          {/* Upload status */}
          {uploadStatus && uploadStatus.phase !== "sending" && (
            <div className={uploadStatus.phase === "error" ? s.errorBox : s.uploadDone}>
              {uploadStatus.message}
            </div>
          )}

          <input
            ref={pfvInputRef}
            type="file"
            accept=".pfv"
            onChange={handleLoadPfv}
            style={{ display: "none" }}
          />

          {hasBaked && (
            <div className={s.fileStats}>
              <span>Baked: <span className={s.statValue}>{st.bakedFrames.length} frames</span></span>
              <span>PFV: <span className={s.statValue}>{formatBytes(estimatePfvSize(st.bakedFrames.length))}</span></span>
            </div>
          )}

          {/* Device Management */}
          {canUseSerial && (
            <>
              <h3 className={s.sectionTitle}>Device</h3>
              <div className={s.actions}>
                <button
                  disabled={deviceLoading}
                  onClick={async () => {
                    setDeviceLoading(true);
                    try {
                      const info = await listDeviceFiles();
                      setDeviceInfo(info);
                    } catch (e) {
                      setSt((p) => ({ ...p, error: `Device: ${e instanceof Error ? e.message : String(e)}` }));
                    } finally {
                      setDeviceLoading(false);
                    }
                  }}
                >{deviceLoading ? "Scanning…" : "Scan Device"}</button>
                <button
                  disabled={deviceLoading}
                  onClick={async () => {
                    if (!confirm("Delete ALL PFV files on device?")) return;
                    setDeviceLoading(true);
                    try {
                      const freeBytes = await clearDeviceFiles();
                      setDeviceInfo({ files: [], freeBytes });
                    } catch (e) {
                      setSt((p) => ({ ...p, error: `Device: ${e instanceof Error ? e.message : String(e)}` }));
                    } finally {
                      setDeviceLoading(false);
                    }
                  }}
                >Clear All</button>
              </div>
              {deviceInfo && (
                <div className={s.devicePanel}>
                  <div className={s.deviceFree}>
                    Free: <strong>{formatBytes(deviceInfo.freeBytes)}</strong>
                  </div>
                  {deviceInfo.files.length === 0 ? (
                    <div className={s.deviceEmpty}>No files on device</div>
                  ) : (
                    deviceInfo.files.map((f) => (
                      <div key={f.name} className={s.deviceFile}>
                        <span className={s.deviceFileName}>{f.name}</span>
                        <span className={s.deviceFileSize}>{formatBytes(f.size)}</span>
                        <button
                          className={s.deviceDeleteBtn}
                          onClick={async () => {
                            try {
                              await deleteDeviceFile(f.name);
                              setDeviceInfo((prev) => prev ? ({
                                ...prev,
                                files: prev.files.filter((x) => x.name !== f.name),
                              }) : null);
                            } catch (e) {
                              setSt((p) => ({ ...p, error: String(e) }));
                            }
                          }}
                        >×</button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
