import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILD_CASES } from '@/components/sections/build-cases-data';
import { CASE_MODELS, DEVKIT_NODE, KNOB_NODES, LED_NODE, PCB_NODE } from './caseModels';

// The case models against the files in public/: every case on the Build
// panel's switch has one, each has the parts the preview finds by name
// (caseModels.ts), what an entry names — the parts its exploded view moves,
// the materials its finishes recolour — is in the file, and the model the
// page loads first is no heavier than the one it replaced. Reads the GLB's
// JSON chunk only; the meshes are Draco-compressed and stay that way.

const PUBLIC = path.resolve(__dirname, '../../../public');

/** The landing page's first model, public/3dforweb.glb, which the page used to load first. */
const OLD_MODEL_BYTES = 1_154_992;
/** The official model loads with the page: well under the old one. */
const FIRST_LOAD_BUDGET = 450_000;
/** A remix's model loads when it is picked. */
const REMIX_BUDGET = 600_000;

interface GltfNode {
  name?: string;
  mesh?: number;
  rotation?: number[];
  children?: number[];
}

interface Gltf {
  scene?: number;
  scenes: { nodes: number[] }[];
  nodes: GltfNode[];
  meshes: { primitives: { attributes: Record<string, number>; material?: number }[] }[];
  materials?: { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[]; roughnessFactor?: number } }[];
  extensionsRequired?: string[];
}

function readGlb(file: string): Gltf {
  const buf = fs.readFileSync(file);
  expect(buf.readUInt32LE(0), `${file} is not a GLB`).toBe(0x46546c67);
  const length = buf.readUInt32LE(12);
  expect(buf.readUInt32LE(16), `${file}: first chunk is not JSON`).toBe(0x4e4f534a);
  return JSON.parse(buf.subarray(20, 20 + length).toString('utf8')) as Gltf;
}

const models = BUILD_CASES.map((item) => ({ id: item.id, model: CASE_MODELS[item.id] }));

