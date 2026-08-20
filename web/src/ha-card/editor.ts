// The card's visual configuration editor.
//
// Small on purpose. There are two real choices — which device, and whether to
// run the preview — and everything else the card works out for itself from the
// entity registry. A card that makes you name six entities is a card people
// configure in YAML instead.

import type { PatternflowCardConfig } from "./patternflow-card";

type Hass = {
  entities?: Record<string, { entity_id: string; device_id?: string; platform?: string }>;
  devices?: Record<string, { id: string; name_by_user?: string; name?: string }>;
};

export class PatternflowCardEditor extends HTMLElement {
  private config: PatternflowCardConfig = { type: "custom:patternflow-card" };
  private hassRef?: Hass;
  private root: ShadowRoot;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  setConfig(config: PatternflowCardConfig): void {
    this.config = config;
    this.render();
  }

  set hass(hass: Hass) {
    this.hassRef = hass;
    this.render();
  }

  private devices(): Array<{ id: string; label: string }> {
    const hass = this.hassRef;
    if (!hass) return [];

    const ids = new Set<string>();
    for (const entry of Object.values(hass.entities ?? {})) {
      if (entry.platform === "patternflow" && entry.device_id) ids.add(entry.device_id);
    }

    return [...ids].map((id) => ({
      id,
      label: hass.devices?.[id]?.name_by_user ?? hass.devices?.[id]?.name ?? id,
    }));
  }

  private emit(changes: Partial<PatternflowCardConfig>): void {
    this.config = { ...this.config, ...changes };
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this.config },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private render(): void {
    const devices = this.devices();
    const selected = this.config.device_id ?? devices[0]?.id ?? "";

    this.root.innerHTML = `
      <style>
        .row { display: flex; align-items: center; gap: .75rem; padding: .5rem 0; }
        label { flex: 1; color: var(--primary-text-color); }
        select { padding: .35rem; }
        .hint { color: var(--secondary-text-color); font-size: .8rem; padding-bottom: .5rem; }
      </style>
      <div class="row">
        <label for="device">Device</label>
        <select id="device">
          ${
            devices.length
              ? devices
                  .map(
                    (device) =>
                      `<option value="${device.id}"${
                        device.id === selected ? " selected" : ""
                      }>${device.label}</option>`,
                  )
                  .join("")
              : '<option value="">No Patternflow device set up</option>'
          }
        </select>
      </div>
      <div class="row">
        <label for="preview">Run the pattern in the card</label>
        <input type="checkbox" id="preview"${this.config.preview !== false ? " checked" : ""}>
      </div>
      <div class="hint">
        The preview runs the pattern's own code in this browser, sandboxed. The panel is
        never asked for pixels — it cannot spare them.
      </div>
      <div class="row">
        <label for="patterns">Show the installed patterns</label>
        <input type="checkbox" id="patterns"${
          this.config.show_patterns !== false ? " checked" : ""
        }>
      </div>
    `;

    this.root.querySelector("#device")?.addEventListener("change", (event) => {
      this.emit({ device_id: (event.target as HTMLSelectElement).value });
    });
    this.root.querySelector("#preview")?.addEventListener("change", (event) => {
      this.emit({ preview: (event.target as HTMLInputElement).checked });
    });
    this.root.querySelector("#patterns")?.addEventListener("change", (event) => {
      this.emit({ show_patterns: (event.target as HTMLInputElement).checked });
    });
  }
}
