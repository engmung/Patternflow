'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import type { Group, InstancedMesh, LineSegments, Mesh, MeshBasicMaterial } from 'three';
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Shape,
  Vector3,
} from 'three';
import type { Build } from './builds';
import { builds, latLngToVec3, originOf } from './builds';
import type { BuildGroup } from './groups';
import type { FanObstacle } from './groups';
import { GROUP_ANGLE_DEG, angularDistance, fanAngle, fanChordPx, fanLean, fanRadiusPx, groupBuilds } from './groups';
import {
  DRIFT_SPEED,
  TURN_EASE,
  clamp,
  dotRadius,
  dragSpeed,
  easeShare,
  grownShare,
  grownVertices,
  releaseSpin,
  stepDrift,
  trackSpin,
  wrapAngle,
} from './globeMotion';
import landData from './land.json';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

const COLORS = {
  graticule: '#CFC7B4',     // faint lat/long grid — the see-through ocean
  land: '#ffffff',          // pure-white filled continents
  outline: '#141414',       // bold black coastlines
  pin: '#E8552E',           // build markers (LED orange)
  activePin: '#141414',     // the selected marker
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
// On top of the nearest-neighbour web, each build reaches once more to a
// build picked at random - so the web crosses oceans instead of clustering
// where the pins happen to be dense. Seeded from the ids, so it is the same
// web on every render and every visit rather than a shuffle on each paint.
const FAR_LINK_CHANCE = 0.6;

function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: small, deterministic, good enough for picking a handful of lines.
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every link, sampled once as a polyline of ARC_SAMPLES + 1 points. Both the
// drawn line and the dots travelling along it read from the same samples, so a
// dot can never drift off the line it is supposed to be running on. Pure maths
// over the visible entries, recomputed only when the filter changes.
const ARC_SAMPLES = 96;

// Links between each build and its few nearest builds (deduped), not a full
// mesh. Only actual builds take part: this web means "how far Patternflow has
// spread", so a collaboration, a sale or a showing joining it would overstate
// the count. Those get their own line back to where they came from.
function webArcs(entries: Build[]): number[][] {
  const built = entries.filter((build) => build.kind === 'build');
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

  // The far links: one throw of the dice per build, to any other build.
  const random = seededRandom(seedFrom(built.map((build) => build.id).join('|')));
  for (let i = 0; i < built.length && built.length > 1; i += 1) {
    if (random() > FAR_LINK_CHANCE) continue;
    let j = Math.floor(random() * (built.length - 1));
    if (j >= i) j += 1;
    edges.add(i < j ? `${i}-${j}` : `${j}-${i}`);
  }

  for (const key of edges) {
    const [i, j] = key.split('-').map(Number);
    const a = built[i].location;
    const b = built[j].location;
    arcs.push(linkArc(a.lat, a.lng, b.lat, b.lng, WEB_RADIUS, ARC_SAMPLES));
  }
  return arcs;
}

// One line from each collaboration, sale and showing back to where it came
// from. None from a pin that sits on its origin's own spot, as the showings in
// Seoul sit on the first build: that line would have no length, only its dots
// piled on the pin.
function collaborationArcs(entries: Build[]): number[][] {
  const arcs: number[][] = [];
  for (const build of entries) {
    if (build.kind === 'build') continue;
    const origin = originOf(build);
    if (!origin || !entries.some((entry) => entry.id === origin.id)) continue;
    if (angularDistance(origin.location, build.location) <= (GROUP_ANGLE_DEG * Math.PI) / 180) continue;
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


// The links themselves. Collaboration branches are drawn fainter than the web, so
// they read as something hanging off it rather than another strand of it.
//
// `grown` is the share of each link drawn so far (GlobeScene keeps it): the
// links grow out of their first pin when the map is first seen, and again
// when a filter changes them.
function LinkLines({ arcs, opacity, grown }: { arcs: number[][]; opacity: number; grown: RefObject<number> }) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    // Expand the polylines into discrete segments, so one lineSegments draws
    // every link in a single call. Every link's first segment, then every
    // link's second, and so on: a prefix of the buffer is then the same share
    // of every link, and growing them is a draw range, with nothing uploaded.
    for (let k = 0; k < ARC_SAMPLES; k += 1) {
      for (const arc of arcs) {
        const at = k * 3;
        points.push(arc[at], arc[at + 1], arc[at + 2]);
        points.push(arc[at + 3], arc[at + 4], arc[at + 5]);
      }
    }
    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    return nextGeometry;
  }, [arcs]);

  useFrame(() => {
    geometry.setDrawRange(0, grownVertices(arcs.length, ARC_SAMPLES, grown.current));
  });

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={COLORS.web} transparent opacity={opacity} />
    </lineSegments>
  );
}

const DOTS_PER_LINK = 2;
const DOT_SPEED = 0.13;    // arc lengths per second
// The dots are real geometry, unlike the point sprites they replaced — a
// PointsMaterial `size` is a pixel scale, not a world size, so its 0.026 was
// only about 2px across on screen. Their radius (globeMotion.ts) is matched
// to that, and held to a size a small screen can still draw.

// Scratch objects for the per-frame instance matrices (one globe on screen).
const _dotPos = new Vector3();
const _dotScale = new Vector3();
const _dotQuat = new Quaternion();
const _dotMatrix = new Matrix4();

