// ── The panel's view of the shared transport ─────────────────────────────────
// Playback belongs to lib/lab/director/transport — ONE clock for the whole
// lab. This mirrors it: the playhead CSS variable on the timeline element,
// the time readout (throttled while playing), the banner message at the
// playhead, whether the play button shows ❚❚, and a ref the panel can read
// for "the playhead now" in a handler.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { bakeShowV2 } from "@/lib/lab/director/bake";
import { showTransport, type ShowTransportState } from "@/lib/lab/director/transport";

type Baked = ReturnType<typeof bakeShowV2>;

export function useTransportView({
  baked,
  timelineRef,
  playheadRef,
}: {
  baked: Baked;
  timelineRef: RefObject<HTMLDivElement | null>;
  /** Written here, read by handlers that need the playhead without a render. */
  playheadRef: RefObject<number>;
}) {
  const [playing, setPlaying] = useState(false);
  const [timeText, setTimeText] = useState("0.0");
  const [message, setMessage] = useState<string>("");

  const bakedRef = useRef(baked);
  useEffect(() => {
    bakedRef.current = baked;
  }, [baked]);

  // The playhead carries its time in seconds; CSS multiplies by --pps, so a
  // zoom moves every playhead without a seek.
  const moveDom = useCallback(
    (t: number) => {
      timelineRef.current?.style.setProperty("--pht", String(t));
    },
    [timelineRef],
  );

  const updateMessageAt = useCallback((t: number) => {
    let text = "";
    for (const cue of bakedRef.current.perf.timeline) {
      if (cue.t > t) break;
      if (cue.message != null) text = cue.message;
    }
    setMessage(text);
  }, []);

  const seek = useCallback((t: number) => showTransport.seek(t), []);
  const togglePlay = useCallback(() => showTransport.toggle(), []);
  const backToStart = useCallback(() => {
    showTransport.pause();
    showTransport.seek(0);
  }, []);

  useEffect(() => {
    let readoutAt = 0;
    const apply = (state: ShowTransportState) => {
      playheadRef.current = state.time;
      moveDom(state.time);
      updateMessageAt(state.time);
      setPlaying(state.playing);
      const now = performance.now();
      if (!state.playing || now - readoutAt > 150) {
        readoutAt = now;
        setTimeText(state.time.toFixed(1));
      }
    };
    apply(showTransport.get());
    return showTransport.subscribe(apply);
  }, [moveDom, updateMessageAt, playheadRef]);

  return { playing, timeText, message, seek, togglePlay, backToStart };
}

export type TransportView = ReturnType<typeof useTransportView>;
