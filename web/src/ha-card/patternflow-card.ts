// The Patternflow dashboard card.
//
// A live preview of the running pattern with the four encoders laid over it,
// the same idea as a card on the community wall — but the pattern is on a
// device across the room and the knobs are Home Assistant entities.
//
// Two things it deliberately does NOT do.
//
// It never talks to the panel. Every read is a Home Assistant state and every
// write is a service call. The panel's web server takes one connection at a
// time and pauses drawing while it answers; a card that polled it from every
// open dashboard tab is the shape of the problem that got a frame-preview
// endpoint deleted on the day it shipped.
//
// It never asks the panel for pixels either. The preview is the pattern's own
// JavaScript running in a sandboxed iframe in this browser, which is what the
// firmware's own note says a live preview should be if one ever came back.

import { knobSetupFromCode } from "@/lib/community/knobs";
import { LOGICAL_KNOB_WRAP, logicalKnobUnitsPerTurn } from "@/lib/patternflowControls";
import { describeMatrixShape, matrixFromCode } from "@/lib/patternMatrix";
import { PRESET_CODE } from "./presetCode";
import { SandboxDriver } from "./sandbox";
import { CARD_STYLES } from "./styles";

const KNOB_COUNT = 4;

/** How often a drag is allowed to reach the device, in milliseconds.
 *
 *  A drag produces dozens of values a second; each one is a websocket call to
 *  Home Assistant and then an MQTT publish to the panel. The preview does not
 *  wait for any of it — it runs locally — so this only paces the panel. The
 *  release always sends, whatever the timer says: a fast drag that stopped
 *  paced would leave the panel somewhere in the middle of the gesture. */
const WRITE_INTERVAL_MS = 150;

/** Where the sandbox document is served from — the integration's static path. */
const SANDBOX_URL = "/patternflow_static/pattern-sandbox.html";

type HassEntity = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
};

type Hass = {
  states: Record<string, HassEntity>;
  entities?: Record<string, { entity_id: string; device_id?: string; platform?: string }>;
  devices?: Record<string, { id: string; name?: string }>;
  callService: (domain: string, service: string, data: Record<string, unknown>) => Promise<unknown>;
};

export type PatternflowCardConfig = {
  type: string;
  device_id?: string;
  switch_entity?: string;
  select_entity?: string;
  knob_entities?: string[];
  /** Run the pattern in the card. Off leaves the controls and drops the iframe. */
  preview?: boolean;
  /** Show the installed-pattern list under the preview. */
  show_patterns?: boolean;
};

type Resolved = {
  switchId?: string;
  selectId?: string;
  knobIds: string[];
};

/** Every Patternflow entity belonging to one device, knobs in encoder order. */
function resolveEntities(hass: Hass, config: PatternflowCardConfig): Resolved {
  if (config.switch_entity || config.select_entity || config.knob_entities) {
    return {
      switchId: config.switch_entity,
      selectId: config.select_entity,
      knobIds: config.knob_entities ?? [],
    };
  }

  const registry = hass.entities ?? {};
  const ours = Object.values(registry).filter((entry) => entry.platform === "patternflow");
  const deviceId = config.device_id ?? ours.find((entry) => entry.device_id)?.device_id;
  const mine = ours.filter((entry) => !deviceId || entry.device_id === deviceId);

  const knobs = mine
    .filter((entry) => entry.entity_id.startsWith("number."))
    // By the entity's own `knob` attribute, not by its id: an entity can be
    // renamed, and four knobs in the wrong order is a card that turns the
    // wrong one with no visible sign of it.
    .sort((a, b) => knobNumber(hass, a.entity_id) - knobNumber(hass, b.entity_id))
    .map((entry) => entry.entity_id);

  return {
    switchId: mine.find((entry) => entry.entity_id.startsWith("switch."))?.entity_id,
    selectId: mine.find((entry) => entry.entity_id.startsWith("select."))?.entity_id,
    knobIds: knobs,
  };
}

function knobNumber(hass: Hass, entityId: string): number {
  const value = hass.states[entityId]?.attributes?.knob;
  return typeof value === "number" ? value : Number.MAX_SAFE_INTEGER;
}

function percentOf(entity: HassEntity | undefined): number | null {
  if (!entity) return null;
  const value = Number(entity.state);
  return Number.isFinite(value) ? value : null;
}

export class PatternflowCard extends HTMLElement {
  private config: PatternflowCardConfig = { type: "custom:patternflow-card" };
  private hassRef?: Hass;
  private root: ShadowRoot;

  private sandbox?: SandboxDriver;
  private stage?: HTMLElement;
  private zones: HTMLElement[] = [];
  private readout?: HTMLElement;
  private mounted = false;

