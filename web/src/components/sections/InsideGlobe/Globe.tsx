'use client';

import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Mesh } from 'three';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { Build } from './builds';
import { builds, latLngToVec3 } from './builds';

const COLORS = {
  wireframe: '#6B655A',
  pin: '#141414',
  activePin: '#E8552E',
};

const GLOBE_RADIUS = 1.25;
const PIN_RADIUS = GLOBE_RADIUS * 0.028;

function GlobeWireframe() {
  const geometry = useMemo(() => {
    const points: number[] = [];
    const longitudeCount = 32;
    const latitudeCount = 16;
    const ringSegments = 96;

    const pushPoint = (lat: number, lng: number) => {
      points.push(...latLngToVec3(lat, lng, GLOBE_RADIUS));
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
      <lineBasicMaterial color={COLORS.wireframe} transparent opacity={0.82} />
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
  const position = latLngToVec3(build.location.lat, build.location.lng, GLOBE_RADIUS);

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

function GlobeScene({ selectedBuildId, onSelectBuild }: GlobeProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  const pauseRotation = () => {
    setAutoRotate(false);
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current);
    }
    resumeTimeoutRef.current = setTimeout(() => setAutoRotate(true), 3000);
  };

  return (
    <>
      <GlobeWireframe />
      {builds.map((build) => (
        <BuildPin
          key={build.id}
          build={build}
          isSelected={selectedBuildId === build.id}
          onSelect={(buildId) => {
            pauseRotation();
            onSelectBuild?.(buildId);
          }}
        />
      ))}
      <OrbitControls
        ref={controlsRef}
        enableZoom={false}
        enablePan={false}
        autoRotate={autoRotate}
        autoRotateSpeed={0.3}
        minPolarAngle={Math.PI * 0.1}
        maxPolarAngle={Math.PI * 0.9}
        onStart={pauseRotation}
      />
    </>
  );
}

export default function Globe(props: GlobeProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.2], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      onPointerMissed={() => props.onSelectBuild?.(null)}
    >
      <GlobeScene {...props} />
    </Canvas>
  );
}
