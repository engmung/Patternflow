'use client';

import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import type { Group, InstancedMesh, Mesh } from 'three';
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import type { Build } from './builds';
import { builds, latLngToVec3, originOf } from './builds';
import landData from './land.json';

const COLORS = {
  graticule: '#CFC7B4',     // faint lat/long grid — the see-through ocean
  land: '#ffffff',          // pure-white filled continents
  outline: '#141414',       // bold black coastlines
  pin: '#E8552E',           // build markers (LED orange)
  activePin: '#141414',     // selected marker
  web: '#E8552E',           // links between builds
};

const GLOBE_RADIUS = 1.25;
const PIN_RADIUS = GLOBE_RADIUS * 0.028;
// Stacked just-above radii so each layer cleanly occludes the one beneath.
const GRID_RADIUS = GLOBE_RADIUS;
const LAND_RADIUS = GLOBE_RADIUS * 1.004;
const OUTLINE_RADIUS = GLOBE_RADIUS * 1.0055;
const PIN_LAYER_RADIUS = GLOBE_RADIUS * 1.008;
const WEB_RADIUS = GLOBE_RADIUS * 1.01;

// Natural Earth 110m land outlines: array of rings, each a flat [lng, lat, …].
const LAND_RINGS = landData as number[][];

// Slerp the direction along the great circle, but bow the radius outward so the
// link lifts off the globe in a parabolic arc (peaking at the midpoint) rather
// than hugging the surface. The further apart the points, the higher the bow.
function linkArc(
  aLat: number, aLng: number,
  bLat: number, bLng: number,
  baseRadius: number, segments = 56,
): number[] {
  const a = new Vector3(...latLngToVec3(aLat, aLng, 1));
  const b = new Vector3(...latLngToVec3(bLat, bLng, 1));
  const omega = a.angleTo(b);
  const sinOmega = Math.sin(omega);
  const lift = baseRadius * 0.65 * Math.sin(omega / 2);
  const points: number[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const dir =
      sinOmega < 1e-6
        ? a.clone()
        : a.clone().multiplyScalar(Math.sin((1 - t) * omega) / sinOmega)
            .add(b.clone().multiplyScalar(Math.sin(t * omega) / sinOmega));
    dir.normalize().multiplyScalar(baseRadius + lift * Math.sin(Math.PI * t));
    points.push(dir.x, dir.y, dir.z);
  }
  return points;
}

function GlobeWireframe() {
  const geometry = useMemo(() => {
    const points: number[] = [];
    const longitudeCount = 32;
    const latitudeCount = 16;
    const ringSegments = 96;

    const pushPoint = (lat: number, lng: number) => {
      points.push(...latLngToVec3(lat, lng, GRID_RADIUS));
    };

    for (let latIndex = 1; latIndex < latitudeCount; latIndex += 1) {
      const lat = -90 + (180 / latitudeCount) * latIndex;
      for (let segment = 0; segment < ringSegments; segment += 1) {
        const lngA = -180 + (360 / ringSegments) * segment;
        const lngB = -180 + (360 / ringSegments) * (segment + 1);
        pushPoint(lat, lngA);
        pushPoint(lat, lngB);
      }
    }

    for (let lngIndex = 0; lngIndex < longitudeCount; lngIndex += 1) {
      const lng = -180 + (360 / longitudeCount) * lngIndex;
      for (let latIndex = 0; latIndex < latitudeCount; latIndex += 1) {
        const latA = -90 + (180 / latitudeCount) * latIndex;
        const latB = -90 + (180 / latitudeCount) * (latIndex + 1);
        pushPoint(latA, lng);
        pushPoint(latB, lng);
      }
    }

    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    return nextGeometry;
  }, []);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={COLORS.graticule} transparent opacity={0.7} />
    </lineSegments>
  );
}

