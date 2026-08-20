// Bundle entry point. Registers the two custom elements and puts the card in
// Home Assistant's picker.

import { PatternflowCard } from "./patternflow-card";
import { PatternflowCardEditor } from "./editor";

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}

if (!customElements.get("patternflow-card")) {
  customElements.define("patternflow-card", PatternflowCard);
}
if (!customElements.get("patternflow-card-editor")) {
  customElements.define("patternflow-card-editor", PatternflowCardEditor);
}

// Without this the card works but can only be added by typing YAML.
window.customCards = window.customCards ?? [];
window.customCards.push({
  type: "patternflow-card",
  name: "Patternflow",
  description: "The running pattern, its four knobs, and the panel switch.",
  preview: true,
  documentationURL:
    "https://github.com/engmung/Patternflow/tree/main/integrations/homeassistant",
});