  private code = "";
  private slug: string | null = null;
  private labels: string[] = ["K1", "K2", "K3", "K4"];
  private ranges: Array<[number, number]> = [
    [0, 1],
    [0, 1],
    [0, 1],
    [0, 1],
  ];

  /** What the card shows and feeds the preview. Device values unless a drag
   *  is in flight, because the preview must not lag the finger. */
  private local: number[] = [50, 50, 50, 50];
  private dragging: number | null = null;
  private dragStartValue = 0;
  private dragStartY = 0;
  private active = 0;

  private lastSentAt = [0, 0, 0, 0];
  private pending: Array<number | null> = [null, null, null, null];
  private timers: Array<number | null> = [null, null, null, null];

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  setConfig(config: PatternflowCardConfig): void {
    this.config = { preview: true, show_patterns: true, ...config };
    this.mounted = false;
    this.root.innerHTML = "";
  }

  set hass(hass: Hass) {
    this.hassRef = hass;
    if (!this.mounted) this.build();
    this.update();
  }

  getCardSize(): number {
    return this.config.show_patterns ? 12 : 8;
  }

  static getStubConfig(hass: Hass): PatternflowCardConfig {
    const first = Object.values(hass.entities ?? {}).find(
      (entry) => entry.platform === "patternflow" && entry.device_id,
    );
    return { type: "custom:patternflow-card", device_id: first?.device_id };
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("patternflow-card-editor");
  }

  disconnectedCallback(): void {
    this.sandbox?.disconnect();
    this.timers.forEach((id) => id !== null && window.clearTimeout(id));
  }

  // ── Building ───────────────────────────────────────────────────────────

  private build(): void {
    const style = document.createElement("style");
    style.textContent = CARD_STYLES;

    const card = document.createElement("ha-card");
    card.innerHTML = `
      <div class="stage" part="stage">
        <div class="still">loading…</div>
        <div class="zones">
          ${Array.from({ length: KNOB_COUNT }, () => '<div class="zone"></div>').join("")}
        </div>
        <div class="readout bottom">
          <div class="readout-row">
            <span class="readout-label"></span>
            <span class="readout-value"></span>
          </div>
          <div class="track"><div class="fill"></div></div>
        </div>
        <span class="badge" hidden></span>
      </div>
      <div class="head">
        <span class="title"></span>
        <ha-switch class="power"></ha-switch>
      </div>
      <div class="patterns"></div>
      <div class="notice" hidden></div>
    `;

    this.root.append(style, card);
    this.stage = card.querySelector(".stage") as HTMLElement;
    this.zones = Array.from(card.querySelectorAll(".zone"));
    this.readout = card.querySelector(".readout") as HTMLElement;

    this.attachGestures();
    this.attachPower(card);
    this.mounted = true;
  }

  private attachPower(card: HTMLElement): void {
    const toggle = card.querySelector(".power") as HTMLElement & { checked?: boolean };
    toggle.addEventListener("change", () => {
      const { switchId } = resolveEntities(this.hassRef!, this.config);
      if (!switchId) return;
      this.hassRef?.callService("switch", "toggle", { entity_id: switchId });
    });
  }

  // ── Gestures ───────────────────────────────────────────────────────────
  //
  // One gesture for mouse and touch alike: the horizontal position picks the
  // encoder, a vertical drag turns it. The community site does this with the
  // wheel, which has no equivalent on a phone at all; the wheel is kept here
  // for the muscle memory but it is no longer the only way in.

  private attachGestures(): void {
    const stage = this.stage!;

    stage.addEventListener("pointerdown", (event: PointerEvent) => {
      if (!this.knobsUsable()) return;
      stage.setPointerCapture(event.pointerId);
      stage.classList.add("touched");
      this.active = this.zoneAt(event);
      this.dragging = this.active;
      this.dragStartValue = this.local[this.active];
      this.dragStartY = event.clientY;
      this.dodge(event);
      this.paintOverlay();
    });

    stage.addEventListener("pointermove", (event: PointerEvent) => {
      if (this.dragging === null) {
        if (event.pointerType === "mouse") {
          stage.classList.add("touched");
          this.active = this.zoneAt(event);
          this.dodge(event);
          this.paintOverlay();
        }
        return;
      }
      // A full drag over the stage's height crosses the whole range. Vertical
      // because the horizontal axis is already spoken for by zone selection.
      const travel = (this.dragStartY - event.clientY) / stage.clientHeight;
      this.setLocal(this.dragging, this.dragStartValue + travel * 100);
      this.dodge(event);
    });

    const release = (event: PointerEvent) => {
      if (this.dragging === null) return;
      const index = this.dragging;
      this.dragging = null;
      if (stage.hasPointerCapture(event.pointerId)) {
        stage.releasePointerCapture(event.pointerId);
      }
      // The last value is the one that matters — the throttle may still be
      // holding it, and the panel would be left mid-gesture.
      this.flush(index, true);
      if (event.pointerType !== "mouse") stage.classList.remove("touched");
    };

    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);

