// Puts one case's model together for the /build page's 3D preview.
//
//   node assemble.mjs official
//   node assemble.mjs <case-id> <shell.glb> <placement.json>
//
// A case model is the case itself (its "shell": every printed, cut or glued
// part) with the same Patternflow inside it, whichever case it is: the LED
// panel, the v3.9 board, the ESP32 DevKit on its sockets, and four knobs. The
// shell comes from the case's own script (besoiobiy.py, simonepda.py,
// mbchars.py; for the official case, the guide's case-v39.glb); everything
// else comes from the files the guide uses, and the official knob from the
// STL people print (lib/knob.mjs), moved to where this case holds them.
// placement.json says where that is:
//
//   {
//     "board": [dx, dy, dz],   // added to the official case's board, DevKit and knobs
//     "led": [x, y, z],        // the LED panel node's translation (z is its LED face);
//                              // left out, it stays where the official case has it
//     "ledTurn": -90,          // optional: degrees about z, anticlockwise seen from
//                              // the front, for a case that holds the panel on its side
//     "knobs": "official",     // or "shell": the shell has its own c1..c4
//     "knobBaseZ": 1.6437,     // optional: the knobs' base, when "official"
//     "knobLook": "pla_white"  // optional: the official knobs' material (pla_black)
//   }
//
// The result is written to web/public/cases/<case-id>/model.glb, Draco
// compressed like the site's other models (the page already loads the
// decoder). The board and the DevKit are simplified on the way: the preview
// shows them from a distance, through a case.
//
// The node contract the page relies on (web/src/components/3d/caseModels.ts):
//   l            the LED panel; the pattern is drawn on its front face
//   c1..c4       the knobs, origin on the encoder axis at the knob's base,
//                axis +z; named by the encoder under them, as case-v39.glb
//   pcb_v39      the board (its children keep pcb-v39.glb's names)
//   devkit       the DevKit (its "board" is renamed "devkit_board")
//   anything else is the shell: one node per part, named by the script
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, PropertyType } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { dedup, draco, mergeDocuments, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { getIO, worldBounds, fmt } from './lib/io.mjs';
import { DEVKIT_SEAT, KNOB_BASES, PCB_PLACEMENT, add3 } from './lib/frame.mjs';
import { applyLooks } from './lib/looks.mjs';
import { knobMesh } from './lib/knob.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const GUIDE = path.join(REPO, 'web/public/guide');
/** The official knob, as printed (the BOM's 20 mm shaft). */
const KNOB_STL = path.join(REPO, 'hardware/case/knobs/knobs_20mm.stl');
const OUT_DIR = path.join(REPO, 'web/public/cases');

/** How far the board and the DevKit are simplified (meshoptimizer, fraction of triangles kept, error bound relative to the mesh). */
const SIMPLIFY = {
  pcb: { ratio: 0.25, error: 0.01 },
  devkit: { ratio: 0.1, error: 0.03 },
};

const [caseId, shellArg, placementArg] = process.argv.slice(2);
if (!caseId || (caseId !== 'official' && (!shellArg || !placementArg))) {
  console.error('usage: node assemble.mjs official | node assemble.mjs <case-id> <shell.glb> <placement.json>');
  process.exit(1);
}

const io = await getIO();

async function readSimplified(file, opts) {
  const doc = await io.read(file);
  await MeshoptSimplifier.ready;
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ...opts }), dedup(), prune({ keepAttributes: true }));
  return doc;
}

