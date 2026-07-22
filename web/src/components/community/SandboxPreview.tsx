"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LOGICAL_KNOB_UNITS_PER_TURN,
  LOGICAL_KNOB_WRAP,
} from "@/lib/patternflowControls";
import { PATTERN_SANDBOX_URL } from "@/lib/community/sandboxUrl";

// Live pattern preview for community (i.e. untrusted) code.
// Uses iframe onLoad, ready handshakes, and immediate pings to eliminate any
// load-race conditions so the live 60fps pattern is guaranteed to play on hover.

type Props = {
  code: string;
  knobValues: number[];
  knobRanges: Array<[number, number]>;
  running?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Called with (ok, error) after each load and on runtime errors. */
  onStatus?: (ok: boolean, error?: string) => void;
};

export default function SandboxPreview({
  code,
  knobValues,
  knobRanges,
  running = true,
  className,
  style,
  onStatus,
}: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Latest props for callbacks that fire outside the render cycle
  const stateRef = useRef({ code, knobValues, knobRanges, running, onStatus });
  useEffect(() => {
    stateRef.current = { code, knobValues, knobRanges, running, onStatus };
  });

  const sendLoad = useCallback(() => {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
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

  // Ready handshake + status relay + race-condition free initialization
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const msg = event.data as { type?: string; ok?: boolean; error?: string };
      if (msg?.type === "pf-ready") {
        sendLoad();
      } else if (msg?.type === "pf-status") {
        if (msg.ok) {
          setIsReady(true);
        }
        stateRef.current.onStatus?.(Boolean(msg.ok), msg.error);
      }
    };

    window.addEventListener("message", handleMessage);

    // Initial load pings (eliminates race condition if pf-ready fired before listener registered)
    sendLoad();
    const t1 = window.setTimeout(sendLoad, 50);
    const t2 = window.setTimeout(sendLoad, 200);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [sendLoad]);

  // Reload on code change
  useEffect(() => {
    const timeout = window.setTimeout(() => sendLoad(), 150);
    return () => window.clearTimeout(timeout);
  }, [code, sendLoad]);

  // Knob turns go straight through
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: "pf-knobs", values: knobValues, ranges: knobRanges },
      "*",
    );
  }, [knobValues, knobRanges]);

  // Toggle running state
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: "pf-run", running }, "*");
  }, [running]);

  return (
    <iframe
      ref={frameRef}
      src={PATTERN_SANDBOX_URL}
      sandbox="allow-scripts"
      className={className}
      onLoad={sendLoad}
      style={{
        opacity: isReady ? 1 : 0,
        transition: "opacity 100ms ease-out",
        ...style,
      }}
      title="Pattern preview (sandboxed)"
    />
  );
}