// Dots running along the links, so the web reads as something live and moving
// between the builds rather than a fixed diagram. For someone who has asked
// for less motion they stand where they start, spaced along each link.
//
// Instanced spheres rather than a Points cloud: point sprites are squares held
// flat to the screen, which is invisible at rest but unmistakable once a pin is
// picked and the globe dollies in. Being round, they need no orientation — the
// rotation is left at identity and the scale is uniform.
//
// A dot waits for its link: while the links are growing (`grown`, as for
// LinkLines) a dot is drawn only once the line has reached it.
function LinkDots({
  arcs,
  opacity,
  still,
  grown,
}: {
  arcs: number[][];
  opacity: number;
  still: boolean;
  grown: RefObject<number>;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const count = arcs.length * DOTS_PER_LINK;
  // The seconds the dots have run for, counted here. The canvas's own clock
  // goes back to zero whenever the frame loop is stopped and started again
  // (Globe, below, stops it off screen), and the dots would jump back with it.
  const seconds = useRef(0);

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

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!still) seconds.current += Math.min(Math.max(delta, 0), MAX_FRAME);
    const time = still ? 0 : seconds.current;
    // The globe's scale on screen, at its centre: the camera sits on +z
    // looking at the origin (GlobeScene).
    const pxPerUnit = state.size.height / 2 / (state.camera.position.z * TAN_HALF_VFOV);
    const radius = dotRadius(pxPerUnit);
    const reach = grown.current;

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

        _dotScale.setScalar(t <= reach ? radius : 0);
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
  entries?: Build[];
  selectedBuildId?: string | null;
  onSelectBuild?: (buildId: string | null) => void;
}

// --- Pins --------------------------------------------------------------------

// The invisible sphere a pin is hovered and clicked by, in pin radii.
const HIT_SCALE = 3.6;
const HOVER_SCALE = 1.3;
const SELECTED_SCALE = 1.45;
// How fast a pin settles into a new size, and a group into open or closed
// (1/seconds). Quick, but with a tail: the pin arrives rather than snaps.
const PIN_EASE = 16;
const FAN_EASE = 13;

// A ring pin's own axis before it is turned to face out of the globe.
const PIN_UP = new Vector3(0, 0, 1);

const smoothstep = (value: number, from: number, to: number) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

// How far each mark reaches from its centre, in pin radii: the shapes below
// are drawn to it, and an open fan keeps clear of it.
const PIN_REACH: Record<Build['kind'], number> = {
  build: 1,
  collaboration: 1.77,
  sold: 1.45,
  showing: 1.6,
};

// A showing's triangle, point up. Flat in the pin's own plane like the ring,
// so a fanned-out showing, stood upright to the viewer, is the right way up.
const SHOWING_TRIANGLE = (() => {
  const reach = PIN_RADIUS * PIN_REACH.showing;
  const half = reach * Math.sin(Math.PI / 3);
  const shape = new Shape();
  shape.moveTo(0, reach);
  shape.lineTo(-half, -reach / 2);
  shape.lineTo(half, -reach / 2);
  shape.closePath();
  return shape;
})();
// One object, so a pin re-rendered on hover keeps its geometry.
const SHOWING_EXTRUDE = { depth: PIN_RADIUS * 0.8, bevelEnabled: false };

// A dot means a Patternflow exists there; a collaboration is an open ring,
// something that grew out of one; a sale is a diamond, a unit that went out
// rather than one that was built there; a showing is a triangle, a unit set
// out there for a while for people to play. Reads at a glance without a
// second colour, and survives colour-blindness.
function PinShape({ kind }: { kind: Build['kind'] }) {
  if (kind === 'collaboration') {
    return <torusGeometry args={[PIN_RADIUS * 1.35, PIN_RADIUS * 0.42, 10, 28]} />;
  }
  if (kind === 'sold') return <octahedronGeometry args={[PIN_RADIUS * PIN_REACH.sold, 0]} />;
  if (kind === 'showing') {
    return <extrudeGeometry args={[SHOWING_TRIANGLE, SHOWING_EXTRUDE]} />;
  }
  return <sphereGeometry args={[PIN_RADIUS, 16, 16]} />;
}

// The visible part of a pin: its mark, a little larger while hovered, larger
// and black while selected. No idle pulse - a pin at rest costs one comparison
// a frame. (It had an orange halo for a while; a glow smudged the flat map.)
//
// `floating` is a pin of an open group: drawn over everything, since it stands
// off the surface on its hairline and must not be cut by the globe's edge.
function PinBody({
  kind,
  hovered,
  selected,
  floating = false,
}: {
  kind: Build['kind'];
  hovered: boolean;
  selected: boolean;
  floating?: boolean;
}) {
  const bodyRef = useRef<Mesh>(null);
  const eased = useRef({ scale: 1 });

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    const now = eased.current;
    const scale = selected ? SELECTED_SCALE : hovered ? HOVER_SCALE : 1;
    if (now.scale === scale) return;

    now.scale += (scale - now.scale) * easeShare(PIN_EASE, delta);
    if (Math.abs(scale - now.scale) < 0.004) now.scale = scale;
    body.scale.setScalar(now.scale);
  });

  return (
    <mesh ref={bodyRef} renderOrder={floating ? 13 : 0}>
      <PinShape kind={kind} />
      <meshBasicMaterial
        color={selected ? COLORS.activePin : COLORS.pin}
        transparent={floating}
        depthTest={!floating}
        depthWrite={!floating}
      />
    </mesh>
  );
}

const setCursor = (cursor: string) => {
  document.body.style.cursor = cursor;
};

// The pins of an open fan, in canvas pixels: where each one is and how far
// from it a pointer still counts. They stand in front of whatever else is on
// the map there, so every other pin asks this before it takes a pointer event
// - R3F hands events to the nearest hit sphere first, and a neighbour's big
// hit sphere would otherwise swallow a fanned-out pin sitting over it.
type FanClaim = { id: string; count: number; xy: Float32Array; hitPx: number };

type PinEvent = ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>;