// White continents as a cut-out shell: the ocean texels are transparent
// (so the grid shows through, as before), while the land texels are opaque
// white and write depth — hiding the grid/markers behind them. Back-facing
// land is culled, so the far continents never tangle the view.
function ContinentShell() {
  const texture = useMemo(() => {
    const W = 2048;
    const H = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Transparent ocean.
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = COLORS.land;
    for (const ring of LAND_RINGS) {
      ctx.beginPath();
      for (let i = 0; i < ring.length; i += 2) {
        const x = ((ring[i] + 180) / 360) * W;
        const y = ((90 - ring[i + 1]) / 180) * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }

    const tex = new CanvasTexture(canvas);
    tex.anisotropy = 8;
    return tex;
  }, []);

  return (
    <mesh>
      <sphereGeometry args={[LAND_RADIUS, 96, 64]} />
      <meshBasicMaterial map={texture} transparent={false} alphaTest={0.5} />
    </mesh>
  );
}

// Bold coastlines drawn just above the white land for crisp continent edges.
function ContinentOutlines() {
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (const ring of LAND_RINGS) {
      const count = ring.length / 2;
      for (let i = 0; i < count; i += 1) {
        const next = (i + 1) % count;
        points.push(...latLngToVec3(ring[i * 2 + 1], ring[i * 2], OUTLINE_RADIUS));
        points.push(...latLngToVec3(ring[next * 2 + 1], ring[next * 2], OUTLINE_RADIUS));
      }
    }
    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    return nextGeometry;
  }, []);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={COLORS.outline} transparent opacity={0.9} />
    </lineSegments>
  );
}

// How many nearest neighbours each build links out to. Edges are shared, so a
// build can end up with more than this many lines, but never a full mesh.
const NEIGHBOURS_PER_BUILD = 3;

// Angular distance between two lat/lng points (radians), for nearest-neighbour ranking.
function angularDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = Math.PI / 180;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Every link, sampled once as a polyline of ARC_SAMPLES + 1 points. Both the
// drawn line and the dots travelling along it read from the same samples, so a
// dot can never drift off the line it is supposed to be running on. Pure maths
// over a static list, so it is computed at module load rather than per mount.
const ARC_SAMPLES = 96;

// Links between each build and its few nearest builds (deduped), not a full
// mesh. Only actual builds take part: this web means "how far Patternflow has
// spread", so a collaboration joining it would overstate the count. Those get
// their own line back to where they came from.
function webArcs(): number[][] {
  const built = builds.filter((build) => build.kind === 'build');
  const arcs: number[][] = [];

  // Collect a unique set of edges: each build reaches to its N nearest.
  const edges = new Set<string>();
  for (let i = 0; i < built.length; i += 1) {
    const nearest = built
      .map((other, j) => ({ j, dist: angularDistance(built[i].location, other.location) }))
      .filter((entry) => entry.j !== i)
      .sort((p, q) => p.dist - q.dist)
      .slice(0, NEIGHBOURS_PER_BUILD);
    for (const { j } of nearest) {
      edges.add(i < j ? `${i}-${j}` : `${j}-${i}`);
    }
  }

  for (const key of edges) {
    const [i, j] = key.split('-').map(Number);
    const a = built[i].location;
    const b = built[j].location;
    arcs.push(linkArc(a.lat, a.lng, b.lat, b.lng, WEB_RADIUS, ARC_SAMPLES));
  }
  return arcs;
}

// One line from each collaboration back to the build it grew out of.
function collaborationArcs(): number[][] {
  const arcs: number[][] = [];
  for (const build of builds) {
    if (build.kind !== 'collaboration') continue;
    const origin = originOf(build);
    if (!origin) continue;
    arcs.push(
      linkArc(
        origin.location.lat, origin.location.lng,
        build.location.lat, build.location.lng,
        WEB_RADIUS, ARC_SAMPLES,
      ),
    );
  }
  return arcs;
}

const WEB_ARCS = webArcs();
const COLLAB_ARCS = collaborationArcs();

