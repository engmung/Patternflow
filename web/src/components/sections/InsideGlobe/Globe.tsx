'use client';

import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { BufferGeometry, Float32BufferAttribute, Vector3, CanvasTexture, Quaternion } from 'three';
import type { Build } from './builds';
import { builds, latLngToVec3 } from './builds';
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

// Spiderweb of great-circle links between every pair of builds.
function ConnectionWeb() {
  const geometry = useMemo(() => {
    const radius = WEB_RADIUS;
    const points: number[] = [];

    for (let i = 0; i < builds.length; i += 1) {
      for (let j = i + 1; j < builds.length; j += 1) {
        const a = builds[i].location;
        const b = builds[j].location;
        const arc = linkArc(a.lat, a.lng, b.lat, b.lng, radius);
        // Emit as discrete segments so a single lineSegments draws them all.
        for (let k = 0; k < arc.length - 3; k += 3) {
          points.push(arc[k], arc[k + 1], arc[k + 2]);
          points.push(arc[k + 3], arc[k + 4], arc[k + 5]);
        }
      }
    }

    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    return nextGeometry;
  }, []);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={COLORS.web} transparent opacity={0.45} />
    </lineSegments>
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

  useFrame(() => {
    if (!meshRef.current) return;
    // No idle pulse! Constant base scale of 1.0, grows to 1.3x on hover, and 1.45x when selected.
    const targetScale = isSelected ? 1.45 : hovered ? 1.3 : 1.0;
    meshRef.current.scale.setScalar(targetScale);
  });

  return (
    <group position={position}>
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
        <sphereGeometry args={[PIN_RADIUS, 16, 16]} />
        <meshBasicMaterial color={isSelected ? COLORS.activePin : COLORS.pin} />
      </mesh>
    </group>
  );
}

const FRONT_DIR = new Vector3(0, 0, 1);
const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);

// Camera fit: keep the globe at roughly 70% of the smaller viewport dimension.
const VFOV_DEG = 42;
const TAN_HALF_VFOV = Math.tan((VFOV_DEG * Math.PI) / 180 / 2);
const FIT_RADIUS = 1.35;       // globe radius including markers
const FIT_FRACTION = 0.7;      // share of the limiting dimension to occupy
const FOCUS_DOLLY = 0.62;      // zoom-in factor when a build is selected
const DRAG_SPEED = 0.006;      // radians per pixel of drag

// Reusable scratch objects (module-scoped — a single globe instance).
const _yawQ = new Quaternion();
const _pitchQ = new Quaternion();
const _faceQ = new Quaternion();
const _dir = new Vector3();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function GlobeScene({ selectedBuildId, onSelectBuild }: GlobeProps) {
  const worldRef = useRef<Group>(null);
  const orientation = useRef(new Quaternion().setFromAxisAngle(AXIS_X, 0.32));
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
      const [x, y, z] = latLngToVec3(selected.location.lat, selected.location.lng, 1);
      _dir.set(x, y, z);
      _faceQ.setFromUnitVectors(_dir, FRONT_DIR);
      orientation.current.slerp(_faceQ, 0.08);
    } else if (!dragging.current) {
      // Idle auto-spin around the vertical axis (preserving the gentle tilt).
      _yawQ.setFromAxisAngle(AXIS_Y, delta * 0.18);
      orientation.current.premultiply(_yawQ);
    }
    world.quaternion.copy(orientation.current);

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
      _yawQ.setFromAxisAngle(AXIS_Y, dx * DRAG_SPEED);
      _pitchQ.setFromAxisAngle(AXIS_X, dy * DRAG_SPEED);
      orientation.current.premultiply(_yawQ).premultiply(_pitchQ);
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
      <ConnectionWeb />
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
