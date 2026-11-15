'use client';

/* eslint-disable react-hooks/immutability --
   Three.js objects are imperative: the frame loop moves, scales and repaints
   them, as HeroScene's does, and none of it feeds back into React rendering. */

import { useGLTF } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import * as THREE from 'three';
import { BUILD_CASES, type CaseId } from '@/components/sections/build-cases-data';
import { CASE_MODELS, lightUrl, type CaseFinish } from './caseModels';
import { disposeLight, paintLight, prepareLight, type PreparedLight } from './lightCase';
import {
  CLEAR_SECONDS,
  FLY_SECONDS,
  HANDOFF_SECONDS,
  glide,
  planShelf,
  walk,
  type ShelfItem,
} from './shelfLayout';

// The Build tab's shelf, and the light models it is made of.
//
// Every case has two models (caseModels.ts): the full one the preview takes
// apart, 317 to 563 KB and a decoder to fetch first, and a light one of the
// same device standing assembled, 14 to 55 KB. The light ones are all here
// from the start. With the shelf open they stand on its two boards, to pick
// from. With a case picked, that case's light model goes from its place on
// the shelf to where the device stands, and stands in for the full model
// until that has arrived: the full one is then drawn in the same place, at
// the same size and turn, and the light one fades away over it. Going back
// to the shelf is the same the other way. Nothing is ever swapped for a blank.

/** What the shelf and the preview tell each other, a frame at a time. */
export interface Handoff {
  /** The shelf's: the staged case's width, in model units, once its light model is in. */
  width: number | null;
  /** The shelf's: the staged case's light model has reached the stage. */
  arrived: boolean;
  /** The shelf's: a light model that runs its case's own demo is on screen. */
  demoShown: boolean;
  /** The preview's: the full model of the staged case is the one being drawn. */
  fullShown: boolean;
}

export const newHandoff = (): Handoff => ({ width: null, arrived: false, demoShown: false, fullShown: false });

/** The cases on the shelf, in the Build panel's order: the first ones stand on the top board. */
const ORDER = BUILD_CASES.map((item) => item.id);
/** A case whose light model is not in yet is planned for at the official case's size. */
const UNMEASURED = { width: 24.7, height: 32.6, depth: 5.6 };

/** The cases on the shelf face a little to the reader's left, as the device does at rest. */
const SHELF_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.32);
/** How much a case under the pointer grows, and how far it rises, in world units. */
const HOVER_GROW = 0.06;
const HOVER_RISE = 0.05;
const HOVER_SECONDS = 0.16;

const BOARD_COLOUR = '#e9e2d2';
const SIDE_THICKNESS = 0.6;   // of a board's own thickness

interface Motion {
  /** 0 on the shelf, 1 on the stage. */
  fly: number;
  /** 0 gone, 1 there: the cases that were not picked leave, and come back. */
  here: number;
  /** 1 drawn in full, 0 faded away over the full model. */
  fade: number;
  hover: number;
}

/** A light model that would not load is left off the shelf; its case can still be picked on the panel. */
class LightGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LightModel({
  id,
  register,
  handlers,
}: {
  id: CaseId;
  register: (id: CaseId, light: PreparedLight | null) => void;
  handlers: {
    onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
    onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
    onClick?: (e: ThreeEvent<MouseEvent>) => void;
  };
}) {
  const model = CASE_MODELS[id];
  // No Draco: a light model is written with meshopt, whose decoder is in the
  // loader, so nothing else is fetched before it draws.
  const { scene } = useGLTF(lightUrl(model), false);
  const light = useMemo(() => prepareLight(scene, model), [scene, model]);

  useLayoutEffect(() => {
    register(id, light);
    return () => register(id, null);
  }, [id, light, register]);
  useEffect(() => () => disposeLight(light), [light]);

  // dispose={null}: the panel's geometry is drei's cache's; disposeLight lets go of the rest.
  return <primitive object={light.root} dispose={null} visible={false} {...handlers} />;
}