// The links themselves. Collaboration branches are drawn fainter than the web, so
// they read as something hanging off it rather than another strand of it.
function LinkLines({ arcs, opacity }: { arcs: number[][]; opacity: number }) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (const arc of arcs) {
      // Expand the polyline into discrete segments, so one lineSegments draws
      // every link in a single call.
      for (let k = 0; k < arc.length - 3; k += 3) {
        points.push(arc[k], arc[k + 1], arc[k + 2]);
        points.push(arc[k + 3], arc[k + 4], arc[k + 5]);
      }
    }
    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    return nextGeometry;
  }, [arcs]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={COLORS.web} transparent opacity={opacity} />
    </lineSegments>
  );
}

const DOTS_PER_LINK = 2;
const DOT_SPEED = 0.13;    // arc lengths per second
// World units, against a globe of radius 1.25. Real geometry, unlike the point
// sprites this replaced — a PointsMaterial `size` is a pixel scale, not a world
// size, so its 0.026 was only about 2px across on screen. Matched to that here.
const DOT_RADIUS = 0.005;

// Scratch objects for the per-frame instance matrices (one globe on screen).
const _dotPos = new Vector3();
const _dotScale = new Vector3(DOT_RADIUS, DOT_RADIUS, DOT_RADIUS);
const _dotQuat = new Quaternion();
const _dotMatrix = new Matrix4();