function fanClaims(claim: FanClaim | null, event: PinEvent): boolean {
  if (!claim) return false;
  const { offsetX, offsetY } = event.nativeEvent;
  for (let i = 0; i < claim.count; i += 1) {
    if (Math.hypot(offsetX - claim.xy[i * 2], offsetY - claim.xy[i * 2 + 1]) <= claim.hitPx) return true;
  }
  return false;
}

// Hover is a mouse thing. A finger's "hover" arrives with the tap and is
// taken away with it, which would open a group and shut it in one touch.
const isMouse = (event: ThreeEvent<PointerEvent>) => event.nativeEvent.pointerType === 'mouse';

function BuildPin({
  build,
  isSelected,
  isHovered,
  fanRef,
  onHover,
  onSelect,
}: {
  build: Build;
  isSelected: boolean;
  isHovered: boolean;
  fanRef: RefObject<FanClaim | null>;
  onHover: (buildId: string, over: boolean) => void;
  onSelect: (buildId: string | null) => void;
}) {
  const { lat, lng } = build.location;
  const position = useMemo(() => latLngToVec3(lat, lng, PIN_LAYER_RADIUS), [lat, lng]);
  // A ring is flat against the surface, so lay its axis along the normal.
  const quaternion = useMemo(
    () => new Quaternion().setFromUnitVectors(PIN_UP, new Vector3(...position).normalize()),
    [position],
  );

  // Over and move both: a pointer that came in under an open fan was not
  // ours to take then, and has to be picked up once it moves off the fan.
  const over = (event: ThreeEvent<PointerEvent>) => {
    if (fanClaims(fanRef.current, event)) return;
    event.stopPropagation();
    setCursor('pointer');
    if (isMouse(event)) onHover(build.id, true);
  };

  return (
    <group position={position} quaternion={quaternion}>
      {/* Large invisible hit-box for both easy hover and click (3.6x sensitivity) */}
      <mesh
        onPointerDown={(event) => {
          if (!fanClaims(fanRef.current, event)) event.stopPropagation();
        }}
        onPointerOver={over}
        onPointerMove={over}
        onPointerOut={() => {
          setCursor('');
          onHover(build.id, false);
        }}
        onClick={(event) => {
          if (fanClaims(fanRef.current, event)) return;
          event.stopPropagation();
          onSelect(isSelected ? null : build.id);
        }}
      >
        <sphereGeometry args={[PIN_RADIUS * HIT_SCALE, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Small, precise visible pin */}
      <PinBody kind={build.kind} hovered={isHovered} selected={isSelected} />
    </group>
  );
}

// --- Groups ------------------------------------------------------------------
//
// Builds too close to tell apart are drawn as ONE pin that says how many it
// holds: a dot with a ring around it for each build after the first, so two
// is a dot in a ring and three a dot in two. On demand it opens into a fan -
// each build its own pin on an arc above the shared point, tied by a hairline
// to where it truly is. Nothing is moved to make room: a build keeps its
// coordinates, and the hairline says the pin is standing off them.
// (The grouping rule and the fan's proportions are in groups.ts.)

// At rest: the dot is a little smaller than a lone pin, so the whole mark
// stays compact enough not to run into a neighbour (the UK and France are
// under four pin radii apart).
const GROUP_DOT = 0.72;
const GROUP_RING_FIRST = 1.28;   // radius of the first ring, in pin radii
const GROUP_RING_REACH = 1.9;    // ...and of the outermost, when there are several
const GROUP_RING_STEP = 0.56;    // between rings, while that reach allows it
const GROUP_RING_TUBE = 0.12;
// Where a build truly is, marked while its pin stands off on the fan.
const ORIGIN_DOT = 0.3;

function ringRadii(count: number): number[] {
  const rings = count - 1;
  if (rings <= 0) return [];
  const step = rings === 1
    ? 0
    : Math.min(GROUP_RING_STEP, (GROUP_RING_REACH - GROUP_RING_FIRST) / (rings - 1));
  return Array.from({ length: rings }, (_, index) => PIN_RADIUS * (GROUP_RING_FIRST + step * index));
}

// What the scene knows about the pointer, in canvas pixels. Kept by plain DOM
// listeners rather than read off R3F's raycasts: an open fan has to know the
// pointer has left it even when it has left for empty sky.
type PointerState = { x: number; y: number; inside: boolean; mouse: boolean };

// Another pin on the map, as the fan of an open group has to see it: where it
// is on the globe and how big its mark is, in world units.
type Neighbour = { id: string; at: Vector3; radius: number };

// Scratch objects for the per-frame fan layout (one globe on screen).
const _anchor = new Vector3();
const _normal = new Vector3();
const _toCamera = new Vector3();
const _slot = new Vector3();
const _inverse = new Quaternion();
const _obstaclePool: FanObstacle[] = [];
const _obstacles: FanObstacle[] = [];

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function GroupPin({
  group,
  open,
  watchPointer,
  selectedBuildId,
  hoveredId,
  worldRef,
  pointer,
  neighbours,
  fanRef,
  reducedMotion,
  onOpen,
  onLeave,
  onHover,
  onSelect,
}: {
  group: BuildGroup;
  // Open by hover, by a tap, or because one of its builds is the selected one.
  open: boolean;
  // Opened by hovering: it shuts again when the pointer leaves the fan.
  watchPointer: boolean;
  selectedBuildId: string | null;
  hoveredId: string | null;
  worldRef: RefObject<Group | null>;
  pointer: RefObject<PointerState>;
  // Every pin on the map, this group's own included.
  neighbours: Neighbour[];
  fanRef: RefObject<FanClaim | null>;
  reducedMotion: boolean;
  onOpen: (group: BuildGroup, sticky: boolean) => void;
  onLeave: (group: BuildGroup) => void;
  onHover: (buildId: string, over: boolean) => void;
  onSelect: (buildId: string | null) => void;
}) {
  const { members, center } = group;
  const count = members.length;

  const anchor = useMemo(
    () => new Vector3(...latLngToVec3(center.lat, center.lng, PIN_LAYER_RADIUS)),
    [center],
  );
  const normal = useMemo(() => anchor.clone().normalize(), [anchor]);
  const surface = useMemo(() => new Quaternion().setFromUnitVectors(PIN_UP, normal), [normal]);
  // Where each build truly is. The fan leaves from here and returns to here.
  const homes = useMemo(
    () => members.map(({ location }) => new Vector3(...latLngToVec3(location.lat, location.lng, PIN_LAYER_RADIUS))),
    [members],
  );
  const rings = useMemo(() => ringRadii(count), [count]);
  const hairlines = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 6), 3));
    return geometry;
  }, [count]);

  const amount = useRef(0);   // 0 closed … 1 fanned out
  // How far the fan is tipped over to keep clear of its neighbours: where it
  // is heading, and where it has got to.
  const lean = useRef({ target: 0, now: 0 });
  const claim = useRef<FanClaim>({ id: group.id, count, xy: new Float32Array(count * 2), hitPx: 0 });
  const restRef = useRef<Group>(null);
  const lineRef = useRef<LineSegments>(null);
  const memberRefs = useRef<(Group | null)[]>([]);
  const memberHitRefs = useRef<(Mesh | null)[]>([]);
  const originRefs = useRef<(Mesh | null)[]>([]);

  useFrame((state, delta) => {
    const world = worldRef.current;
    const rest = restRef.current;
    const line = lineRef.current;
    if (!world || !rest || !line) return;

    // A fan only stands on a point that faces the viewer. As the point nears
    // the edge of the globe the fan folds back into the one pin, so it can
    // never end up drawn across the far side.
    _anchor.copy(anchor).applyQuaternion(world.quaternion);
    _toCamera.copy(state.camera.position).sub(_anchor).normalize();
    const facing = _normal.copy(normal).applyQuaternion(world.quaternion).dot(_toCamera);
    const target = open ? smoothstep(facing, 0.02, 0.2) : 0;

    const before = amount.current;
    if (before === 0 && target === 0) {
      // Shut, and staying shut.
      if (fanRef.current === claim.current) fanRef.current = null;
      return;
    }
    let now = reducedMotion ? target : before + (target - before) * easeShare(FAN_EASE, delta);
    if (Math.abs(target - now) < 0.003) now = target;
    amount.current = now;

    // Everything about the fan is measured in pixels and turned back into
    // world units at the depth of the shared point - so it is the same size
    // on screen whether the globe is far away or dollied in on a selection.
    // The camera sits on +z looking at the origin (GlobeScene), so the screen
    // is the world's xy plane and "towards the viewer" is +z.
    const pxPerUnit =
      state.size.height / 2 / ((state.camera.position.z - _anchor.z) * TAN_HALF_VFOV);
    const pinPx = PIN_RADIUS * pxPerUnit;
    const radiusPx = fanRadiusPx(count, pinPx);
    const hitPx = fanChordPx(pinPx) / 2;
    const radius = radiusPx / pxPerUnit;
    _inverse.copy(world.quaternion).invert();
    const ax = state.size.width / 2 + _anchor.x * pxPerUnit;
    const ay = state.size.height / 2 - _anchor.y * pxPerUnit;

    // Tip the fan over if standing straight up would put a pin on a
    // neighbour. Only the pins near enough to be in the way are looked at.
    _obstacles.length = 0;
    const reach = radiusPx + pinPx * 3;
    for (const neighbour of neighbours) {
      if (neighbour.id === group.id) continue;
      _slot.copy(neighbour.at).applyQuaternion(world.quaternion);
      const x = (_slot.x - _anchor.x) * pxPerUnit;
      const y = (_slot.y - _anchor.y) * pxPerUnit;
      const r = neighbour.radius * pxPerUnit;
      if (_slot.z < 0 || Math.hypot(x, y) > reach + r) continue;
      const index = _obstacles.length;
      const obstacle = _obstaclePool[index] ?? (_obstaclePool[index] = { x: 0, y: 0, r: 0 });
      obstacle.x = x;
      obstacle.y = y;
      obstacle.r = r;
      _obstacles.push(obstacle);
    }
    const tip = lean.current;
    tip.target = fanLean(count, radiusPx, pinPx, _obstacles, tip.target);
    // A fan that is only now opening starts out already leaning the right way.
    tip.now = before === 0 || reducedMotion
      ? tip.target
      : tip.now + (tip.target - tip.now) * easeShare(FAN_EASE, delta);

    const positions = line.geometry.attributes.position;
    const taken = claim.current;
    for (let i = 0; i < count; i += 1) {
      const member = memberRefs.current[i];
      if (!member) continue;
      const angle = fanAngle(count, i, tip.now);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      taken.xy[i * 2] = ax + cos * radiusPx;
      taken.xy[i * 2 + 1] = ay - sin * radiusPx;
      _slot.set(cos * radius, sin * radius, 0).add(_anchor).applyQuaternion(_inverse);
      member.position.lerpVectors(homes[i], _slot, now);
      // Upright to the viewer, whichever way the globe is turned.
      member.quaternion.copy(_inverse);
      member.scale.setScalar(0.35 + 0.65 * now);
      member.visible = now > 0;
      positions.setXYZ(i * 2, homes[i].x, homes[i].y, homes[i].z);
      positions.setXYZ(i * 2 + 1, member.position.x, member.position.y, member.position.z);

      memberHitRefs.current[i]?.scale.setScalar(hitPx / pxPerUnit / (0.35 + 0.65 * now));
      originRefs.current[i]?.scale.setScalar(now);
    }
    positions.needsUpdate = true;
    line.visible = now > 0;
    (line.material as MeshBasicMaterial).opacity = 0.9 * now;

    // The rings draw in to the middle as the pins leave it.
    rest.scale.setScalar(1 - now);
    rest.visible = now < 1;

    // Once the pins are most of the way out, they are what a pointer there
    // means (see FanClaim).
    taken.hitPx = hitPx;
    if (open && now > 0.5) fanRef.current = taken;
    else if (fanRef.current === taken) fanRef.current = null;

    if (!open || !watchPointer) return;
    // Opened by hovering: stay open while the pointer is on the shared point
    // or anywhere along a hairline or its pin, and close once it is not.
    const at = pointer.current;
    let near = false;
    if (at.inside) {
      near = Math.hypot(at.x - ax, at.y - ay) <= pinPx * HIT_SCALE + 3;
      for (let i = 0; i < count && !near; i += 1) {
        near = distanceToSegment(at.x, at.y, ax, ay, taken.xy[i * 2], taken.xy[i * 2 + 1]) <= hitPx + 3;
      }
    }
    if (!near) onLeave(group);
  });

  // A group that leaves the map (the filter changed) takes its claim with it.
  useEffect(() => {
    const taken = claim.current;
    return () => {
      if (fanRef.current === taken) fanRef.current = null;
    };
  }, [fanRef]);

  // Over and move both, as for a lone pin: the pointer may arrive under the
  // fan of another group and only later be this pin's to take.
  const over = (event: ThreeEvent<PointerEvent>) => {
    if (fanClaims(fanRef.current, event)) return;
    event.stopPropagation();
    setCursor('pointer');
    const world = worldRef.current;
    // Not through the globe: a group on the far side is opened by a click,
    // which also brings it round.
    const towards = world
      ? _normal.copy(normal).applyQuaternion(world.quaternion).dot(event.ray.direction)
      : 0;
    if (isMouse(event) && towards < -0.05) onOpen(group, false);
  };

  return (
    <>
      {/* The one pin, flat against the surface: a dot and its rings. */}
      <group position={anchor} quaternion={surface}>
        <mesh
          onPointerDown={(event) => {
            if (!fanClaims(fanRef.current, event)) event.stopPropagation();
          }}
          onPointerOver={over}
          onPointerMove={over}
          onPointerOut={() => setCursor('')}
          onClick={(event) => {
            if (fanClaims(fanRef.current, event)) return;
            event.stopPropagation();
            onOpen(group, true);
          }}
        >
          <sphereGeometry args={[PIN_RADIUS * HIT_SCALE, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <group ref={restRef}>
          <mesh>
            <sphereGeometry args={[PIN_RADIUS * GROUP_DOT, 16, 16]} />
            <meshBasicMaterial color={COLORS.pin} />
          </mesh>
          {rings.map((radius) => (
            <mesh key={radius}>
              <torusGeometry args={[radius, PIN_RADIUS * GROUP_RING_TUBE, 8, 48]} />
              <meshBasicMaterial color={COLORS.pin} />
            </mesh>
          ))}
        </group>
      </group>

      {/* Where each build truly is, and the hairline out to its pin. */}
      {members.map((build, index) => (
        <mesh
          key={build.id}
          ref={(node) => {
            originRefs.current[index] = node;
          }}
          position={homes[index]}
          scale={0}
          renderOrder={11}
        >
          <sphereGeometry args={[PIN_RADIUS * ORIGIN_DOT, 10, 10]} />
          <meshBasicMaterial color={COLORS.pin} transparent depthTest={false} depthWrite={false} />
        </mesh>
      ))}
      <lineSegments ref={lineRef} geometry={hairlines} visible={false} frustumCulled={false} renderOrder={11}>
        <lineBasicMaterial color={COLORS.pin} transparent opacity={0} depthTest={false} depthWrite={false} />
      </lineSegments>

      {/* The builds themselves, each a pin like any other once fanned out. */}
      {members.map((build, index) => {
        const isSelected = selectedBuildId === build.id;
        return (
          <group
            key={build.id}
            ref={(node) => {
              memberRefs.current[index] = node;
            }}
            position={homes[index]}
            visible={false}
          >
            {open && (
              <mesh
                ref={(node) => {
                  memberHitRefs.current[index] = node;
                }}
                scale={PIN_RADIUS}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  if (isMouse(event)) onHover(build.id, true);
                }}
                onPointerMove={(event) => {
                  event.stopPropagation();
                  setCursor('pointer');
                }}
                onPointerOut={() => {
                  setCursor('');
                  onHover(build.id, false);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(isSelected ? null : build.id);
                }}
              >
                <sphereGeometry args={[1, 12, 12]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
            <PinBody
              kind={build.kind}
              hovered={hoveredId === build.id}
              selected={isSelected}
              floating
            />
          </group>
        );
      })}
    </>
  );
}

const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);

// Camera fit: keep the globe at roughly 70% of the smaller viewport dimension.
const VFOV_DEG = 42;
const TAN_HALF_VFOV = Math.tan((VFOV_DEG * Math.PI) / 180 / 2);
const FIT_RADIUS = 1.35;       // globe radius including markers
const FIT_FRACTION = 0.7;      // share of the limiting dimension to occupy
const FOCUS_DOLLY = 0.62;      // zoom-in factor when a build is selected
// The longest frame the motion will step by, in seconds. A tab that was in
// the background comes back with one frame minutes long. (And none is ever
// stepped backwards, should a clock be set back under the page.)
const MAX_FRAME = 0.1;

// The globe leans a degree or two towards the pointer - enough to feel that
// it has noticed, not enough to move a pin out from under it. Mouse only, and
// not at all for anyone who has asked for less motion.
const LEAN = 0.03;             // radians, at the edge of the frame

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
const _leanQ = new Quaternion();

// The yaw and pitch that bring a place round to face the camera. Yaw first
// swings it into the plane facing front, then pitch lifts it to the middle —
// which, for a point on a sphere, works out as its own latitude.
function headingTo(lat: number, lng: number): { yaw: number; pitch: number } {
  const [x, y, z] = latLngToVec3(lat, lng, 1);
  return { yaw: Math.atan2(-x, z), pitch: Math.atan2(y, Math.hypot(x, z)) };
}

// Which group is open without one of its builds being selected: `sticky` when
// it was tapped or clicked open (it stays until something else is picked),
// not sticky when the pointer is merely resting on it.
// `during` is the build that was selected when it was opened (or null): a
// group opened by hand stays open only for as long as the selection it was
// opened under stands, so picking another build closes it without an effect.
type OpenGroup = { id: string; sticky: boolean; during: string | null };

interface SceneProps extends GlobeProps {
  openGroup: OpenGroup | null;
  onOpenGroup: (next: OpenGroup | null) => void;
  // The first frame has been drawn: there is a globe to fade in.
  onDrawn: () => void;
}

function GlobeScene({
  entries = builds,
  selectedBuildId,
  onSelectBuild,
  openGroup,
  onOpenGroup,
  onDrawn,
}: SceneProps) {
  const web = useMemo(() => webArcs(entries), [entries]);
  const collaborations = useMemo(() => collaborationArcs(entries), [entries]);
  const groups = useMemo(() => groupBuilds(entries), [entries]);
  // Every pin as an open fan has to see it: where, and how big its mark is.
  const neighbours = useMemo<Neighbour[]>(
    () => groups.map(({ id, members, center }) => {
      const reach = members.length > 1
        ? (ringRadii(members.length).at(-1) ?? 0) / PIN_RADIUS + GROUP_RING_TUBE
        : PIN_REACH[members[0].kind];
      return {
        id,
        at: new Vector3(...latLngToVec3(center.lat, center.lng, PIN_LAYER_RADIUS)),
        radius: PIN_RADIUS * reach,
      };
    }),
    [groups],
  );
  const reducedMotion = useReducedMotion();
  const canvas = useThree((state) => state.gl.domElement);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const worldRef = useRef<Group>(null);
  const yaw = useRef(0);
  const pitch = useRef(INITIAL_PITCH);
  const drift = useRef(DRIFT_SPEED);
  // A drag, as the frame loop sees it: where the yaw was a frame ago, how
  // fast the hand is turning it, and how far a pixel of drag turns it now.
  const yawSeen = useRef(0);
  const spin = useRef(0);
  const turnPerPx = useRef(dragSpeed(0));
  // The links drawing on: which entries they are for, how long they have
  // been growing, and the share of each drawn (LinkLines and LinkDots read it).
  const grow = useRef({ of: entries, seconds: 0 });
  const grown = useRef(reducedMotion ? 1 : 0);
  const drawn = useRef(false);
  const lean = useRef({ x: 0, y: 0 });
  // Where a group that was tapped open is being brought round to.
  const focus = useRef<{ yaw: number; pitch: number } | null>(null);
  const dragging = useRef(false);
  const moved = useRef(0);
  const distRef = useRef(5);
  const pointer = useRef<PointerState>({ x: 0, y: 0, inside: false, mouse: false });
  const fanRef = useRef<FanClaim | null>(null);

  useEffect(() => {
    const track = (event: PointerEvent) => {
      const at = pointer.current;
      at.x = event.offsetX;
      at.y = event.offsetY;
      at.inside = true;
      at.mouse = event.pointerType === 'mouse';
    };
    const leave = () => {
      pointer.current.inside = false;
    };
    canvas.addEventListener('pointermove', track);
    canvas.addEventListener('pointerdown', track);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointercancel', leave);
    return () => {
      canvas.removeEventListener('pointermove', track);
      canvas.removeEventListener('pointerdown', track);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('pointercancel', leave);
    };
  }, [canvas]);

  const selected = selectedBuildId
    ? entries.find((build) => build.id === selectedBuildId) ?? null
    : null;
  // A selected build holds its own group open - picked from the list or
  // arrived at by URL, the fan shows which of the builds there it is.
  const selectedGroup = selected
    ? groups.find((group) => group.members.length > 1 && group.members.includes(selected)) ?? null
    : null;
  // A group opened by hand, with or without a build selected: from a selected
  // build the pointer can open another group and pick from it in one go. (It
  // used to be ignored while a build was selected, so the rings would not open.)
  const heldOpen = openGroup && openGroup.during === (selectedBuildId ?? null)
    ? groups.find((group) => group.id === openGroup.id) ?? null
    : null;
  const isOpen = (id: string) => id === selectedGroup?.id || id === heldOpen?.id;
  // A hover only counts while the pin it was on is still there to be left:
  // a pin of a fan that has since closed never reports the pointer leaving,
  // and the globe would hold still for it for good.
  const hoveredId = groups.some(({ id, members }) =>
    (members.length === 1 || isOpen(id)) && members.some((build) => build.id === hoverId))
    ? hoverId
    : null;

  useFrame((state, rawDelta) => {
    const world = worldRef.current;
    if (!world) return;
    const delta = Math.min(Math.max(rawDelta, 0), MAX_FRAME);

    if (!drawn.current) {
      drawn.current = true;
      onDrawn();
    }

    // A filter that changes the entries changes the links, and they grow out
    // again. Someone who has asked for less motion gets them whole.
    if (grow.current.of !== entries) grow.current = { of: entries, seconds: 0 };
    grow.current.seconds += delta;
    grown.current = reducedMotion ? 1 : grownShare(grow.current.seconds);

    if (!heldOpen) focus.current = null;
    // The globe holds still under a pointer that is on a pin, and while a
    // group stands open: a fan that slid away as you reached for it would be
    // no use. It picks its drift back up gradually, the way it would if it
    // had weight. Someone who has asked for less motion gets no drift at
    // all: the globe turns when they drag it, and stays where they leave it.
    //
    // A drag is followed here, a frame at a time, so that letting go can
    // hand the drift the speed the hand left it with: a flick keeps the
    // globe turning, and it runs down into the idle drift.
    const held = !!selected || !!heldOpen || !!hoveredId || dragging.current;
    if (dragging.current) spin.current = trackSpin(spin.current, yaw.current - yawSeen.current, delta);
    drift.current = stepDrift(drift.current, held, reducedMotion, delta);

    // The share of the way a picked place comes round in this frame, and the
    // camera with it. The same turn at 30, 60 and 120 Hz (globeMotion.ts).
    const turn = easeShare(TURN_EASE, delta);
    if (selected) {
      // Ease the picked location around to face the camera.
      const target = headingTo(selected.location.lat, selected.location.lng);
      yaw.current += wrapAngle(target.yaw - yaw.current) * turn;
      pitch.current += (target.pitch - pitch.current) * turn;
    } else if (focus.current) {
      const dYaw = wrapAngle(focus.current.yaw - yaw.current);
      const dPitch = clamp(focus.current.pitch, -MAX_PITCH, MAX_PITCH) - pitch.current;
      yaw.current += dYaw * turn;
      pitch.current += dPitch * turn;
      if (Math.abs(dYaw) + Math.abs(dPitch) < 0.002) focus.current = null;
    } else if (!dragging.current) {
      // Idle drift, carrying on around whatever axis the globe was left
      // tilted on — the way a desk globe keeps turning after a nudge.
      yaw.current += delta * drift.current;
    }

    // The lean towards the pointer. It rests at zero whenever a build is
    // selected, so the selected place still lands dead centre.
    const at = pointer.current;
    const leaning = at.inside && at.mouse && !selected && !reducedMotion;
    const leanX = leaning ? (at.x / state.size.width) * 2 - 1 : 0;
    const leanY = leaning ? (at.y / state.size.height) * 2 - 1 : 0;
    const share = easeShare(4, delta);
    lean.current.x += (clamp(leanX, -1, 1) * LEAN - lean.current.x) * share;
    lean.current.y += (clamp(leanY, -1, 1) * LEAN - lean.current.y) * share;

    // Yaw runs first so it spins the globe about its own (tilted) axis; the
    // lean is laid over the top, about the screen's own axes.
    _pitchQ.setFromAxisAngle(AXIS_X, pitch.current + lean.current.y);
    _yawQ.setFromAxisAngle(AXIS_Y, yaw.current);
    _leanQ.setFromAxisAngle(AXIS_Y, lean.current.x);
    world.quaternion.copy(_leanQ).multiply(_pitchQ).multiply(_yawQ);

    // A group left open that has since been dragged round the back is shut.
    if (heldOpen && !focus.current) {
      _normal
        .set(...latLngToVec3(heldOpen.center.lat, heldOpen.center.lng, 1))
        .applyQuaternion(world.quaternion);
      if (_normal.z < 0) onOpenGroup(null);
    }

    // Responsive distance so the globe fills ~70% of the smaller dimension.
    const aspect = state.size.width / Math.max(1, state.size.height);
    const limit = Math.min(1, aspect);
    const desired = clamp(FIT_RADIUS / (FIT_FRACTION * TAN_HALF_VFOV * limit), 3.4, 8.5);
    const targetDist = selected ? desired * FOCUS_DOLLY : desired;
    distRef.current += (targetDist - distRef.current) * turn;
    state.camera.position.set(0, 0, distRef.current);
    state.camera.lookAt(0, 0, 0);

    // What the next drag event will need: the globe's radius on screen, so
    // the map stays under the finger, and the yaw this frame ended on.
    const radiusPx = (GLOBE_RADIUS * state.size.height) / 2 / (distRef.current * TAN_HALF_VFOV);
    turnPerPx.current = dragSpeed(radiusPx);
    yawSeen.current = yaw.current;
  });

  // Drag to rotate (disabled while a build is focused). A near-still press is
  // treated as a click on empty globe and clears the current selection.
  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    if (selected) {
      // No turning while a build is in focus. A press on the bare globe lets
      // the selection go; a press on another pin never gets here (the pin
      // takes it), so one click goes from build to build.
      event.stopPropagation();
      onOpenGroup(null);
      onSelectBuild?.(null);
      return;
    }
    event.stopPropagation();
    dragging.current = true;
    moved.current = 0;
    focus.current = null;
    spin.current = 0;

    // The drag follows the one pointer that began it, by where that pointer
    // is. It used to add up each event's movementX, which a touch does not
    // always carry (it reads 0 in some browsers, and the globe would not
    // turn under a finger), and a second finger's events turned it too.
    const { pointerId } = event.nativeEvent;
    let lastX = event.nativeEvent.clientX;
    let lastY = event.nativeEvent.clientY;

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      const dx = move.clientX - lastX;
      const dy = move.clientY - lastY;
      lastX = move.clientX;
      lastY = move.clientY;
      moved.current += Math.abs(dx) + Math.abs(dy);
      // Sideways spins without limit; up and down stops short of the pole, so
      // the horizon stays level and north stays up no matter how far you drag.
      yaw.current += dx * turnPerPx.current;
      pitch.current = clamp(pitch.current + dy * turnPerPx.current, -MAX_PITCH, MAX_PITCH);
    };
    // A touch the browser takes back (a call, a system gesture) ends the drag
    // as letting go does. Without it the globe stayed held and never drifted
    // again.
    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dragging.current = false;
      if (moved.current < 6) {
        if (up.type === 'pointerup') {
          onOpenGroup(null);
          onSelectBuild?.(null);
        }
      } else {
        drift.current = releaseSpin(spin.current);
      }
      spin.current = 0;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const hover = (buildId: string, over: boolean) => {
    setHoverId((current) => (over ? buildId : current === buildId ? null : current));
  };
  const select = (buildId: string | null) => {
    setHoverId(null);
    onSelectBuild?.(buildId);
  };
  const open = (group: BuildGroup, sticky: boolean) => {
    if (dragging.current) return;
    if (sticky) {
      // A tap brings the group round to the middle, where there is room for
      // its fan - and where a group tapped through the far side can open.
      // Not while a build is selected: the view stays on that build until
      // another is picked.
      if (!selected) focus.current = headingTo(group.center.lat, group.center.lng);
    } else if (heldOpen?.id === group.id) {
      return;   // already open; a hover never loosens a tapped-open group
    }
    onOpenGroup({ id: group.id, sticky, during: selectedBuildId ?? null });
  };
  const leave = (group: BuildGroup) => {
    if (openGroup?.id === group.id && !openGroup.sticky) onOpenGroup(null);
  };

  return (
    <group ref={worldRef}>
      <ContinentShell />
      <ContinentOutlines />
      <GlobeWireframe />
      <LinkLines arcs={web} opacity={0.45} grown={grown} />
      <LinkLines arcs={collaborations} opacity={0.22} grown={grown} />
      <LinkDots arcs={web} opacity={0.9} still={reducedMotion} grown={grown} />
      <LinkDots arcs={collaborations} opacity={0.5} still={reducedMotion} grown={grown} />
      {groups.map((group) => {
        if (group.members.length === 1) {
          const build = group.members[0];
          return (
            <BuildPin
              key={build.id}
              build={build}
              isSelected={selectedBuildId === build.id}
              isHovered={hoveredId === build.id}
              fanRef={fanRef}
              onHover={hover}
              onSelect={select}
            />
          );
        }
        return (
          <GroupPin
            key={group.id}
            group={group}
            open={isOpen(group.id)}
            watchPointer={heldOpen?.id === group.id && !openGroup?.sticky}
            selectedBuildId={selectedBuildId ?? null}
            hoveredId={hoveredId}
            worldRef={worldRef}
            pointer={pointer}
            neighbours={neighbours}
            fanRef={fanRef}
            reducedMotion={reducedMotion}
            onOpen={open}
            onLeave={leave}
            onHover={hover}
            onSelect={select}
          />
        );
      })}

      {/* Invisible drag handle behind the markers. */}
      <mesh onPointerDown={startDrag}>
        <sphereGeometry args={[1.22, 24, 24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// Whether an element is on screen. On a phone the 3D view is not drawn at all
// until a tab opens it (display: none, globals.css), and an observer reports
// that as off screen too. True where there is no observer to ask.
function useOnScreen(ref: RefObject<Element | null>): boolean {
  const [onScreen, setOnScreen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return onScreen;
}

export default function Globe(props: GlobeProps) {
  // Held out here, beside the canvas, because a click that misses everything
  // in the scene is reported to the canvas and has to close the group too.
  const [openGroup, setOpenGroup] = useState<OpenGroup | null>(null);
  // The frame loop runs only while the globe is on screen. It ran always: a
  // phone on the home page, where the 3D view is hidden until a tab opens,
  // drew the globe 60 times a second into a canvas of no size.
  const holderRef = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(holderRef);
  // The globe fades in over its first frame, where it used to appear at once.
  const [drawn, setDrawn] = useState(false);
  const reducedMotion = useReducedMotion();
  // A selection made anywhere - a pin, the list, the address bar - takes over
  // from a group that was merely standing open, so it does not spring back
  // open when that selection is cleared.
  const selectedBuildId = props.selectedBuildId ?? null;
  const [selectionSeen, setSelectionSeen] = useState(selectedBuildId);
  if (selectionSeen !== selectedBuildId) {
    setSelectionSeen(selectedBuildId);
    if (selectedBuildId) setOpenGroup(null);
  }

  return (
    <div
      ref={holderRef}
      data-globe={drawn ? 'drawn' : 'waiting'}
      style={{
        width: '100%',
        height: '100%',
        opacity: drawn ? 1 : 0,
        transition: reducedMotion ? 'none' : 'opacity 0.5s ease',
      }}
    >
      <Canvas
        flat
        frameloop={onScreen ? 'always' : 'never'}
        camera={{ position: [0, 0, 5], fov: VFOV_DEG }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
        // Suppress native touch scroll/zoom on the canvas so a drag rotates the
        // globe instead of also scrolling the page behind it. OrbitControls does
        // this automatically in the Build/Pattern viewer; this globe rolls its own
        // drag handler, so it must opt in explicitly.
        style={{ touchAction: 'none' }}
        onPointerMissed={() => {
          setOpenGroup(null);
          props.onSelectBuild?.(null);
        }}
      >
        <GlobeScene
          {...props}
          openGroup={openGroup}
          onOpenGroup={setOpenGroup}
          onDrawn={() => setDrawn(true)}
        />
      </Canvas>
    </div>
  );
}
