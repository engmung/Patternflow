// Drives the pattern sandbox iframe from the Home Assistant card.
//
// Same protocol as SandboxPreview.tsx, which is the React version of this on
// the community site — out: pf-load / pf-knobs / pf-run, in: pf-ready /
// pf-status. Kept as its own small class rather than reusing that component
// because the card is a plain custom element and pulling React into a Lovelace
// resource to own one iframe would be absurd.
//
// The load pings at 0 / 50 / 200 ms are not belt and braces. The iframe may
// post pf-ready before this side has a listener attached, and then nothing ever
// arrives; the same three pings are in the React version for the same reason.

export type SandboxStatus = { ok: boolean; error?: string };

export class SandboxDriver {
  private frame: HTMLIFrameElement;
  private onStatus?: (status: SandboxStatus) => void;
  private code = "";
  private values: number[] = [0.5, 0.5, 0.5, 0.5];
  private ranges: Array<[number, number]> = [
    [0, 1],
    [0, 1],
    [0, 1],
    [0, 1],
  ];
  private wrap: boolean[] = [false, false, false, false];
  private unitsPerTurn: number[] = [1, 1, 1, 1];
  private running = false;
  private timers: number[] = [];
  private listener?: (event: MessageEvent) => void;

  constructor(src: string, onStatus?: (status: SandboxStatus) => void) {
    this.onStatus = onStatus;

    this.frame = document.createElement("iframe");
    this.frame.src = src;
    // allow-scripts WITHOUT allow-same-origin: the pattern runs in an opaque
    // origin, so it cannot reach Home Assistant's DOM, storage or session even
    // though the document is served from the same host.
    this.frame.setAttribute("sandbox", "allow-scripts");
    this.frame.setAttribute("title", "Pattern preview");
    this.frame.setAttribute("scrolling", "no");
    this.frame.style.cssText =
      "border:0;width:100%;height:100%;display:block;pointer-events:none;background:#000";
    this.frame.addEventListener("load", () => this.sendLoad());
  }

  get element(): HTMLIFrameElement {
    return this.frame;
  }

  connect(): void {
    this.listener = (event: MessageEvent) => {
      if (event.source !== this.frame.contentWindow) return;
      const message = event.data as { type?: string; ok?: boolean; error?: string };
      if (message?.type === "pf-ready") {
        this.sendLoad();
      } else if (message?.type === "pf-status") {
        this.onStatus?.({ ok: Boolean(message.ok), error: message.error });
      }
    };
    window.addEventListener("message", this.listener);
    this.timers = [0, 50, 200].map((delay) =>
      window.setTimeout(() => this.sendLoad(), delay),
    );
  }

  disconnect(): void {
    if (this.listener) window.removeEventListener("message", this.listener);
    this.listener = undefined;
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers = [];
  }

  /** Load a pattern. Cheap to call with the same code — it is a no-op then. */
  load(
    code: string,
    values: number[],
    ranges: Array<[number, number]>,
    wrap: boolean[],
    unitsPerTurn: number[],
  ): void {
    if (code === this.code) {
      this.setKnobs(values, ranges);
      return;
    }
    this.code = code;
    this.values = values;
    this.ranges = ranges;
    this.wrap = wrap;
    this.unitsPerTurn = unitsPerTurn;
    this.sendLoad();
  }

  setKnobs(values: number[], ranges: Array<[number, number]>): void {
    this.values = values;
    this.ranges = ranges;
    this.post({ type: "pf-knobs", values, ranges });
  }

  setRunning(running: boolean): void {
    if (running === this.running) return;
    this.running = running;
    this.post({ type: "pf-run", running });
  }

  private sendLoad(): void {
    if (!this.code) return;
    this.post({
      type: "pf-load",
      code: this.code,
      knobValues: this.values,
      knobRanges: this.ranges,
      knobWrap: this.wrap,
      knobUnitsPerTurn: this.unitsPerTurn,
      running: this.running,
    });
  }

  private post(message: unknown): void {
    this.frame.contentWindow?.postMessage(message, "*");
  }
}