// Dots running along the links, so the web reads as something live and moving
// between the builds rather than a fixed diagram.
//
// Instanced spheres rather than a Points cloud: point sprites are squares held
// flat to the screen, which is invisible at rest but unmistakable once a pin is
// picked and the globe dollies in. Being round, they need no orientation — the
// rotation is left at identity and the scale is uniform.
function LinkDots({ arcs, opacity }: { arcs: number[][]; opacity: number }) {
  const meshRef = useRef<InstancedMesh>(null);
  const count = arcs.length * DOTS_PER_LINK;

  const phases = useMemo(() => {
    const nextPhases = new Float32Array(count);
    for (let a = 0, d = 0; a < arcs.length; a += 1) {
      for (let n = 0; n < DOTS_PER_LINK; n += 1, d += 1) {
        // Spaced evenly along their own link, and each link nudged out of step
        // with the others by an irrational-ish stride, so nothing marches in
        // formation.
        nextPhases[d] = (n / DOTS_PER_LINK + a * 0.382) % 1;
      }
    }
    return nextPhases;
  }, [arcs, count]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = state.clock.elapsedTime;

    let d = 0;
    for (const arc of arcs) {
      const lastPoint = arc.length / 3 - 1;
      for (let n = 0; n < DOTS_PER_LINK; n += 1, d += 1) {
        const t = (time * DOT_SPEED + phases[d]) % 1;
        // Walk the sampled polyline rather than re-deriving the great circle:
        // 96 samples per arc is far finer than a dot's own width.
        const at = t * lastPoint;
        const step = Math.floor(at);
        const f = at - step;
        const a0 = step * 3;
        const a1 = Math.min(step + 1, lastPoint) * 3;

        _dotPos.set(
          arc[a0] + (arc[a1] - arc[a0]) * f,
          arc[a0 + 1] + (arc[a1 + 1] - arc[a0 + 1]) * f,
          arc[a0 + 2] + (arc[a1 + 2] - arc[a0 + 2]) * f,
        );

        _dotMatrix.compose(_dotPos, _dotQuat, _dotScale);
        mesh.setMatrixAt(d, _dotMatrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      // The instances are placed by hand every frame, so the base geometry's
      // bounds say nothing useful about where they actually are.
      frustumCulled={false}
    >
      {/* Unit sphere, scaled per instance. Low-poly on purpose: a couple of
          pixels across, the ten-sided silhouette reads as a circle. */}
      <sphereGeometry args={[1, 10, 6]} />
      <meshBasicMaterial color={COLORS.web} transparent opacity={opacity} depthWrite={false} />
    </instancedMesh>
  );
}

export interface GlobeProps {
  selectedBuildId?: string | null;
  onSelectBuild?: (buildId: string | null) => void;
}

function BuildPin({
  build,
  isSelected,
  onSelect,
}: {
  build: Build;
  isSelected: boolean;
  onSelect: (buildId: string | null) => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const position = latLngToVec3(build.location.lat, build.location.lng, PIN_LAYER_RADIUS);

  // A collaboration is drawn as an open ring rather than a filled dot: a dot
  // means a Patternflow exists there, a ring means something grew out of one.
  // Reads at a glance without a second colour, and survives colour-blindness.
  // The ring is flat against the surface, so lay its axis along the normal.
  const quaternion = useMemo(
    () => new Quaternion().setFromUnitVectors(PIN_UP, new Vector3(...position).normalize()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position[0], position[1], position[2]],
  );

  useFrame(() => {
    if (!meshRef.current) return;
    // No idle pulse! Constant base scale of 1.0, grows to 1.3x on hover, and 1.45x when selected.
    const targetScale = isSelected ? 1.45 : hovered ? 1.3 : 1.0;
    meshRef.current.scale.setScalar(targetScale);
  });

  return (
    <group position={position} quaternion={quaternion}>
      {/* Large invisible hit-box for both easy hover and click (3.6x sensitivity) */}
      <mesh
        onPointerDown={(event) => event.stopPropagation()}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = '';
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (isSelected) {
            onSelect(null);
          } else {
            onSelect(build.id);
          }
        }}
      >
        <sphereGeometry args={[PIN_RADIUS * 3.6, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Small, precise visible pin */}
      <mesh ref={meshRef}>
        {build.kind === 'collaboration' ? (
          <torusGeometry args={[PIN_RADIUS * 1.35, PIN_RADIUS * 0.42, 10, 28]} />
        ) : (
          <sphereGeometry args={[PIN_RADIUS, 16, 16]} />
        )}
        <meshBasicMaterial color={isSelected ? COLORS.activePin : COLORS.pin} />
      </mesh>
    </group>
  );
}

// A ring pin's own axis before it is turned to face out of the globe.
const PIN_UP = new Vector3(0, 0, 1);

const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);

// Camera fit: keep the globe at roughly 70% of the smaller viewport dimension.
const VFOV_DEG = 42;
const TAN_HALF_VFOV = Math.tan((VFOV_DEG * Math.PI) / 180 / 2);
const FIT_RADIUS = 1.35;       // globe radius including markers
const FIT_FRACTION = 0.7;      // share of the limiting dimension to occupy
const FOCUS_DOLLY = 0.62;      // zoom-in factor when a build is selected
const DRAG_SPEED = 0.006;      // radians per pixel of drag

// The globe is a turntable, not a trackball: yaw spins around the world's
// vertical axis and pitch tilts towards the viewer, and there is no third axis
// at all. Free quaternion accumulation — multiplying a world-axis rotation in
// on every drag event — quietly builds up roll, which is what lets a trackball
// end up on its side or fully inverted after enough dragging.
const INITIAL_PITCH = 0.32;
// Just short of the pole, so the axis never tips past vertical and flips. The
// northernmost pin (Narvik, 68.4°) still comes fully round to face the camera.
const MAX_PITCH = 1.31;

// Reusable scratch objects (module-scoped — a single globe instance).
const _yawQ = new Quaternion();
const _pitchQ = new Quaternion();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// The equivalent angle in (-π, π], so easing towards a heading always takes the
// short way round instead of unwinding the long way.
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

// The yaw and pitch that bring a place round to face the camera. Yaw first
// swings it into the plane facing front, then pitch lifts it to the middle —
// which, for a point on a sphere, works out as its own latitude.
function headingTo(lat: number, lng: number): { yaw: number; pitch: number } {
  const [x, y, z] = latLngToVec3(lat, lng, 1);
  return { yaw: Math.atan2(-x, z), pitch: Math.atan2(y, Math.hypot(x, z)) };
}

function GlobeScene({ selectedBuildId, onSelectBuild }: GlobeProps) {
  const worldRef = useRef<Group>(null);
  const yaw = useRef(0);
  const pitch = useRef(INITIAL_PITCH);
  const dragging = useRef(false);
  const moved = useRef(0);
  const distRef = useRef(5);

  const selected = selectedBuildId
    ? builds.find((build) => build.id === selectedBuildId) ?? null
    : null;

  useFrame((state, delta) => {
    const world = worldRef.current;
    if (!world) return;

    if (selected) {
      // Ease the picked location around to face the camera.
      const target = headingTo(selected.location.lat, selected.location.lng);
      yaw.current += wrapAngle(target.yaw - yaw.current) * 0.08;
      pitch.current += (target.pitch - pitch.current) * 0.08;
    } else if (!dragging.current) {
      // Idle drift, carrying on around whatever axis the globe was left
      // tilted on — the way a desk globe keeps turning after a nudge.
      yaw.current += delta * 0.18;
    }

    // Yaw runs first so it spins the globe about its own (tilted) axis.
    _pitchQ.setFromAxisAngle(AXIS_X, pitch.current);
    _yawQ.setFromAxisAngle(AXIS_Y, yaw.current);
    world.quaternion.copy(_pitchQ).multiply(_yawQ);

    // Responsive distance so the globe fills ~70% of the smaller dimension.
    const aspect = state.size.width / Math.max(1, state.size.height);
    const limit = Math.min(1, aspect);
    const desired = clamp(FIT_RADIUS / (FIT_FRACTION * TAN_HALF_VFOV * limit), 3.4, 8.5);
    const targetDist = selected ? desired * FOCUS_DOLLY : desired;
    distRef.current += (targetDist - distRef.current) * 0.08;
    state.camera.position.set(0, 0, distRef.current);
    state.camera.lookAt(0, 0, 0);
  });

  // Drag to rotate (disabled while a build is focused). A near-still press is
  // treated as a click on empty globe and clears the current selection.
  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    if (selected) return;
    event.stopPropagation();
    dragging.current = true;
    moved.current = 0;

    const onMove = (move: PointerEvent) => {
      const dx = move.movementX || 0;
      const dy = move.movementY || 0;
      moved.current += Math.abs(dx) + Math.abs(dy);
      // Sideways spins without limit; up and down stops short of the pole, so
      // the horizon stays level and north stays up no matter how far you drag.
      yaw.current += dx * DRAG_SPEED;
      pitch.current = clamp(pitch.current + dy * DRAG_SPEED, -MAX_PITCH, MAX_PITCH);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragging.current = false;
      if (moved.current < 6) onSelectBuild?.(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <group ref={worldRef}>
      <ContinentShell />
      <ContinentOutlines />
      <GlobeWireframe />
      <LinkLines arcs={WEB_ARCS} opacity={0.45} />
      <LinkLines arcs={COLLAB_ARCS} opacity={0.22} />
      <LinkDots arcs={WEB_ARCS} opacity={0.9} />
      <LinkDots arcs={COLLAB_ARCS} opacity={0.5} />
      {builds.map((build) => (
        <BuildPin
          key={build.id}
          build={build}
          isSelected={selectedBuildId === build.id}
          onSelect={(buildId) => onSelectBuild?.(buildId)}
        />
      ))}

      {/* Invisible drag handle behind the markers. */}
      <mesh onPointerDown={startDrag}>
        <sphereGeometry args={[1.22, 24, 24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function Globe(props: GlobeProps) {
  return (
    <Canvas
      flat
      camera={{ position: [0, 0, 5], fov: VFOV_DEG }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      // Suppress native touch scroll/zoom on the canvas so a drag rotates the
      // globe instead of also scrolling the page behind it. OrbitControls does
      // this automatically in the Build/Pattern viewer; this globe rolls its own
      // drag handler, so it must opt in explicitly.
      style={{ touchAction: 'none' }}
      onPointerMissed={() => props.onSelectBuild?.(null)}
    >
      <GlobeScene {...props} />
    </Canvas>
  );
}