/** The quaternion product a·b ([x, y, z, w]): b turned, then a. */
function mulQuat([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Moves a source document's scene roots into the target's scene; returns them by name. */
function adopt(target, source) {
  const map = mergeDocuments(target, source);
  const scene = target.getRoot().listScenes()[0];
  const roots = {};
  for (const srcScene of source.getRoot().listScenes()) {
    for (const srcNode of srcScene.listChildren()) {
      const node = map.get(srcNode);
      scene.addChild(node);
      roots[node.getName()] = node;
    }
  }
  // mergeDocuments brings the source's scenes and buffers along: drop the extra
  // scenes (their nodes now live in ours) and fold every buffer into one.
  for (const s of target.getRoot().listScenes()) if (s !== scene) s.dispose();
  const [buffer, ...rest] = target.getRoot().listBuffers();
  for (const b of rest) {
    for (const a of target.getRoot().listAccessors()) if (a.getBuffer() === b) a.setBuffer(buffer);
    b.dispose();
  }
  return roots;
}

let shellDoc;
let placement;
if (caseId === 'official') {
  // The v3.9 case, as the guide has it, without its knobs: the official knob
  // is made below from knobs_20mm.stl, on the same bases.
  shellDoc = await io.read(path.join(GUIDE, 'case-v39.glb'));
  // No "led": the panel stays exactly where the source file has it.
  placement = { board: [0, 0, 0], knobs: 'official' };
  for (const n of shellDoc.getRoot().listNodes()) {
    if (/^c[1-4]$/.test(n.getName())) n.dispose();
    else if (n.getMesh()) n.getMesh().listPrimitives().forEach((p) => p.setMaterial(null));
  }
  // The guide's case has no materials: white PLA, the same for every part.
  const pla = shellDoc.createMaterial('pla_white');
  for (const n of shellDoc.getRoot().listNodes()) n.getMesh()?.listPrimitives().forEach((p) => p.setMaterial(pla));
} else {
  shellDoc = await io.read(path.resolve(shellArg));
  placement = JSON.parse(fs.readFileSync(path.resolve(placementArg), 'utf8'));
}

const doc = new Document();
doc.createScene('Scene');
doc.createBuffer();
const shellRoots = adopt(doc, shellDoc);
const board = placement.board ?? [0, 0, 0];

// The LED panel: the old landing model's own node, moved where this case
// holds it (on the official case it stays where it was).
const ledRoots = adopt(doc, await io.read(path.join(HERE, 'source/led_panel.glb')));
if (placement.led) ledRoots.l.setTranslation(placement.led);
// Turned about its own origin, the middle of its LED face, so the turn keeps
// it where `led` puts it; the pattern on it turns with it, as on the device.
if (placement.ledTurn) {
  const half = (placement.ledTurn * Math.PI) / 360;
  ledRoots.l.setRotation(mulQuat([0, 0, Math.sin(half), Math.cos(half)], ledRoots.l.getRotation()));
}

// The knobs: the official ones, on the encoder axes of the board as placed.
// The printed knob's own profile (knobs_20mm.stl) turned round, one mesh for
// all four: case-v39.glb has the same knob as a 32-sided prism.
if (placement.knobs === 'official') {
  const knob = knobMesh(doc, KNOB_STL, doc.createMaterial(placement.knobLook ?? 'pla_black'));
  const scene = doc.getRoot().listScenes()[0];
  for (const [name, base] of Object.entries(KNOB_BASES)) {
    const t = add3(base, board);
    if (placement.knobBaseZ !== undefined) t[2] = placement.knobBaseZ;
    scene.addChild(doc.createNode(name).setMesh(knob).setTranslation(t));
  }
} else {
  for (const name of Object.keys(KNOB_BASES)) {
    if (!shellRoots[name]) throw new Error(`placement says the shell has its own knobs, but it has no "${name}"`);
  }
}

// The board and the DevKit, simplified, where this case holds them.
const pcb = adopt(doc, await readSimplified(path.join(GUIDE, 'pcb-v39.glb'), SIMPLIFY.pcb)).pcb_v39;
pcb.setTranslation(add3(PCB_PLACEMENT.translation, board)).setRotation(PCB_PLACEMENT.rotation).setScale(PCB_PLACEMENT.scale);
const kit = adopt(doc, await readSimplified(path.join(GUIDE, 'devkit.glb'), SIMPLIFY.devkit)).devkit;
kit.setTranslation(add3(DEVKIT_SEAT.translation, board)).setRotation(DEVKIT_SEAT.rotation).setScale(DEVKIT_SEAT.scale);
kit.listChildren().find((c) => c.getName() === 'board')?.setName('devkit_board');

// One look for every case's materials, by name (lib/looks.mjs).
applyLooks(doc);

await doc.transform(
  weld(),
  dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
  // Materials merge only when their names match as well: two names can share
  // a look (SimonePDA's sheet and its box are both clear acrylic as built),
  // and the page swaps looks by name (a case's finishes, caseModels.ts).
  dedup({ propertyTypes: [PropertyType.MATERIAL], keepUniqueNames: true }),
  // keepAttributes: prune() drops a UV set no texture uses, and the LED
  // panel's UVs are what the page's pattern shaders draw with.
  prune({ keepLeaves: false, keepAttributes: true }),
  draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14 }),
);
doc.createExtension(KHRDracoMeshCompression).setRequired(true);
doc.getRoot().getAsset().generator = 'patternflow tools/case-models/assemble.mjs';

const out = path.join(OUT_DIR, caseId, 'model.glb');
fs.mkdirSync(path.dirname(out), { recursive: true });
await io.write(out, doc);

// Report: size, triangles per top-level node, and the bounds.
const written = await io.read(out);
const scene = written.getRoot().listScenes()[0];
let total = 0;
const rows = [];
for (const node of scene.listChildren()) {
  let tris = 0;
  node.traverse((n) => {
    for (const p of n.getMesh()?.listPrimitives() ?? []) {
      const idx = p.getIndices();
      tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    }
  });
  total += tris;
  const b = worldBounds(node);
  rows.push(`  ${node.getName().padEnd(20)} ${String(tris).padStart(7)} tris  ${fmt(b.min)} … ${fmt(b.max)}`);
}
const all = worldBounds(scene);
console.log(`${path.relative(REPO, out)}: ${fs.statSync(out).size} bytes, ${total} triangles`);
console.log(rows.join('\n'));
console.log(`  bounds ${fmt(all.min)} … ${fmt(all.max)}`);
