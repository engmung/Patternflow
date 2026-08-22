// Scratch: how big does a published stack get with pixel layers on it?
import { flattenLayers, needsFlatten } from "../src/lib/lab/flatten";
import { buildStackAnnotation } from "../src/lib/lab/stackShare";
import { codeLayerFromSource } from "../src/lib/lab/store";
import { createPixelLayer, type Layer } from "../src/lib/lab/types";
import { livePresets } from "../src/lib/presets";
import { CODE_MAX } from "../src/lib/community/validate";

const matrix = { width: 128, height: 64 };
const code = codeLayerFromSource(livePresets.find((p) => p.name === "0707")!.code, "Code 1").layer;

function pixel(name: string, fill: "sparse" | "noise" | "empty") {
  const layer = createPixelLayer(matrix, name);
  if (fill === "noise") for (let i = 0; i < layer.data.length; i++) layer.data[i] = (Math.random() * 256) | 0;
  if (fill === "sparse") for (let y = 10; y < 30; y++) for (let x = 10; x < 60; x++) { const i = (y * 128 + x) * 4; layer.data[i] = 255; layer.data[i + 3] = 255; }
  return layer;
}

async function measure(label: string, layers: Layer[]) {
  const flat = flattenLayers(layers, matrix, { labels: ["a", "b", "c", "d"], ranges: [[0, 1], [0, 1], [0, 1], [0, 1]] });
  const stack = await buildStackAnnotation({ matrix, layers, activeLayerId: layers[0].id, knobs: [0, 0, 0, 0], ranges: [[0, 1], [0, 1], [0, 1], [0, 1]], knobLabels: ["a", "b", "c", "d"], forkOf: null, gen: { count: 5, thinking: "LOW", refs: 6, colorMode: "vfield" } }).catch(() => null);
  const total = stack ? flat.length + stack.length + 3 : flat.length;
  console.log(`${label.padEnd(34)} flatten=${String(flat.length).padStart(7)} stack=${String(stack?.length ?? "DROPPED").padStart(7)} total=${String(total).padStart(7)} ${total > CODE_MAX ? "✗ OVER CODE_MAX" : "ok"}${stack ? "" : "  (layers lost on reopen)"}`);
}

(async () => {
  console.log(`CODE_MAX=${CODE_MAX}; needsFlatten(pixel only)=${needsFlatten([pixel("p", "sparse")])}`);
  await measure("code only", [code]);
  await measure("empty pixel on top of code", [pixel("Pixel 1", "empty"), code]);
  await measure("sparse pixel on top of code", [pixel("Pixel 1", "sparse"), code]);
  await measure("noisy pixel on top of code", [pixel("Pixel 1", "noise"), code]);
  await measure("2 sparse pixels + code", [pixel("Pixel 1", "sparse"), pixel("Pixel 2", "sparse"), code]);
  await measure("2 noisy pixels + code", [pixel("Pixel 1", "noise"), pixel("Pixel 2", "noise"), code]);
  await measure("pixel only (no code layer)", [pixel("Pixel 1", "sparse")]);
})();