export default function CaseShelf({
  open,
  all,
  staged,
  stage,
  handoff,
  viewHeight,
  centreY,
  paint,
  finishOf,
  tags,
  hovered,
  still,
  onPick,
  onIntent,
}: {
  /** The shelf is what the view shows. */
  open: boolean;
  /**
   * Every case's light model is wanted: the view is on the tab that has the
   * shelf. Elsewhere only the staged case's is fetched, to stand in for it.
   */
  all: boolean;
  /** The case on the stage when it is not. */
  staged: CaseId;
  /** Where the device stands: the preview's own group, as it moves it. */
  stage: RefObject<THREE.Group | null>;
  handoff: RefObject<Handoff>;
  /** How tall the view is where the device stands, in world units, and where its middle is. */
  viewHeight: number;
  centreY: number;
  /** Lights a light model's panel and knobs as its full model's would be: on the shelf, or on the stage. */
  paint: (light: PreparedLight, onStage: boolean) => void;
  finishOf: (id: CaseId) => CaseFinish | undefined;
  /**
   * Each case's name: a button over the canvas (HeroScene), kept on the front
   * edge of the board the case stands on. A canvas has nothing a keyboard can
   * reach, so the buttons are how the shelf is picked from without a pointer.
   */
  tags: RefObject<Map<CaseId, HTMLElement | null>>;
  /** The case a pointer or the focus is on, whether on its model or on its name. */
  hovered: RefObject<CaseId | null>;
  /** The reader has asked for less motion: a case is on the shelf or on the stage, and never on its way. */
  still: boolean;
  onPick: (id: CaseId) => void;
  /** A pointer is on a case: its full model may as well start on its way. */
  onIntent: (id: CaseId) => void;
}) {
  const lights = useRef(new Map<CaseId, PreparedLight>());
  const motions = useRef(new Map<CaseId, Motion>());
  const before = useRef<{ open: boolean; staged: CaseId } | null>(null);
  const rack = useRef(open ? 1 : 0);

  const boardRefs = useRef<(THREE.Mesh | null)[]>([]);
  const sideRefs = useRef<(THREE.Mesh | null)[]>([]);
  const boardMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: BOARD_COLOUR, roughness: 0.82, metalness: 0 }),
    [],
  );
  useEffect(() => () => boardMaterial.dispose(), [boardMaterial]);

  const register = useMemo(
    () => (id: CaseId, light: PreparedLight | null) => {
      if (light) lights.current.set(id, light);
      else lights.current.delete(id);
    },
    [],
  );

  // A pointer's hand goes back when the shelf closes under it.
  useEffect(() => {
    if (!open) document.body.style.cursor = '';
  }, [open]);
  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  const scratch = useMemo(
    () => ({
      shelfAt: new THREE.Vector3(),
      stageAt: new THREE.Vector3(),
      offset: new THREE.Vector3(),
      stageTurn: new THREE.Quaternion(),
      tagAt: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((state, rawDelta) => {
    // With less motion asked for, every move below is over in its first frame.
    const delta = still ? Infinity : Math.min(Math.max(rawDelta, 0), 0.1);
    const group = stage.current;
    const was = before.current;
    before.current = { open, staged };

    // A case changed while the shelf is shut (the arrows, the panel's switch
    // on another tab) is a cut, as it always was: the new one is on the stage
    // at once. So is the first frame of a page that opens on a case.
    const cut = !open && (!was || (!was.open && was.staged !== staged));
    const motion = (id: CaseId) => {
      let m = motions.current.get(id);
      if (!m) {
        const onStage = !open && id === staged;
        m = { fly: onStage ? 1 : 0, here: open || onStage ? 1 : 0, fade: 1, hover: 0 };
        motions.current.set(id, m);
      }
      return m;
    };

    // The shelf, for the view as it is and the cases as they measure.
    const items: ShelfItem<CaseId>[] = ORDER.map((id) => {
      const size = lights.current.get(id)?.size;
      return size ? { id, width: size.x, height: size.y, depth: size.z } : { id, ...UNMEASURED };
    });
    const viewWidth = viewHeight * (state.size.width / Math.max(1, state.size.height));
    const plan = planShelf(items, viewWidth, viewHeight, centreY);

    // Coming back to the shelf, the boards and the other cases wait until the
    // case that was on the stage is half way home. Sooner, and it flew back
    // through cases already standing in its way.
    const homing = motions.current.get(staged)?.fly ?? 0;
    const shelfUp = open && homing < 0.5;

    rack.current = walk(rack.current, shelfUp ? 1 : 0, delta, CLEAR_SECONDS);
    const rackShare = glide(rack.current);
    boardMaterial.opacity = rackShare;
    boardMaterial.transparent = rackShare < 1;
    boardMaterial.depthWrite = rackShare >= 1;
    plan.boards.forEach((board, index) => {
      const mesh = boardRefs.current[index];
      if (!mesh) return;
      mesh.visible = rackShare > 0.01;
      mesh.position.set(0, board.y - board.thickness / 2, 0);
      mesh.scale.set(board.width, board.thickness, board.depth);
    });
    // The two sides, from under the bottom board to the top of the top one.
    const [topBoard] = plan.boards;
    const bottomBoard = plan.boards[plan.boards.length - 1];
    if (topBoard && bottomBoard) {
      const sideWidth = bottomBoard.thickness * SIDE_THICKNESS;
      const low = bottomBoard.y - bottomBoard.thickness;
      const high = topBoard.y;
      sideRefs.current.forEach((mesh, index) => {
        if (!mesh) return;
        mesh.visible = rackShare > 0.01 && plan.boards.length > 1;
        mesh.position.set((index === 0 ? -1 : 1) * (topBoard.width / 2 + sideWidth / 2), (low + high) / 2, 0);
        mesh.scale.set(sideWidth, high - low, topBoard.depth);
      });
    }

    let arrived = false;
    let demoShown = false;
    for (const id of ORDER) {
      const m = motion(id);
      const onStage = !open && id === staged;
      if (cut) {
        m.fly = onStage ? 1 : 0;
        m.here = onStage ? 1 : 0;
        m.fade = 1;
      }
      m.fly = walk(m.fly, onStage ? 1 : 0, delta, FLY_SECONDS);
      m.here = walk(m.here, shelfUp || id === staged ? 1 : 0, delta, CLEAR_SECONDS);
      // Opening the shelf, the light model is whole at once, in the place the
      // full one has just left.
      m.fade = open ? 1 : walk(m.fade, onStage && handoff.current.fullShown ? 0 : 1, delta, HANDOFF_SECONDS);
      const hot = open && hovered.current === id;
      m.hover = walk(m.hover, hot ? 1 : 0, delta, HOVER_SECONDS);
      if (onStage && m.fly >= 1) arrived = true;

      const slot = plan.slots.find((s) => s.id === id);
      const tag = tags.current.get(id);
      const board = slot && plan.boards[slot.tier];
      if (tag && slot && board) {
        // On the front edge of its board, under its case, in canvas pixels.
        scratch.tagAt.set(slot.x, slot.y - board.thickness / 2, board.depth / 2).project(state.camera);
        const x = (scratch.tagAt.x * 0.5 + 0.5) * state.size.width;
        const y = (scratch.tagAt.y * -0.5 + 0.5) * state.size.height;
        tag.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
        const mark = hot ? '1' : '0';
        if (tag.dataset.hot !== mark) tag.dataset.hot = mark;
        // Until now it sat in the frame's corner, where it takes no pointer.
        if (tag.dataset.placed !== '1') tag.dataset.placed = '1';
        // A name is up with the board it is on, not before it.
        const up = shelfUp ? '1' : '0';
        if (tag.dataset.up !== up) tag.dataset.up = up;
      }

      const light = lights.current.get(id);
      if (!light || !slot) continue;

      // On the shelf: standing on its board by the middle of its underside.
      const lift = glide(m.hover);
      const shelfScale = plan.scale * glide(m.here) * (1 + HOVER_GROW * lift);
      scratch.offset.copy(light.foot).multiplyScalar(shelfScale).applyQuaternion(SHELF_TURN);
      scratch.shelfAt.set(slot.x, slot.y + HOVER_RISE * lift, 0).sub(scratch.offset);

      // On the stage: where the preview's group has the device this frame,
      // centred as the full model is (fitPosition).
      let stageScale = shelfScale;
      scratch.stageAt.copy(scratch.shelfAt);
      scratch.stageTurn.copy(SHELF_TURN);
      if (group) {
        stageScale = group.scale.x;
        scratch.stageTurn.copy(group.quaternion);
        scratch.offset.copy(light.fitPosition).multiplyScalar(stageScale).applyQuaternion(group.quaternion);
        scratch.stageAt.copy(group.position).add(scratch.offset);
      }

      const share = glide(m.fly);
      const root = light.root;
      root.position.lerpVectors(scratch.shelfAt, scratch.stageAt, share);
      root.quaternion.slerpQuaternions(SHELF_TURN, scratch.stageTurn, share);
      root.scale.setScalar(THREE.MathUtils.lerp(shelfScale, stageScale, share));
      root.visible = m.fade > 0.01 && root.scale.x > 1e-4;
      if (!root.visible) continue;

      paintLight(light, finishOf(id), m.fade);
      paint(light, share > 0.5);
      if (light.model.demo) demoShown = true;
    }

    const h = handoff.current;
    // A light model that is not in yet holds nothing up.
    h.arrived = arrived || !lights.current.has(staged);
    h.width = lights.current.get(staged)?.size.x ?? null;
    h.demoShown = demoShown;
  });

  const handlersFor = (id: CaseId) =>
    open
      ? {
          onPointerOver: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
            hovered.current = id;
            onIntent(id);
          },
          onPointerOut: () => {
            document.body.style.cursor = '';
            if (hovered.current === id) hovered.current = null;
          },
          onClick: (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            document.body.style.cursor = '';
            hovered.current = null;
            onPick(id);
          },
        }
      : {};

  return (
    <>
      {[0, 1].map((index) => (
        <mesh
          key={`board-${index}`}
          ref={(mesh) => { boardRefs.current[index] = mesh; }}
          material={boardMaterial}
          visible={false}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
      {[0, 1].map((index) => (
        <mesh
          key={`side-${index}`}
          ref={(mesh) => { sideRefs.current[index] = mesh; }}
          material={boardMaterial}
          visible={false}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
      {ORDER.filter((id) => all || id === staged).map((id) => (
        <LightGuard key={id}>
          <Suspense fallback={null}>
            <LightModel id={id} register={register} handlers={handlersFor(id)} />
          </Suspense>
        </LightGuard>
      ))}
    </>
  );
}