    stage.addEventListener("pointerleave", () => {
      if (this.dragging === null) stage.classList.remove("touched");
    });

    stage.addEventListener(
      "wheel",
      (event: WheelEvent) => {
        if (!this.knobsUsable()) return;
        event.preventDefault();
        this.active = this.zoneAt(event);
        this.setLocal(this.active, this.local[this.active] + (event.deltaY < 0 ? 4 : -4));
      },
      // Not passive: preventDefault is the point, or the dashboard scrolls
      // under the gesture.
      { passive: false },
    );

    // A double tap on a zone puts that knob back to the middle of its range,
    // which is where every pattern's defaults start.
    stage.addEventListener("dblclick", (event: MouseEvent) => {
      if (!this.knobsUsable()) return;
      const index = this.zoneAt(event);
      this.setLocal(index, 50);
      this.flush(index, true);
    });
  }

  private zoneAt(event: { clientX: number }): number {
    const rect = this.stage!.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(KNOB_COUNT - 1, Math.floor(ratio * KNOB_COUNT)));
  }

  /** Keep the readout out from under the pointer. */
  private dodge(event: { clientY: number }): void {
    const rect = this.stage!.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    if (ratio > 0.55) {
      this.readout!.classList.replace("bottom", "top");
    } else if (ratio < 0.45) {
      this.readout!.classList.replace("top", "bottom");
    }
  }

  private knobsUsable(): boolean {
    const { knobIds } = resolveEntities(this.hassRef!, this.config);
    return knobIds.length === KNOB_COUNT;
  }

  private setLocal(index: number, percent: number): void {
    this.local[index] = Math.max(0, Math.min(100, percent));
    this.paintOverlay();
    this.pushKnobsToSandbox();
    this.scheduleWrite(index);
  }

  // ── Writing ────────────────────────────────────────────────────────────

  private scheduleWrite(index: number): void {
    this.pending[index] = this.local[index];
    const since = performance.now() - this.lastSentAt[index];
    if (since >= WRITE_INTERVAL_MS) {
      this.flush(index);
      return;
    }
    if (this.timers[index] === null) {
      this.timers[index] = window.setTimeout(
        () => this.flush(index),
        WRITE_INTERVAL_MS - since,
      );
    }
  }

  private flush(index: number, force = false): void {
    const timer = this.timers[index];
    if (timer !== null) {
      window.clearTimeout(timer);
      this.timers[index] = null;
    }

    const value = force ? this.local[index] : this.pending[index];
    if (value === null) return;
    this.pending[index] = null;
    this.lastSentAt[index] = performance.now();

    const { knobIds } = resolveEntities(this.hassRef!, this.config);
    const entityId = knobIds[index];
    if (!entityId) return;

    this.hassRef
      ?.callService("number", "set_value", {
        entity_id: entityId,
        value: Math.round(value),
      })
      .catch((error: unknown) => this.showNotice(String(error)));
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  private update(): void {
    const hass = this.hassRef;
    if (!hass || !this.mounted) return;

    const { switchId, selectId, knobIds } = resolveEntities(hass, this.config);
    const select = selectId ? hass.states[selectId] : undefined;
    const power = switchId ? hass.states[switchId] : undefined;

    if (!select && !power) {
      this.showNotice(
        "No Patternflow entities found. Set device_id, or the entities, in the card configuration.",
      );
      return;
    }
    this.showNotice(null);

    // Knob values follow the device unless a drag is in flight — the preview
    // must not stutter back to a stale poll while a finger is down.
    if (this.dragging === null) {
      knobIds.forEach((entityId, index) => {
        const percent = percentOf(hass.states[entityId]);
        if (percent !== null && this.pending[index] === null) this.local[index] = percent;
      });
    }

    this.applyPattern(select);
    this.paintHead(select, power);
    this.paintOverlay();
    this.paintPatterns(select);

    const asleep = power?.state === "off";
    this.stage?.classList.toggle("asleep", asleep);
    // Nothing to look at while the panel is dark, and a hidden iframe running
    // a pattern at 60fps in a background tab is pure waste.
    this.sandbox?.setRunning(!asleep && this.config.preview !== false);
  }

  private applyPattern(select: HassEntity | undefined): void {
    const slug = (select?.attributes?.slug as string | null) ?? null;
    const labels = select?.attributes?.knob_labels;
    if (Array.isArray(labels) && labels.length === KNOB_COUNT) {
      this.labels = labels.map(String);
    }

    if (slug === this.slug) return;
    this.slug = slug;

    // A preset has no slug, and a community module has one this bundle has
    // never heard of. Both are a card without a picture, not a card with an
    // error on it — the controls are the point.
    const code = slug ? (PRESET_CODE[slug] ?? "") : "";
    this.code = code;

    if (!code || this.config.preview === false) {
      this.sandbox?.disconnect();
      this.sandbox?.element.remove();
      this.sandbox = undefined;
      this.setStill(
        slug
          ? "No preview bundled for this pattern"
          : "Presets have no preview — the controls still work",
      );
      return;
    }

    const setup = knobSetupFromCode(code);
    this.ranges = setup.ranges;
    this.labels = setup.labels;

    // A pattern composed for a landscape frame is shown a quarter turn round,
    // the same as on the community site, because the panel stands upright.
    const landscape = describeMatrixShape(matrixFromCode(code)) === "landscape";
    this.stage?.classList.toggle("landscape", landscape);

    if (!this.sandbox) {
      this.sandbox = new SandboxDriver(SANDBOX_URL, (status) => {
        if (!status.ok) this.setStill(status.error ?? "This pattern did not load");
      });
      this.sandbox.element.classList.add("frame");
      this.stage?.prepend(this.sandbox.element);
      this.sandbox.connect();
    }

    this.setStill(null);
    this.sandbox.load(
      code,
      this.patternUnits(),
      this.ranges,
      [...LOGICAL_KNOB_WRAP],
      logicalKnobUnitsPerTurn(this.ranges),
    );
  }

  /** The knob values in the pattern's own units, which is what it reads. */
  private patternUnits(): number[] {
    return this.local.map((percent, index) => {
      const [min, max] = this.ranges[index] ?? [0, 1];
      return min + (percent / 100) * (max - min);
    });
  }

  private pushKnobsToSandbox(): void {
    this.sandbox?.setKnobs(this.patternUnits(), this.ranges);
  }

  private paintHead(select?: HassEntity, power?: HassEntity): void {
    const title = this.root.querySelector(".title") as HTMLElement;
    const toggle = this.root.querySelector(".power") as HTMLElement & { checked?: boolean };
    const badge = this.root.querySelector(".badge") as HTMLElement;

    const name = select?.state ?? "—";
    title.textContent = name;
    if (power) toggle.checked = power.state === "on";

    // Says which kind of control the knobs are right now. An absolute-ready
    // pattern holds what it is given; anything else integrates detents and
    // never reports back, and a person deserves to know which they have.
    const absolute = Boolean(select?.attributes?.absolute_ready);
    badge.hidden = !select;
    badge.textContent = absolute ? "absolute" : "relative";
  }

  private paintOverlay(): void {
    this.zones.forEach((zone, index) => zone.classList.toggle("active", index === this.active));

    const label = this.root.querySelector(".readout-label") as HTMLElement;
    const value = this.root.querySelector(".readout-value") as HTMLElement;
    const fill = this.root.querySelector(".fill") as HTMLElement;

    const name = this.labels[this.active] ?? `K${this.active + 1}`;
    label.textContent = name === `K${this.active + 1}` ? name : `K${this.active + 1} ${name}`;
    value.textContent = `${Math.round(this.local[this.active])}%`;
    fill.style.width = `${Math.round(this.local[this.active])}%`;
  }

  private paintPatterns(select?: HassEntity): void {
    const list = this.root.querySelector(".patterns") as HTMLElement;
    if (this.config.show_patterns === false || !select) {
      list.hidden = true;
      return;
    }
    list.hidden = false;

    const options = (select.attributes.options as string[] | undefined) ?? [];
    const current = select.state;
    const signature = `${options.join(" ")}${current}`;
    if (list.dataset.signature === signature) return;
    list.dataset.signature = signature;

    list.innerHTML = "";
    options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = option === current ? "pattern current" : "pattern";
      button.textContent = option;
      button.addEventListener("click", () => {
        this.hassRef?.callService("select", "select_option", {
          entity_id: select.entity_id,
          option,
        });
      });
      list.append(button);
    });
  }

  private setStill(text: string | null): void {
    const still = this.root.querySelector(".still") as HTMLElement;
    still.hidden = text === null;
    if (text !== null) still.textContent = text;
  }

  private showNotice(text: string | null): void {
    const notice = this.root.querySelector(".notice") as HTMLElement;
    notice.hidden = text === null;
    if (text !== null) notice.textContent = text;
  }
}
