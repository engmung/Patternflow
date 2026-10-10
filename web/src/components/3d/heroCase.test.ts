import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CaseModel } from './caseModels';
import { applyFinish, disposeCase, FRAME_CENTRE, knobUnder, prepareCase } from './heroCase';

// The preview's copy of a case model, on a model made here rather than read
// from a GLB (jsdom has no WebGL, and none is needed: this is the scene graph
// and its materials). The shape is the node contract in caseModels.ts: an LED
// panel, four knobs sharing one material as every file has them, the board,
// the DevKit, and the case's own parts.

const std = (name: string, color = '#ffffff') => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  m.name = name;
  return m;
};

function cachedScene() {
  const scene = new THREE.Group();
  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, at: [number, number, number]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...at);
    scene.add(mesh);
    return mesh;
  };
  add('plate', new THREE.BoxGeometry(25, 33, 0.3), std('sheet_face', '#eef4f2'), [0, 16, 1.4]);
  add('l', new THREE.BoxGeometry(16, 32, 1.7), std('Black', '#000000'), [-4, 16, 2.5]);
  const knob = std('pla_black', '#151515');
  const cylinder = new THREE.CylinderGeometry(0.8, 0.8, 2, 16).rotateX(Math.PI / 2).translate(0, 0, 1);
  add('c1', cylinder, knob, [6.5, 29.7, 1.6]);
  add('c2', cylinder, knob, [9.6, 29.7, 1.6]);
  add('c3', cylinder, knob, [6.5, 26.6, 1.6]);
  add('c4', cylinder, knob, [9.6, 26.6, 1.6]);
  const pcb = new THREE.Group();
  pcb.name = 'pcb_v39';
  pcb.add(new THREE.Mesh(new THREE.BoxGeometry(6, 11, 0.16), std('pcb_green', '#08530f')));
  pcb.position.set(8, 25, 0.6);
  scene.add(pcb);
  const kit = new THREE.Group();
  kit.name = 'devkit';
  const esp = new THREE.Mesh(new THREE.BoxGeometry(2.6, 5.5, 0.3), std('metal.module'));
  esp.name = 'module';
  kit.add(esp);
  kit.position.set(8, 22.5, -0.8);
  scene.add(kit);
  return scene;
}

const MODEL: CaseModel = {
  id: 'simonepda-lasercut',
  url: '/cases/simonepda-lasercut/model.glb',
  explode: { c1: [0, 0, 4.2], l: [0, 0, 6] },
  finishes: [
    { id: 'acrylic', label: 'Acrylic' },
    { id: 'mdf', label: 'MDF', looks: { sheet_face: { color: '#dcc19c', roughness: 0.9 } } },
  ],
};

const meshNamed = (root: THREE.Object3D, name: string) => root.getObjectByName(name) as THREE.Mesh;
const materialOf = (root: THREE.Object3D, name: string) => meshNamed(root, name).material as THREE.MeshStandardMaterial;

