'use client';

/* eslint-disable react-hooks/immutability --
   Three.js materials and the LED matrix texture are imperative objects;
   mutating shader uniforms per-frame (and in effects) is their intended API
   and never feeds back into React rendering. */

import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import * as THREE from 'three';
import { useGLTF, ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { ledPanel, ledVert } from './patterns/common';
import patterns from './patterns';
import { useAppStore } from '@/store/useAppStore';
import { LedMatrixTexture } from './LedMatrixTexture';
import { LOGICAL_KNOB_TO_WEB_KNOB, knobUnitsPerTurn, webKnobRange } from '@/lib/pattern/controls';
import { BUILD_CASES, findCase, stepCase, writeCaseToUrl, type CaseId } from '@/components/sections/build-cases-data';
import { captureEvent } from '@/lib/posthogEvents';
import { CASE_MODELS, DRACO_DECODER, type CaseFinish } from './caseModels';
import { preloadCaseModel } from './preloadCaseModel';
import {
  FRAME_CENTRE,
  applyFinish,
  disposeCase,
  knobUnder,
  prepareCase,
  type KnobRig,
  type PreparedCase,
} from './heroCase';
import { fitAcross, poseFor, shows } from './buildPose';
import CaseFinishSwitch from './CaseFinishSwitch';
import { PageAlpha, StraightAlpha } from './canvasAlpha';
import { NeutralToeBack } from './neutralToe';
import styles from './HeroScene.module.css';

// The product preview on the Build and Pattern tabs: the device in the case
// the Build panel's switch is on (caseModels.ts), its LED panel running the
// pattern, its knobs turning the pattern's controls, and the Build panel's
// four steps acted out on it. Each case is its own model; the official one
// loads with the page, a remix's when it is picked, and until it has arrived
// the case on screen stays.

const customFragmentShader = `
uniform sampler2D uTex;
varying vec2 vUv;
${ledPanel}

void main() {
  vec2 rotatedUV = vec2(vUv.y, 1.0 - vUv.x);
  vec2 gridUV = rotatedUV * vec2(128.0, 64.0);

  // Sample discrete pixels to enforce pixelation
  vec2 pxUV = (floor(gridUV) + 0.5) / vec2(128.0, 64.0);
  vec4 texColor = texture2D(uTex, pxUV);

  vec3 col = texColor.rgb;
  float luma = dot(col, vec3(0.299, 0.587, 0.114));

  if (luma > 0.75) {
    col *= 2.35;
  } else {
    col *= 0.8;
  }

  gl_FragColor = vec4(ledPanel(col), 1.0);
}
`;

// Only the official case comes with the page; a remix's model is fetched
// when it is picked, or when its tab is hovered on the way (preloadCaseModel).
useGLTF.preload(CASE_MODELS.official.url, DRACO_DECODER);

type KnobId = 'c1' | 'c2' | 'c3' | 'c4';

// The knob meshes are named after the PCB encoder nets, and K1/K2 are
// cross-routed on the official board (see firmware config.h): the mesh at the
// physical K1 position is named "c2" and vice versa. Remap mesh name → knob id
// so the on-screen knobs behave like the physical ones.
const MESH_TO_KNOB: Record<string, KnobId> = {
  c1: 'c2',
  c2: 'c1',
  c3: 'c3',
  c4: 'c4',
};

/** Where the preview looks: OrbitControls' target, and where the device is centred. */
const TARGET = new THREE.Vector3(0, 1.7, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** The camera as the page opens: where it stands, and its vertical field of view. */
const CAMERA_POSITION: [number, number, number] = [0.0, 6.0, 10.3];
const CAMERA_FOV = 28;
/**
 * How tall the view is where the device stands, with the camera at rest, in
 * world units; times the canvas's aspect, how wide (buildPose.ts, fitAcross).
 */
const REST_VIEW_HEIGHT =
  2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * TARGET.distanceTo(new THREE.Vector3(...CAMERA_POSITION));

/**
 * Solder (step 2) shows the board alone, filling the view: the diagonal of
 * the board-and-DevKit's box, seen from the front, is drawn this many world
 * units across. The official device as a whole is 4.09 at the resting scale
 * (Besoiobiy's and SimonePDA's up to 4% more; mbchars', lying the long way
 * on its stands, 11% more, and two thirds wider).
 */
const BOARD_SPAN = 3.1;

/** A per-frame easing factor (as at 60 fps) made independent of the frame rate. */
const ease = (perFrame: number, dt: number) => 1 - Math.pow(1 - perFrame, Math.min(dt, 0.5) * 60);

/**
 * A model that would not load or draw is taken off, and whoever is told
 * shows the official case instead. Uncaught, the error would go up through
 * the canvas and take the page with it.
 */
class ModelGuard extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The cases whose models have been drawn on this page. The preview is taken
 * down while the Inside tab shows the globe; coming back, a case already in
 * drei's cache is drawn straight away rather than the official one first.
 */
const arrived = new Set<CaseId>();

/** Waits, off screen, for a picked case's model, and says when it is in drei's cache. */
function CaseLoader({ id, onReady }: { id: CaseId; onReady: (id: CaseId) => void }) {
  useGLTF(CASE_MODELS[id].url, DRACO_DECODER);
  useEffect(() => onReady(id), [id, onReady]);
  return null;
}

interface DeviceHandlers {
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
}

/**
 * One case's device: its own copy of the model, placed to stand where every
 * case stands, handed to the preview to animate.
 */
function CaseDevice({
  id,
  finish,
  deviceRef,
  handlers,
}: {
  id: CaseId;
  finish: CaseFinish | undefined;
  deviceRef: RefObject<PreparedCase | null>;
  handlers: DeviceHandlers;
}) {
  const model = CASE_MODELS[id];
  const { scene } = useGLTF(model.url, DRACO_DECODER);
  const prepared = useMemo(() => prepareCase(scene, model), [scene, model]);

  useLayoutEffect(() => {
    deviceRef.current = prepared;
    arrived.add(id);
    return () => {
      if (deviceRef.current === prepared) deviceRef.current = null;
    };
  }, [deviceRef, prepared, id]);
  useEffect(() => () => disposeCase(prepared), [prepared]);
  useEffect(() => applyFinish(prepared, finish), [prepared, finish]);

  return (
    <group position={prepared.fitPosition}>
      {/* dispose={null}: the geometry is drei's cache's; disposeCase lets go of the rest. */}
      <primitive object={prepared.root} dispose={null} {...handlers} />
    </group>
  );
}

/**
 * The device as the preview animates it, whichever case it is in: the Build
 * steps, the knobs, the pattern on the panel. It stays mounted while cases
 * swap underneath it, so a swap never restarts the sway or the pattern.
 */
function ProductPreview({
  caseId,
  finish,
  onFailed,
}: {
  caseId: CaseId;
  finish: CaseFinish | undefined;
  onFailed: (id: CaseId) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const deviceRef = useRef<PreparedCase | null>(null);
  // Where the view is centred, in the group's own frame; eased like the rest.
  const focus = useRef(FRAME_CENTRE.clone());
  const lift = useRef(0);

  const activePatternId = useAppStore((state) => state.activePatternId);
  const customJsCode = useAppStore((state) => state.customJsCode);
  const pattern = patterns[activePatternId] || patterns['patternFlowOriginal'];
  const defaults = useMemo(() => pattern.defaults || {}, [pattern]);

  const ledMatrix = useMemo(() => new LedMatrixTexture(), []);

  useEffect(() => {
    if (activePatternId === 'custom') {
      ledMatrix.loadCode(customJsCode);
    }
  }, [customJsCode, activePatternId, ledMatrix]);

  const ledMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: defaults.uSpeed ?? 1.0 },
      uParam1: { value: defaults.uParam1 ?? 0.0 },
      uParam2: { value: 0.0 },   // LOD fadeStart
      uParam3: { value: 0.29 },  // LOD fadeEnd
      uParam4: { value: defaults.uParam4 ?? 0.0 },
      uAspect: { value: 2.0 },
    },
    vertexShader: ledVert,
    fragmentShader: pattern.fragmentShader,
  }), [pattern, defaults]);
  useEffect(() => () => ledMat.dispose(), [ledMat]);

  const customMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: ledMatrix.texture },
    },
    vertexShader: ledVert,
    fragmentShader: customFragmentShader,
  }), [ledMatrix.texture]);

  const blackMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.8 }), []);

  // --- Knob Interaction Logic ---
  const drag = useRef<{ rig: KnobRig; knob: KnobId; cx: number; cy: number; lastAngle: number } | null>(null);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;

      const dx = e.clientX - d.cx;
      const dy = e.clientY - d.cy;
      // Too near the centre the angle jumps about; wait for the pointer to move out.
      if (dx * dx + dy * dy < 100) return;

      const currentAngle = Math.atan2(dy, dx);
      let deltaAngle = currentAngle - d.lastAngle;
      // Normalize deltaAngle (-PI ~ PI)
      while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
      while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
      d.lastAngle = currentAngle;

      // The knob turns about its own axis, its local +z: a clockwise drag on
      // screen (the angle growing, y pointing down) turns it clockwise as
      // seen from the front.
      d.rig.node.rotation.z -= deltaAngle;

      // Sensitivity: the same rule as the physical encoder, the whole range
      // in a set number of turns (knobUnitsPerTurn).
      const knobName = d.knob;
      const currentVal = useAppStore.getState().knobValues[knobName];
      const deltaVal = deltaAngle * (knobUnitsPerTurn(webKnobRange(knobName)) / (2 * Math.PI));

      let newVal = currentVal + deltaVal;
      if (knobName === 'c1') newVal = (newVal % 1.0 + 1.0) % 1.0; // Hue
      if (knobName === 'c2') newVal = THREE.MathUtils.clamp(newVal, 0.1, 10.0); // Speed
      if (knobName === 'c3') newVal = (newVal % 1.0 + 1.0) % 1.0; // Freq/Offset
      if (knobName === 'c4') newVal = THREE.MathUtils.clamp(newVal, 0.0, 4.9); // Mode

      useAppStore.getState().setKnobValue(knobName, newVal);
    };

    const handlePointerUp = () => {
      if (!drag.current) return;
      drag.current = null;
      useAppStore.getState().setIsDraggingKnob(false);
      useAppStore.getState().setActiveKnobId(null);
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      // Taken down mid-turn (the Inside tab swaps the preview for the globe):
      // let go, or the orbit would stay locked as if a knob were still held.
      handlePointerUp();
      document.body.style.cursor = '';
    };
  }, []);

  /**
   * The knob under the pointer, if the nearest thing there is a knob (or its
   * ring, or the disc over it a finger can find): never a knob through the
   * case, and never one the current step has put away.
   */
  const knobAt = useCallback((e: ThreeEvent<PointerEvent>) => {
    const device = deviceRef.current;
    if (!device || e.intersections[0]?.object !== e.object) return null;
    const rig = knobUnder(device, e.object);
    const part = rig && device.parts.find((p) => p.node === rig.node);
    return rig && part && part.presence > 0.5 ? rig : null;
  }, []);

  const handlers = useMemo<DeviceHandlers>(() => ({
    onPointerDown: (e) => {
      const rig = knobAt(e);
      const knob = rig && MESH_TO_KNOB[rig.node.name];
      if (!rig || !knob) return;
      e.stopPropagation(); // 드래그 중 화면 회전 방지

      // The drag turns about the centre of the knob's top face as it lies on
      // screen (the node's origin is at the knob's base). Measured against
      // the canvas's own box: the window's would be off by the page layout.
      const top = rig.node.localToWorld(new THREE.Vector3(0, 0, rig.height));
      top.project(e.camera);
      const rect = (e.nativeEvent.target as HTMLElement).getBoundingClientRect();
      const cx = (top.x * 0.5 + 0.5) * rect.width + rect.left;
      const cy = (top.y * -0.5 + 0.5) * rect.height + rect.top;
      drag.current = {
        rig,
        knob,
        cx,
        cy,
        lastAngle: Math.atan2(e.nativeEvent.clientY - cy, e.nativeEvent.clientX - cx),
      };

      useAppStore.getState().setIsDraggingKnob(true);
      useAppStore.getState().setActiveKnobId(rig.node.name as KnobId);
      // 커서를 드래그용으로 변경 (원형 회전임을 암시하기 위해 grabbing 사용)
      document.body.style.cursor = 'grabbing';
    },
    // The hand while over a knob. On every move, not on over/out: the
    // handlers sit on the device's root, so r3f reports one over and one out
    // for the device as a whole, and gliding from the case onto a knob would
    // never show it. Only the nearest hit decides; the others are behind it.
    onPointerMove: (e) => {
      if (drag.current || e.object !== e.intersections[0]?.object) return;
      document.body.style.cursor = knobAt(e) ? 'grab' : '';
    },
    onPointerOut: () => {
      if (!drag.current) document.body.style.cursor = '';
    },
  }), [knobAt]);

  const prevKnobValues = useRef(useAppStore.getState().knobValues);
  // Scratch objects for the frame loop.
  const tmp = useMemo(() => ({ box: new THREE.Box3(), part: new THREE.Box3(), v: new THREE.Vector3(), aim: new THREE.Vector3() }), []);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const { knobValues, buildStep, explode, activeKnobId } = useAppStore.getState();

    // The pattern on the panel.
    if (activePatternId === 'custom') {
      ledMatrix.render(delta, t, knobValues, prevKnobValues.current);
      prevKnobValues.current = { ...knobValues };
    } else {
      ledMat.uniforms.uTime.value = t;
      ledMat.uniforms.uParam1.value = knobValues[LOGICAL_KNOB_TO_WEB_KNOB[0]]; // Hue
      ledMat.uniforms.uSpeed.value = knobValues[LOGICAL_KNOB_TO_WEB_KNOB[1]];  // Speed
      ledMat.uniforms.uParam3.value = knobValues[LOGICAL_KNOB_TO_WEB_KNOB[2]]; // Mode
      ledMat.uniforms.uParam4.value = knobValues[LOGICAL_KNOB_TO_WEB_KNOB[3]]; // Freq/Offset
    }

    const group = groupRef.current;
    const device = deviceRef.current;
    if (!group || !device) return;

    const pose = poseFor(buildStep, explode, t);
    // A model that has just arrived starts where the step has everything,
    // not assembled and easing out from there: a swap is a cut, not a move.
    const fresh = !device.root.userData.settled;
    device.root.userData.settled = true;
    const kPart = fresh ? 1 : ease(0.08, delta);
    const kView = ease(0.05, delta);

    // The panel: the pattern while there is power, black while it is being built.
    const ledTarget = !pose.lit ? blackMat : activePatternId === 'custom' ? customMat : ledMat;
    for (const mesh of device.led) {
      if (mesh.material !== ledTarget) mesh.material = ledTarget;
    }

    // Each part eases to where this step has it: apart by its explode vector
    // times the step's spread, and present or shrunk away into the middle of
    // its own box. The aim is the middle of what will be on screen once the
    // move is done, so the framing heads for it from the first frame.
    tmp.box.makeEmpty();
    for (const p of device.parts) {
      const shown = shows(pose, p);
      tmp.v.copy(p.apart).multiplyScalar(pose.spread);
      if (shown) tmp.box.union(tmp.part.copy(p.box).translate(tmp.v));
      p.offset.lerp(tmp.v, kPart);
      p.presence = THREE.MathUtils.lerp(p.presence, shown ? 1 : 0, kPart);
      if (Math.abs(p.presence - (shown ? 1 : 0)) < 0.002) p.presence = shown ? 1 : 0;
      const s = Math.max(p.presence, 0.001);
      p.node.scale.copy(p.homeScale).multiplyScalar(s);
      // Scaled about the middle of its box, wherever the offset has taken it.
      p.node.position.copy(p.home).sub(p.centre).multiplyScalar(s).add(p.centre).add(p.offset);
      p.node.visible = p.presence > 0.01;
    }

    // The knob in hand wears its ring and goes grey.
    for (const k of device.knobs) {
      const held = activeKnobId === k.node.name;
      k.ring.visible = held;
      for (const tint of k.tints) {
        if (held) tint.material.color.setHex(0x666666); // 선택 시 회색
        else tint.material.color.copy(tint.own);
      }
    }

    // Framing. The aim, in the group's frame: the board on Solder, otherwise
    // the middle of what is shown. Every case is centred alike and drawn at
    // one scale (prepareCase), so a swap lands where the last case stood.
    if (pose.board) tmp.box.copy(device.board);
    if (tmp.box.isEmpty()) tmp.box.copy(device.board);
    tmp.box.getCenter(tmp.aim).add(device.fitPosition);
    let scale = pose.scale;
    if (pose.board) {
      const size = device.board.getSize(tmp.v);
      scale = BOARD_SPAN / Math.hypot(size.x, size.y);
    } else {
      // A device too wide for a tall view at the one scale is drawn smaller,
      // so it stays clear of the arrows (fitAcross); any other, as it is.
      scale *= fitAcross(device.width, REST_VIEW_HEIGHT * (state.size.width / state.size.height));
    }

    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, pose.turn, kView);
    const nextScale = THREE.MathUtils.lerp(group.scale.x, scale, kView);
    group.scale.setScalar(nextScale);
    focus.current.lerp(tmp.aim, kView);
    lift.current = THREE.MathUtils.lerp(lift.current, pose.lift, kView);
    // Turn and scale about the aim, which stays on the orbit target: the
    // device turns in place and the view zooms into what it is about.
    tmp.v.copy(focus.current).multiplyScalar(nextScale).applyAxisAngle(Y_AXIS, group.rotation.y);
    group.position.copy(TARGET).sub(tmp.v);
    group.position.y += lift.current;
  });

  return (
    <group ref={groupRef} scale={[0.1, 0.1, 0.1]}>
      <ModelGuard key={caseId} onError={() => onFailed(caseId)}>
        <Suspense fallback={null}>
          <CaseDevice id={caseId} finish={finish} deviceRef={deviceRef} handlers={handlers} />
        </Suspense>
      </ModelGuard>
    </group>
  );
}

