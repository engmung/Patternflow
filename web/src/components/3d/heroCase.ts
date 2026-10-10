import * as THREE from 'three';
import {
  DEVKIT_NODE,
  KNOB_NODES,
  LED_NODE,
  PCB_NODE,
  type CaseFinish,
  type CaseModel,
} from './caseModels';

// The product preview's copy of a case model (caseModels.ts), made ready to
// be drawn: its parts sorted by what they are, measured, and placed so every
// case stands where the official one does, at the same scale. HeroScene animates what this
// returns; this file only builds and tears it down.
//
// drei keeps one parsed scene per GLB and hands the same one to every
// component that asks — the guide's stage among them — so nothing here
// touches it: the preview works on a deep clone, with its own materials.
// Geometry stays shared; nothing here changes a vertex.

/** What a top-level node of a case model is, by its name (caseModels.ts). */
export type PartRole = 'shell' | 'knob' | 'led' | 'pcb' | 'devkit';

export interface CasePart {
  node: THREE.Object3D;
  role: PartRole;
  /** Where it sits assembled, and its own scale, as the file has them. */
  home: THREE.Vector3;
  homeScale: THREE.Vector3;
  /**
   * A piece that comes with the case but is not on the device as it stands
   * (CaseModel.loose): drawn with the parts to make and on Assemble only.
   */
  loose: boolean;
  /** Its box, assembled, in the model's frame. */
  box: THREE.Box3;
  /** The middle of that box: a part that leaves the picture shrinks into it. */
  centre: THREE.Vector3;
  /** Where it goes when the device is drawn fully apart (CaseModel.explode), from home. */
  apart: THREE.Vector3;
  /** As drawn this frame: how far from home, and how present (0 gone, 1 there). */
  offset: THREE.Vector3;
  presence: number;
}

export interface KnobRig {
  node: THREE.Object3D;
  /** The red ring and its dot, shown while this knob is held. */
  ring: THREE.Object3D;
  /** The knob's materials and their own colours, to grey it while held. */
  tints: { material: THREE.MeshStandardMaterial; own: THREE.Color }[];
  /** From the knob's base (its origin) to its top face, along its axis (+z). */
  height: number;
}

/** A material's look as the file has it, so a finish can be laid over it and taken off again. */
interface OwnLook {
  material: THREE.MeshStandardMaterial;
  color: THREE.Color;
  roughness: number;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

export interface PreparedCase {
  model: CaseModel;
  /** The clone, in the model's frame (one unit is 10 mm). */
  root: THREE.Group;
  parts: CasePart[];
  knobs: KnobRig[];
  /** The LED panel's meshes: the pattern is drawn on them. */
  led: THREE.Mesh[];
  /** Centres the model on FRAME_CENTRE: where the model's frame sits in the preview's. */
  fitPosition: THREE.Vector3;
  /** The device's width, assembled, in model units: what the view has to fit across. */
  width: number;
  /** The board with the DevKit on it, assembled, in the model's frame. */
  board: THREE.Box3;
  looks: OwnLook[];
  /** What this copy made for itself, to let go of when it is unmounted. */
  owned: { dispose(): void }[];
}

/**
 * Where every case's device is centred, in model units: the orbit target,
 * (0, 1.7, 0), at the preview's resting scale of 0.1. Every case's box is
 * centred here, so a case swaps in exactly where the last one stood.
 */
export const FRAME_CENTRE = new THREE.Vector3(0, 17, 0);

/** The knob's ring: its radius against the knob's, and how far up the knob it sits. */
const RING_RADIUS = 1.5;
const RING_HEIGHT = 0.4;
const RING_COLOR = 0xff3333;

/**
 * What a finger or pointer can take hold of: a disc over each knob's top, a
 * little under half the 31 mm between knob axes (model units). A knob drawn
 * on a phone is a few pixels across, too small to find by touch.
 */
const KNOB_HIT_RADIUS = 1.4;

function roleOf(name: string): PartRole {
  if (name === LED_NODE) return 'led';
  if ((KNOB_NODES as readonly string[]).includes(name)) return 'knob';
  if (name === PCB_NODE) return 'pcb';
  if (name === DEVKIT_NODE) return 'devkit';
  return 'shell';
}

const meshesOf = (node: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  node.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
};

const materialsOf = (mesh: THREE.Mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/** A node's meshes' box in the node's own frame: the knob's, about its axis. */
function localBox(node: THREE.Object3D) {
  node.updateWorldMatrix(true, true);
  const toLocal = node.matrixWorld.clone().invert();
  const rel = new THREE.Matrix4();
  const box = new THREE.Box3();
  for (const mesh of meshesOf(node)) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(rel.multiplyMatrices(toLocal, mesh.matrixWorld)));
  }
  return box;
}