describe('prepareCase', () => {
  it('works on a copy: the cached scene keeps its own materials and places', () => {
    const scene = cachedScene();
    const before = new Map<string, THREE.Material>();
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) before.set(o.name || o.parent!.name, (o as THREE.Mesh).material as THREE.Material);
    });
    const prepared = prepareCase(scene, MODEL);
    expect(prepared.root).not.toBe(scene);
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) expect((o as THREE.Mesh).material).toBe(before.get(o.name || o.parent!.name));
    });
    // Nothing the preview changes is shared with the cache.
    for (const name of ['plate', 'l', 'c1', 'module']) {
      expect(materialOf(prepared.root, name)).not.toBe(materialOf(scene, name));
    }
    expect(meshNamed(scene, 'c1').children).toHaveLength(0);
  });

  it('sorts the parts by the node contract', () => {
    const prepared = prepareCase(cachedScene(), MODEL);
    const roles = Object.fromEntries(prepared.parts.map((p) => [p.node.name, p.role]));
    expect(roles).toEqual({
      plate: 'shell',
      l: 'led',
      c1: 'knob',
      c2: 'knob',
      c3: 'knob',
      c4: 'knob',
      pcb_v39: 'pcb',
      devkit: 'devkit',
    });
    expect(prepared.parts.find((p) => p.node.name === 'c1')!.apart.toArray()).toEqual([0, 0, 4.2]);
    expect(prepared.parts.find((p) => p.node.name === 'plate')!.apart.toArray()).toEqual([0, 0, 0]);
    expect(prepared.led.map((m) => m.name)).toEqual(['l']);
  });

  it('gives each knob a material of its own, so only the held one greys', () => {
    const prepared = prepareCase(cachedScene(), MODEL);
    expect(prepared.knobs.map((k) => k.node.name)).toEqual(['c1', 'c2', 'c3', 'c4']);
    const materials = prepared.knobs.map((k) => materialOf(prepared.root, k.node.name));
    expect(new Set(materials).size).toBe(4);
    // What the preview tints is the knob's own material, and only that.
    prepared.knobs.forEach((k, i) => expect(k.tints.map((t) => t.material)).toEqual([materials[i]]));
    prepared.knobs[0].tints[0].material.color.setHex(0x666666);
    expect(materials[1].color.getHex()).toBe(0x151515);
  });

  it('finds the knob from its ring or its touch disc', () => {
    const prepared = prepareCase(cachedScene(), MODEL);
    const c3 = prepared.knobs[2];
    const disc = c3.node.getObjectByName('knob_hit')!;
    expect(knobUnder(prepared, disc)).toBe(c3);
    expect(knobUnder(prepared, c3.ring.children[0])).toBe(c3);
    expect(knobUnder(prepared, meshNamed(prepared.root, 'plate'))).toBeNull();
  });

  it('centres every case on the preview’s frame', () => {
    const prepared = prepareCase(cachedScene(), MODEL);
    const box = new THREE.Box3();
    prepared.parts.forEach((p) => box.union(p.box));
    const centre = box.getCenter(new THREE.Vector3()).add(prepared.fitPosition);
    expect(centre.distanceTo(FRAME_CENTRE)).toBeLessThan(1e-9);
    // Its width, what the preview fits across the view (buildPose.ts, fitAcross).
    expect(prepared.width).toBeCloseTo(box.max.x - box.min.x, 9);
  });

  it('draws every case at one scale: a bigger case does not shrink the panel in it', () => {
    const small = prepareCase(cachedScene(), MODEL);
    const scene = cachedScene();
    const plate = scene.getObjectByName('plate') as THREE.Mesh;
    plate.geometry = new THREE.BoxGeometry(27, 35, 0.3);
    const big = prepareCase(scene, MODEL);
    const panel = (c: typeof small) => c.parts.find((p) => p.role === 'led')!.box.getSize(new THREE.Vector3());
    expect(panel(big).toArray()).toEqual(panel(small).toArray());
    [16, 32, 1.7].forEach((size, i) => expect(panel(big).getComponent(i)).toBeCloseTo(size, 5));
    // Placing it is a move and nothing else: the copy is not scaled, and
    // there is no scale for the preview to put on it (it used to get one,
    // fitScale, that drew a bigger case smaller).
    expect(big.root.scale.toArray()).toEqual([1, 1, 1]);
    expect(Object.keys(big)).not.toContain('fitScale');
  });

  it('marks the case’s loose pieces, and only those', () => {
    const scene = cachedScene();
    const foot = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), std('sheet_face'));
    foot.name = 'foot_1';
    foot.position.set(10, 2, -2);
    scene.add(foot);
    const prepared = prepareCase(scene, { ...MODEL, loose: ['foot_1'] });
    const loose = prepared.parts.filter((p) => p.loose).map((p) => p.node.name);
    expect(loose).toEqual(['foot_1']);
    expect(prepared.parts.find((p) => p.node.name === 'foot_1')!.role).toBe('shell');
  });
});

describe('applyFinish', () => {
  it('lays a finish over the file’s look by material name, and takes it off again', () => {
    const prepared = prepareCase(cachedScene(), MODEL);
    const plate = materialOf(prepared.root, 'plate');
    const own = plate.color.getHex();
    applyFinish(prepared, MODEL.finishes![1]);
    expect(`#${plate.color.getHexString()}`).toBe('#dcc19c');
    expect(plate.roughness).toBe(0.9);
    // Only the material it names.
    expect(materialOf(prepared.root, 'c1').color.getHex()).toBe(0x151515);
    applyFinish(prepared, MODEL.finishes![0]);
    expect(plate.color.getHex()).toBe(own);
    expect(plate.roughness).toBe(0.5);
  });

  it('draws a see-through look blended, without writing depth or casting a shadow', () => {
    const prepared = prepareCase(cachedScene(), MODEL);
    applyFinish(prepared, { id: 'clear', label: 'Clear', looks: { sheet_face: { color: '#ffffff', roughness: 0.1, opacity: 0.3 } } });
    const plate = materialOf(prepared.root, 'plate');
    expect(plate.transparent).toBe(true);
    expect(plate.depthWrite).toBe(false);
    expect(meshNamed(prepared.root, 'plate').castShadow).toBe(false);
    applyFinish(prepared, undefined);
    expect(plate.transparent).toBe(false);
    expect(plate.depthWrite).toBe(true);
    expect(meshNamed(prepared.root, 'plate').castShadow).toBe(true);
  });
});

describe('disposeCase', () => {
  it('lets go of what the copy made, and not of the cached geometry', () => {
    const scene = cachedScene();
    const prepared = prepareCase(scene, MODEL);
    const knobMaterial = materialOf(prepared.root, 'c2');
    const cached = meshNamed(scene, 'plate').geometry;
    let materialGone = false;
    let geometryGone = false;
    knobMaterial.addEventListener('dispose', () => (materialGone = true));
    cached.addEventListener('dispose', () => (geometryGone = true));
    disposeCase(prepared);
    expect(materialGone).toBe(true);
    expect(geometryGone).toBe(false);
  });
});