const caseName = (id: CaseId) => BUILD_CASES.find((c) => c.id === id)?.tab ?? id;

export default function HeroScene() {
  const isDraggingKnob = useAppStore((state) => state.isDraggingKnob);
  const activeKnobId = useAppStore((state) => state.activeKnobId);
  const buildCase = useAppStore((state) => state.buildCase);
  const setBuildCase = useAppStore((state) => state.setBuildCase);
  const homeTab = useAppStore((state) => state.homeTab);
  const caseFinish = useAppStore((state) => state.caseFinish);
  const setCaseFinish = useAppStore((state) => state.setCaseFinish);
  const [hasInteracted, setHasInteracted] = useState(false);
  // Latch on first knob interaction — adjusting state during render (guarded)
  // avoids an extra effect-driven render pass.
  if (activeKnobId && !hasInteracted) {
    setHasInteracted(true);
  }

  // The case on screen, and the one wanted: the picked case once its model is
  // in, the official one for a case whose model would not load. While the
  // wanted one loads, the shown one stays.
  const [shown, setShown] = useState<CaseId>(() => (arrived.has(buildCase) ? buildCase : 'official'));
  const [failed, setFailed] = useState<CaseId[]>([]);
  // Picking a case whose model failed tries it again: its failure was let go
  // of in drei's cache (onFailed), so this is a fresh request. Adjusted during
  // render, guarded, like the hint's latch above.
  const [picked, setPicked] = useState(buildCase);
  if (picked !== buildCase) {
    setPicked(buildCase);
    if (failed.includes(buildCase)) setFailed(failed.filter((id) => id !== buildCase));
  }
  const wanted: CaseId = failed.includes(buildCase) ? 'official' : buildCase;
  const loading = wanted !== shown;
  const onReady = useCallback((id: CaseId) => setShown(id), []);
  const onFailed = useCallback((id: CaseId) => {
    // suspend-react keeps a failed load as a thrown error; without this, the
    // case could not load again until the page was reloaded.
    useGLTF.clear(CASE_MODELS[id].url);
    setFailed((list) => (list.includes(id) ? list : [...list, id]));
    // Back to the official case, and if that is what failed, onto it all the
    // same: its slot then draws nothing, rather than a remix staying on screen
    // under the Official tab.
    setShown((current) => (current === id || id === 'official' ? 'official' : current));
  }, []);

  const finishes = CASE_MODELS[shown].finishes ?? [];
  const finishId = caseFinish[shown] ?? finishes[0]?.id;
  const finish = finishes.find((f) => f.id === finishId);

  // Under the device: the picked case on its way, or why it is not there.
  const note = loading
    ? `Loading ${caseName(wanted)}…`
    : failed.includes(buildCase)
      ? `${caseName(buildCase)}’s model did not load`
      : null;

  // On the Build tab, arrows either side of the device step through the
  // cases, as the Inside globe's step through the builds. It is the Build
  // panel's switch from the other side: the card, the address and the model
  // follow it the same way.
  const pickCase = (id: CaseId) => {
    setBuildCase(id);
    if (window.location.pathname === '/build') writeCaseToUrl(id);
    captureEvent('build_case_selected', { case_id: id, interaction: 'click', surface: 'product_preview' });
  };

  // Over the device on the Build tab, whose case it is, in the build map's
  // label: the name on its tab of the panel's switch, and nothing else. It
  // changes with the pick, as the tab does, ahead of a model still loading
  // (the note under the device says so), and reads Official for a case whose
  // model did not load, since that is the one drawn.
  const titled = homeTab === 'build' ? findCase(wanted) : undefined;

  return (
    <div id="three-canvas" style={{ width: '100%', height: '100%', position: 'relative' }}>

      {titled && (
        <div className={styles.title}>
          <span className={styles.titleName}>{titled.tab}</span>
        </div>
      )}

      {/* 조작 안내 문구 (최초 1회 조작 시 서서히 사라짐) */}
      <div
        className={`viewer-hint${titled ? ` ${styles.hintUnderTitle}` : ''}`}
        style={{
          position: 'absolute',
          left: '0', width: '100%', textAlign: 'center',
          color: '#6B655A',
          fontFamily: 'var(--mono)',
          fontWeight: 500,
          fontSize: 'var(--pf-fs-mono)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          opacity: hasInteracted ? 0 : 1,
          transition: 'opacity 1.5s ease-in-out',
          zIndex: 10,
        }}
      >
        Rotate the knobs to explore
      </div>

      <div className={styles.note} data-on={note ? '1' : '0'} role="status" aria-live="polite">
        {note}
      </div>

      {homeTab === 'build' && BUILD_CASES.length > 1 && [-1, 1].map((step) => {
        const target = stepCase(buildCase, step);
        return (
          <button
            key={step}
            type="button"
            className={`${styles.arrow} ${step < 0 ? styles.arrowPrev : styles.arrowNext}`}
            aria-label={`${step < 0 ? 'Previous' : 'Next'} case: ${caseName(target)}`}
            onPointerEnter={() => preloadCaseModel(target)}
            onFocus={() => preloadCaseModel(target)}
            onClick={() => pickCase(target)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={step < 0 ? 'M15 4 7 12l8 8' : 'M9 4l8 8-8 8'} />
            </svg>
          </button>
        );
      })}

      {!loading && finishes.length > 1 && finishId && (
        <CaseFinishSwitch
          label={`${caseName(shown)} case material`}
          finishes={finishes}
          value={finishId}
          onChange={(id) => setCaseFinish(shown, id)}
        />
      )}

      <Canvas camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }} dpr={[1, 2]} shadows={{ type: THREE.PCFShadowMap }}>
        <ambientLight intensity={0.3} color="#fef6e8" />
        <directionalLight position={[2.3, 3.9, 6]} intensity={2.60} color="#ffffff" castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-near={0.1} shadow-camera-far={50}
          shadow-camera-left={-10} shadow-camera-right={10}
          shadow-camera-top={10} shadow-camera-bottom={-10}
          shadow-bias={-0.0005} />
        <directionalLight position={[-4, 3, 4]} intensity={0.4} color="#dde8ff" />
        <directionalLight position={[-2, 5, -6]} intensity={0.5} color="#fff4e0" />
        <pointLight position={[0, -2, 3]} intensity={0.15} color="#e8c89e" distance={15} decay={2} />
        {/* The room the reflections and the soft light come from: light
            panels made here, as on the guide's stage, not an environment map
            fetched at run time. Each faces the middle (drei aims a
            Lightformer at the origin). Neutral white, with the left panel a
            touch cool: the light has no cast of its own. */}
        <Environment resolution={256} frames={1} environmentIntensity={0.6}>
          <Lightformer form="rect" intensity={2} color="#ffffff" position={[0, 5, 5]} scale={[10, 4, 1]} />
          <Lightformer form="rect" intensity={0.8} color="#f3f6ff" position={[-6, 1, 1]} scale={[6, 5, 1]} />
          <Lightformer form="rect" intensity={0.6} color="#ffffff" position={[6, 0, 1]} scale={[6, 4, 1]} />
          <Lightformer form="rect" intensity={0.6} color="#ffffff" position={[0, 3, -7]} scale={[10, 4, 1]} />
          <Lightformer form="rect" intensity={4} color="#ffffff" position={[-4.5, 3, 5]} scale={[0.35, 6, 1]} />
          <Lightformer form="rect" intensity={3} color="#ffffff" position={[5, 2, 4.5]} scale={[0.25, 5, 1]} />
        </Environment>
        <ProductPreview caseId={shown} finish={finish} onFailed={onFailed} />
        {loading && (
          <ModelGuard key={wanted} onError={() => onFailed(wanted)}>
            <Suspense fallback={null}>
              <CaseLoader id={wanted} onReady={onReady} />
            </Suspense>
          </ModelGuard>
        )}
        <OrbitControls target={[0, 1.7, 0]} enablePan={false} enableZoom={true} enableRotate={!isDraggingKnob} />
        <ContactShadows position={[0, -2.5, 0]} opacity={0.35} scale={20} blur={2.5} far={6} color="#1a1814" />

        {/* The frame, in order: the tone curve, on each pixel's own colour
            (canvasAlpha.tsx), and the glow. The curve is Neutral's shoulder:
            its toe is given back first (neutralToe.tsx), so below the knee
            the frame is as lit — the white case the white it is drawn, a
            pure LED colour pure (patterns/common.ts holds it at the knee),
            the dark parts as dark as they are. What is brighter than that, an
            LED's white core or a highlight, is rolled off with its channels
            together, rather than one channel clipping before the others and
            leaving the rest yellow. The glow then takes what the LED shader
            runs past 2.0. */}
        <EffectComposer enableNormalPass={false}>
          <StraightAlpha />
          <NeutralToeBack />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          <PageAlpha />
          <Bloom
            luminanceThreshold={2.0}
            mipmapBlur={false}
            intensity={0.2}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