/** CIELAB (D65) of a linear-light RGB colour, as glTF stores a base colour. */
function lab([r, g, b]: number[]) {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  return { L: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

describe('case models', () => {
  it('has one for every case on the switch, and no other', () => {
    expect(Object.keys(CASE_MODELS).sort()).toEqual(BUILD_CASES.map((item) => item.id).sort());
    for (const { id, model } of models) expect(model.id).toBe(id);
  });

  describe.each(models)('$id', ({ id, model }) => {
    const file = path.join(PUBLIC, model.url);

    it('is a file in public/, inside the case’s own folder', () => {
      expect(model.url).toBe(`/cases/${id}/model.glb`);
      expect(fs.existsSync(file), `${model.url} is missing`).toBe(true);
    });

    it('has the parts the preview finds by name', () => {
      const gltf = readGlb(file);
      const top = gltf.scenes[gltf.scene ?? 0].nodes.map((i) => gltf.nodes[i]);
      const byName = new Map(top.map((node) => [node.name, node]));
      const board = [PCB_NODE, DEVKIT_NODE];
      for (const name of [LED_NODE, ...KNOB_NODES, ...(model.boardless ? [] : board)]) {
        expect(byName.has(name), `${id}: no top-level node "${name}"`).toBe(true);
      }
      // A build with no Patternflow board has none in its model either.
      if (model.boardless) for (const name of board) expect(byName.has(name), `${id}: has "${name}"`).toBe(false);
      // The pattern shaders draw with the panel's UVs.
      const led = byName.get(LED_NODE)!;
      for (const prim of gltf.meshes[led.mesh!].primitives) {
        expect(Object.keys(prim.attributes)).toContain('TEXCOORD_0');
      }
      // A knob turns about its own +z: no rotation on the node.
      for (const name of KNOB_NODES) {
        const knob = byName.get(name)!;
        expect(knob.mesh, `${id}: knob ${name} has no mesh`).toBeDefined();
        expect(knob.rotation ?? [0, 0, 0, 1], `${id}: knob ${name} is turned`).toEqual([0, 0, 0, 1]);
      }
      // The case itself: at least one part besides the device's own.
      const shared = new Set<string>([LED_NODE, ...KNOB_NODES, PCB_NODE, DEVKIT_NODE]);
      expect(top.filter((node) => !shared.has(node.name ?? '')).length).toBeGreaterThan(0);
    });

    it('moves only parts that are in the file', () => {
      const gltf = readGlb(file);
      const top = new Set(gltf.scenes[gltf.scene ?? 0].nodes.map((i) => gltf.nodes[i].name));
      for (const name of Object.keys(model.explode)) {
        expect(top.has(name), `${id}: explode names "${name}", which the file has no top-level node for`).toBe(true);
      }
    });

    it('sets aside only parts of the case that are in the file', () => {
      const gltf = readGlb(file);
      const top = new Set(gltf.scenes[gltf.scene ?? 0].nodes.map((i) => gltf.nodes[i].name));
      const device = new Set<string>([LED_NODE, ...KNOB_NODES, PCB_NODE, DEVKIT_NODE]);
      for (const name of model.loose ?? []) {
        expect(top.has(name), `${id}: loose names "${name}", which the file has no top-level node for`).toBe(true);
        expect(device.has(name), `${id}: "${name}" is the device, not a loose piece of its case`).toBe(false);
      }
    });

    it('names as its bought parts, its cover and its knob lights only what is in the file', () => {
      const gltf = readGlb(file);
      const top = new Set(gltf.scenes[gltf.scene ?? 0].nodes.map((i) => gltf.nodes[i].name));
      const materials = new Set((gltf.materials ?? []).map((m) => m.name));
      for (const name of [...(model.gear ?? []), ...(model.cover ?? [])]) {
        expect(top.has(name), `${id}: "${name}" is not a top-level node`).toBe(true);
      }
      for (const name of model.knobLights ?? []) {
        expect(materials.has(name), `${id}: no material "${name}"`).toBe(true);
      }
    });

    it('recolours only materials that are in the file', () => {
      const materials = new Set((readGlb(file).materials ?? []).map((m) => m.name));
      for (const finish of model.finishes ?? []) {
        for (const name of Object.keys(finish.looks ?? {})) {
          expect(materials.has(name), `${id}: finish ${finish.id} recolours "${name}", not in the file`).toBe(true);
        }
      }
    });

    it('prints its white parts in a white without a cast', () => {
      // White PLA reads cool or cream with the light it is photographed
      // under; the model draws the filament neutral, so the preview's light
      // decides, and a warm white read as beige (PR #3's detail review).
      const white = (readGlb(file).materials ?? []).find((m) => m.name === 'pla_white');
      if (!white) return;
      // #f4f4f2 is b* +0.96, a* −0.35; the warm #eceae4 it replaced, +3.14.
      const c = lab(white.pbrMetallicRoughness!.baseColorFactor!);
      expect(Math.abs(c.b), `${id}: pla_white b* ${c.b.toFixed(2)}`).toBeLessThan(1.5);
      expect(Math.abs(c.a), `${id}: pla_white a* ${c.a.toFixed(2)}`).toBeLessThan(1.5);
      expect(c.L).toBeGreaterThan(94);
    });

    it('uses only the Draco compression the page already decodes', () => {
      for (const ext of readGlb(file).extensionsRequired ?? []) {
        expect(['KHR_draco_mesh_compression']).toContain(ext);
      }
    });

    it('stays within its download budget', () => {
      const bytes = fs.statSync(file).size;
      if (id === 'official') {
        expect(bytes).toBeLessThanOrEqual(FIRST_LOAD_BUDGET);
        expect(bytes).toBeLessThan(OLD_MODEL_BYTES);
      } else {
        expect(bytes).toBeLessThanOrEqual(REMIX_BUDGET);
      }
    });
  });
});