/**
 * Makes the preview's copy of a loaded case model. `scene` is drei's cached
 * scene and is only read.
 */
export function prepareCase(scene: THREE.Object3D, model: CaseModel): PreparedCase {
  const root = scene.clone(true) as THREE.Group;
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const owned: { dispose(): void }[] = [];

  // Every material is this copy's own: the knobs grey while held, a finish
  // recolours the case, the LED panel's is swapped for the pattern's — none
  // of which may reach the cached scene, or another case, or the guide.
  const copies = new Map<THREE.Material, THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const copy = (m: THREE.Material) => {
      let c = copies.get(m);
      if (!c) {
        c = m.clone();
        copies.set(m, c);
        owned.push(c);
      }
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  const looks: OwnLook[] = [];
  for (const m of copies.values()) {
    const std = m as THREE.MeshStandardMaterial;
    if (!std.isMeshStandardMaterial) continue;
    looks.push({
      material: std,
      color: std.color.clone(),
      roughness: std.roughness,
      opacity: std.opacity,
      transparent: std.transparent,
      depthWrite: std.depthWrite,
    });
  }

  const parts: CasePart[] = root.children.map((node) => {
    const box = new THREE.Box3().setFromObject(node);
    const apart = model.explode[node.name];
    return {
      node,
      role: roleOf(node.name),
      loose: model.loose?.includes(node.name) ?? false,
      home: node.position.clone(),
      homeScale: node.scale.clone(),
      box,
      centre: box.getCenter(new THREE.Vector3()),
      apart: apart ? new THREE.Vector3(...apart) : new THREE.Vector3(),
      offset: new THREE.Vector3(),
      presence: 1,
    };
  });

  // Every case at the one scale, only centred: the LED panel is the same part
  // in each (and the knobs, but on Besoiobiy's case, which has its own caps),
  // so it is drawn the same size, and what differs is what really does, the
  // case round it (up to 4% across the front's diagonal among the three that
  // stand upright; Besoiobiy's case is 8% wider than the official one, and
  // mbchars', lying the long way, two thirds wider). Only a view too narrow
  // for a case draws it smaller, and that is the preview's to do, by the
  // width recorded here (buildPose.ts, fitAcross).
  const device = new THREE.Box3();
  parts.forEach((p) => device.union(p.box));
  const fitPosition = FRAME_CENTRE.clone().sub(device.getCenter(new THREE.Vector3()));
  const width = device.max.x - device.min.x;

  const board = new THREE.Box3();
  parts.filter((p) => p.role === 'pcb' || p.role === 'devkit').forEach((p) => board.union(p.box));
  // A model without the board (it should not happen: assemble.mjs adds it to
  // every case) frames the device instead.
  if (board.isEmpty()) board.copy(device);

  const led = parts.filter((p) => p.role === 'led').flatMap((p) => meshesOf(p.node));

  // The ring and its dot, the same for all four knobs; and the hit discs.
  const ringMat = new THREE.MeshStandardMaterial({
    color: RING_COLOR,
    emissive: 0xff0000,
    emissiveIntensity: 2.0,
    transparent: true,
    opacity: 0.9,
  });
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitGeo = new THREE.CircleGeometry(KNOB_HIT_RADIUS, 32);
  owned.push(ringMat, hitMat, hitGeo);

  const knobs: KnobRig[] = KNOB_NODES.flatMap((name) => {
    const node = root.children.find((c) => c.name === name);
    if (!node) return [];
    const box = localBox(node);
    const radius = (box.max.x - box.min.x) / 2;
    const height = box.max.z - box.min.z;

    // A material of its own: the file's four knobs share one, and only the
    // knob being held greys. Its look is kept with the rest, so a finish
    // that names it still reaches it.
    for (const mesh of meshesOf(node)) {
      const own = (m: THREE.Material) => {
        const c = m.clone();
        owned.push(c);
        const std = c as THREE.MeshStandardMaterial;
        if (std.isMeshStandardMaterial) {
          looks.push({
            material: std,
            color: std.color.clone(),
            roughness: std.roughness,
            opacity: std.opacity,
            transparent: std.transparent,
            depthWrite: std.depthWrite,
          });
        }
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
    }

    // A ring round the knob, a little below half its height, with a bead
    // riding it: it turns with the knob, so the plain black cylinder shows
    // that it is turning. The knob's axis is its local +z, so the ring lies
    // in its xy plane as the torus is made.
    const ring = new THREE.Group();
    ring.name = 'knob-ring-group';
    ring.position.set(0, 0, box.min.z + height * RING_HEIGHT);
    const torusGeo = new THREE.TorusGeometry(radius * RING_RADIUS, radius * 0.08, 12, 48);
    const dotGeo = new THREE.SphereGeometry(radius * 0.4, 16, 16);
    owned.push(torusGeo, dotGeo);
    const torus = new THREE.Mesh(torusGeo, ringMat);
    const dot = new THREE.Mesh(dotGeo, ringMat);
    dot.position.set(radius * RING_RADIUS, 0, 0);
    ring.add(torus, dot);
    ring.visible = false;
    node.add(ring);

    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.name = 'knob_hit';
    hit.position.z = box.max.z + 0.02;
    node.add(hit);

    const tints = meshesOf(node)
      .filter((m) => m !== hit && m !== torus && m !== dot)
      .flatMap(materialsOf)
      .filter((m): m is THREE.MeshStandardMaterial => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial)
      .map((material) => ({ material, own: material.color.clone() }));
    return [{ node, ring, tints, height: box.max.z }];
  });

  return { model, root, parts, knobs, led, fitPosition, width, board, looks, owned };
}

/** The knob a pointer is on, if it is on one: the knob itself, its ring or its hit disc. */
export function knobUnder(prepared: PreparedCase, object: THREE.Object3D | null): KnobRig | null {
  for (let o = object; o; o = o.parent) {
    const rig = prepared.knobs.find((k) => k.node === o);
    if (rig) return rig;
  }
  return null;
}

/**
 * Lays a finish over the file's own look (CaseFinish.looks, by material
 * name), or takes it off again with no finish or the first. A look below full
 * opacity is drawn see-through: blended, not writing depth, so what is behind
 * it — the board under a clear acrylic box — still shows; and a see-through
 * part casts no shadow, since a clear sheet barely does.
 */
export function applyFinish(prepared: PreparedCase, finish: CaseFinish | undefined) {
  for (const own of prepared.looks) {
    const m = own.material;
    const look = finish?.looks?.[m.name];
    const wasTransparent = m.transparent;
    if (look) {
      m.color.set(look.color);
      m.roughness = look.roughness;
      const opacity = look.opacity ?? 1;
      m.opacity = opacity;
      m.transparent = opacity < 1;
      m.depthWrite = opacity >= 1;
    } else {
      m.color.copy(own.color);
      m.roughness = own.roughness;
      m.opacity = own.opacity;
      m.transparent = own.transparent;
      m.depthWrite = own.depthWrite;
    }
    if (m.transparent !== wasTransparent) m.needsUpdate = true;
  }
  for (const p of prepared.parts) {
    if (p.role !== 'shell') continue;
    for (const mesh of meshesOf(p.node)) {
      mesh.castShadow = !materialsOf(mesh).some((m) => m.transparent);
    }
  }
  // The knobs' own colour is whatever the finish left them.
  for (const k of prepared.knobs) k.tints.forEach((t) => t.own.copy(t.material.color));
}

/** Lets go of what prepareCase made; the cached scene's geometry stays. */
export function disposeCase(prepared: PreparedCase) {
  prepared.owned.forEach((o) => o.dispose());
}
