"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  LOGICAL_KNOB_UNITS_PER_TURN,
  LOGICAL_KNOB_WRAP,
} from "@/lib/patternflowControls";
import { PATTERN_SANDBOX_URL } from "@/lib/community/sandboxUrl";

// Live pattern preview for community (i.e. untrusted) code. The code runs in
// /pattern-sandbox.html inside an allow-scripts-only iframe; this component
// just drives it over postMessage. Never render community code with the
// in-page PatternRuntime — the iframe is the XSS boundary.

type Props = {
  code: string;
  knobValues: number[];
  knobRanges: Array<[number, number]>;
  running?: boolean;
  className?: string;
  /** Called with (ok, error) after each load and on runtime errors. */
  onStatus?: (ok: boolean, error?: string) => void;
};

export default function SandboxPreview({
  code,
  knobValues,
  knobRanges,
  running = true,
  className,
  onStatus,
}: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);

  // Latest props for callbacks that fire outside the render cycle
  // (postMessage handlers, debounce timers). Synced in an effect — this must
  // stay the FIRST effect so later effects and timers read fresh values.
  const stateRef = useRef({ code, knobValues, knobRanges, running, onStatus });
  useEffect(() => {
    stateRef.current = { code, knobValues, knobRanges, running, onStatus };
  });

  const sendLoad = useCallback(() => {
    const target = frameRef.current?.contentWindow;
    if (!target || !readyRef.current) return;
    const state = stateRef.current;
    target.postMessage(
      {
        type: "pf-load",
        code: state.code,
        knobValues: state.knobValues,
        knobRanges: state.knobRanges,
        knobWrap: [...LOGICAL_KNOB_WRAP],
        knobUnitsPerTurn: [...LOGICAL_KNOB_UNITS_PER_TURN],
        running: state.running,
      },
      "*",
    );
  }, []);

  // Ready handshake + status relay, bound to this specific iframe.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const msg = event.data as { type?: string; ok?: boolean; error?: string };
      if (msg?.type === "pf-ready") {
        readyRef.current = true;
        sendLoad();
      } else if (msg?.type === "pf-status") {
        stateRef.current.onStatus?.(Boolean(msg.ok), msg.error);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [sendLoad]);

  // Reload on code change (debounced — the detail page sends editor keystrokes).
  useEffect(() => {
    const timeout = window.setTimeout(() => sendLoad(), 250);
    return () => window.clearTimeout(timeout);
  }, [code, sendLoad]);

  // Knob turns go straight through — no reload needed.
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: "pf-knobs", values: knobValues, ranges: knobRanges },
      "*",
    );
  }, [knobValues, knobRanges]);

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: "pf-run", running }, "*");
  }, [running]);

  return (
    <iframe
      ref={frameRef}
      src={PATTERN_SANDBOX_URL}
      sandbox="allow-scripts"
      className={className}
      title="Pattern preview (sandboxed)"
    />
  );
}
