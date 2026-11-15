import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LED_NODE, type CaseFinish, type CaseModel } from './caseModels';
import { FRAME_CENTRE } from './heroCase';

// A case's light model (caseModels.ts, lightUrl), made ready to be drawn: the
// device standing assembled as two nodes, `l`, the lit face of the LED panel,
// and `body`, everything else, in the full model's frame. The shelf on the
// Build tab is made of these, and one stands in for its case's full model
// until that has arrived, in the same place at the same size.
//
// As with the full models (heroCase.ts), drei keeps one parsed scene per file,
// so this works on a clone with its own materials. The body's geometry is its
// own as well: the file carries no normals, and they are worked out here.

/** Faces that meet at less than this stay one smooth surface; past it, an edge. */
const CREASE = Math.PI / 5;

interface OwnLook {
  material: THREE.MeshStandardMaterial;
  color: THREE.Color;
  roughness: number;
  opacity: number;
}

export interface PreparedLight {
  model: CaseModel;
  /** The clone, in the model's frame (one unit is 10 mm). */
  root: THREE.Group;
  /** The lit face of the LED panel: the pattern is drawn on it. */
  led: THREE.Mesh[];
  /** The full model's box, every part of it: what a case is centred and stood by. */
  box: THREE.Box3;
  /** Centres the model on FRAME_CENTRE, as the full model's fitPosition does. */
  fitPosition: THREE.Vector3;
  /** The middle of the box's underside: the point a case stands on a shelf by. */
  foot: THREE.Vector3;
  size: THREE.Vector3;
  /** The knobs' lights, k0 to k3, where the case has them (CaseModel.knobLights). */
  knobLights: THREE.MeshStandardMaterial[];
  looks: OwnLook[];
  owned: { dispose(): void }[];
}

/**
 * Makes the preview's copy of a loaded light model. `scene` is drei's cached
 * scene and is only read.
 */
export function prepareLight(scene: THREE.Object3D, model: CaseModel): PreparedLight {
  const root = scene.clone(true) as THREE.Group;
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  const owned: { dispose(): void }[] = [];
  const led: THREE.Mesh[] = [];

  const copies = new Map<THREE.Material, THREE.Material>();
  const copy = (m: THREE.Material) => {
    let c = copies.get(m);
    if (!c) {
      c = m.clone();
      copies.set(m, c);
      owned.push(c);
    }
    return c;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // The panel's node is one mesh, or a group of them when it has more than
    // one material.
    const onPanel = mesh.name === LED_NODE || mesh.parent?.name === LED_NODE;
    if (onPanel) {
      led.push(mesh);
      return;
    }
    // The file has positions only. Normals from the faces, with an edge
    // wherever two meet sharply: a printed box keeps its corners.
    mesh.geometry = toCreasedNormals(mesh.geometry, CREASE);
    owned.push(mesh.geometry);
  });

  const looks: OwnLook[] = [];
  for (const m of copies.values()) {
    const std = m as THREE.MeshStandardMaterial;
    if (!std.isMeshStandardMaterial) continue;
    // A see-through part is drawn the way a finish draws one (heroCase.ts,
    // applyFinish): blended, and not writing depth.
    std.transparent = std.opacity < 1;
    std.depthWrite = std.opacity >= 1;
    looks.push({ material: std, color: std.color.clone(), roughness: std.roughness, opacity: std.opacity });
  }

  // The full model's box, written into the file: the light one has dropped
  // parts, so its own would centre it somewhere else.
  const written = (scene.userData as { box?: { min: number[]; max: number[] } }).box;
  const box = written
    ? new THREE.Box3(new THREE.Vector3(...written.min), new THREE.Vector3(...written.max))
    : new THREE.Box3().setFromObject(root);
  const centre = box.getCenter(new THREE.Vector3());
  const fitPosition = FRAME_CENTRE.clone().sub(centre);
  const foot = new THREE.Vector3(centre.x, box.min.y, centre.z);
  const size = box.getSize(new THREE.Vector3());

  const knobLights = (model.knobLights ?? [])
    .map((name) => looks.find((look) => look.material.name === name)?.material)
    .filter((m): m is THREE.MeshStandardMaterial => !!m);

  return { model, root, led, box, fitPosition, foot, size, knobLights, looks, owned };
}

/**
 * Lays a finish over the file's own look, by material name, as applyFinish
 * does for the full model. `fade` is how much of the light model is still
 * there while its full model takes over from it: 1 all of it, 0 none.
 */
export function paintLight(light: PreparedLight, finish: CaseFinish | undefined, fade: number) {
  for (const own of light.looks) {
    const m = own.material;
    const look = finish?.looks?.[m.name];
    const opacity = (look ? (look.opacity ?? 1) : own.opacity) * fade;
    const transparent = opacity < 1;
    if (look) {
      m.color.set(look.color);
      m.roughness = look.roughness;
    } else {
      m.color.copy(own.color);
      m.roughness = own.roughness;
    }
    m.opacity = opacity;
    m.depthWrite = !transparent;
    if (m.transparent !== transparent) {
      m.transparent = transparent;
      m.needsUpdate = true;
    }
  }
}

/** Lets go of what prepareLight made; the cached scene's own geometry stays. */
export function disposeLight(light: PreparedLight) {
  light.owned.forEach((o) => o.dispose());
}
