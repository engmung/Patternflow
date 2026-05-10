'use client';

import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useGLTF, ContactShadows, Environment, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { patternVert } from './patterns/common';
import patterns from './patterns';
import { useAppStore } from '@/store/useAppStore';
import { LedMatrixTexture } from './LedMatrixTexture';
import { LOGICAL_KNOB_TO_WEB_KNOB, WEB_KNOB_UNITS_PER_TURN } from '@/lib/patternflowControls';

const customFragmentShader = `
uniform sampler2D uTex;
varying vec2 vUv;

void main() {
  vec2 rotatedUV = vec2(vUv.y, 1.0 - vUv.x);
  vec2 gridUV = rotatedUV * vec2(128.0, 64.0);
  vec2 localUV = fract(gridUV);
  
  // Sample discrete pixels to enforce pixelation
  vec2 pxUV = (floor(gridUV) + 0.5) / vec2(128.0, 64.0);
  vec4 texColor = texture2D(uTex, pxUV);
  
  float dist2 = length(localUV - 0.5);
  float circle = smoothstep(0.45, 0.35, dist2);

  float fw = fwidth(vUv.x) * 128.0;
  float lodBlend = smoothstep(0.0, 0.29, fw); 
  float finalAlpha = mix(circle, 1.0, lodBlend);
  
  vec3 col = texColor.rgb;
  float luma = dot(col, vec3(0.299, 0.587, 0.114));

  if (luma > 0.75) {
    col *= 2.35;
  } else {
    col *= 0.8;
  }
  
  float unlit = 0.02;
  col = mix(vec3(unlit), col, step(0.01, length(col)));

  gl_FragColor = vec4(col * finalAlpha, 1.0);
}
`;

useGLTF.preload('/3dforweb.glb');

// Removed hardcoded ACTIVE_PATTERN

function Model() {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/3dforweb.glb', 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  const activeSection = useAppStore((state) => state.activeSection);
  const knobValues = useAppStore((state) => state.knobValues);
  const buildStep = useAppStore((state) => state.buildStep);
  const isExploded = useAppStore((state) => state.isExploded);

  const partsRef = useRef<{
    top: THREE.Mesh[];
    mid: THREE.Mesh[];
    bot: THREE.Mesh[];
    pcb: THREE.Mesh[];
    led: THREE.Mesh[];
    knobs: THREE.Mesh[];
    others: THREE.Mesh[];
  }>({
    top: [], mid: [], bot: [], pcb: [], led: [], knobs: [], others: []
  });

  const activePatternId = useAppStore((state) => state.activePatternId);
  const customJsCode = useAppStore((state) => state.customJsCode);
  const pattern = patterns[activePatternId] || patterns['patternFlowOriginal'];
  const defaults = pattern.defaults || {};

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
    vertexShader: patternVert,
    fragmentShader: pattern.fragmentShader,
  }), [pattern, defaults]);

  const customMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: ledMatrix.texture },
    },
    vertexShader: patternVert,
    fragmentShader: customFragmentShader,
  }), [ledMatrix.texture]);

  const blackMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.8 }), []);

  useEffect(() => {
    const isPoweredOff = buildStep === 1 || buildStep === 2 || buildStep === 3;
    const targetMat = isPoweredOff ? blackMat : (activePatternId === 'custom' ? customMat : ledMat);
    partsRef.current.led.forEach(m => {
      m.material = targetMat;
    });
  }, [activePatternId, ledMat, customMat, blackMat, buildStep]);

  useEffect(() => {
    ledMat.uniforms.uParam1.value = knobValues[LOGICAL_KNOB_TO_WEB_KNOB[0]]; // Hue
    ledMat.uniforms.uSpeed.value = knobValues[LOGICAL_KNOB_TO_WEB_KNOB[1]];  // Speed
    ledMat.uniforms.uParam3.value = knobValues[LOGICAL_KNOB_TO_WEB_KNOB[2]]; // Mode
    ledMat.uniforms.uParam4.value = knobValues[LOGICAL_KNOB_TO_WEB_KNOB[3]]; // Freq/Offset
  }, [knobValues, ledMat]);

  // --- Knob Interaction Logic ---
  const activeKnobRef = useRef<THREE.Mesh | null>(null);
  const lastMouseAngle = useRef<number>(0);
  const knobCenterScreen = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!activeKnobRef.current) return;
      
      const dx = e.clientX - knobCenterScreen.current.x;
      const dy = e.clientY - knobCenterScreen.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // 중심점에 너무 가깝게 클릭/드래그하면 각도가 급격하게 튀는 현상 방지
      if (distance < 10) return;

      const currentAngle = Math.atan2(dy, dx);
      let deltaAngle = currentAngle - lastMouseAngle.current;
      
      // Normalize deltaAngle (-PI ~ PI)
      while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
      while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
      
      lastMouseAngle.current = currentAngle;
      
      const knobName = activeKnobRef.current.name as 'c1' | 'c2' | 'c3' | 'c4';
      
      // 노브 시각적 회전 (시계방향 마우스 회전 시 3D 모델도 시계방향 회전)
      activeKnobRef.current.rotation.y -= deltaAngle; 
      
      let currentVal = useAppStore.getState().knobValues[knobName];
      let deltaVal = 0;
      
      // 회전 민감도 (1바퀴(2*PI) 돌릴 때 변하는 값)
      deltaVal = deltaAngle * (WEB_KNOB_UNITS_PER_TURN[knobName] / (2 * Math.PI));
      
      let newVal = currentVal + deltaVal;
      if (knobName === 'c1') newVal = (newVal % 1.0 + 1.0) % 1.0; // Hue
      if (knobName === 'c2') newVal = THREE.MathUtils.clamp(newVal, 0.1, 10.0); // Speed
      if (knobName === 'c3') newVal = (newVal % 1.0 + 1.0) % 1.0; // Freq/Offset
      if (knobName === 'c4') newVal = THREE.MathUtils.clamp(newVal, 0.0, 4.9); // Mode
      
      useAppStore.getState().setKnobValue(knobName, newVal);
    };

    const handlePointerUp = () => {
      if (activeKnobRef.current) {
        activeKnobRef.current = null;
        useAppStore.getState().setIsDraggingKnob(false);
        useAppStore.getState().setActiveKnobId(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    // Check if we clicked the knob or its child elements
    let knobMesh = e.object as THREE.Mesh;
    while (knobMesh.parent && !knobMesh.name.match(/^c[1-4]$/)) {
      knobMesh = knobMesh.parent as THREE.Mesh;
    }

    if (knobMesh.name.match(/^c[1-4]$/)) {
      e.stopPropagation(); // 드래그 중 화면 회전 방지
      activeKnobRef.current = knobMesh;
      
      // 3D 공간의 노브 중심점을 2D 화면(Viewport) 좌표로 정확히 변환
      const worldPos = new THREE.Vector3();
      knobMesh.getWorldPosition(worldPos);
      worldPos.project(e.camera);
      
      // Canvas의 실제 위치와 크기를 가져와서 계산해야 함 (window.innerWidth 사용 시 레이아웃 때문에 오차 발생)
      const rect = (e.nativeEvent.target as HTMLElement).getBoundingClientRect();
      const screenX = (worldPos.x * 0.5 + 0.5) * rect.width + rect.left;
      const screenY = (worldPos.y * -0.5 + 0.5) * rect.height + rect.top;
      
      knobCenterScreen.current = { x: screenX, y: screenY };
      
      // 최초 클릭 지점의 각도 저장
      lastMouseAngle.current = Math.atan2(e.nativeEvent.clientY - screenY, e.nativeEvent.clientX - screenX);

      useAppStore.getState().setIsDraggingKnob(true);
      useAppStore.getState().setActiveKnobId(knobMesh.name as 'c1'|'c2'|'c3'|'c4');
      
      // 커서를 드래그용으로 변경 (원형 회전임을 암시하기 위해 grabbing 사용)
      document.body.style.cursor = 'grabbing';
      
      const handlePointerUpDom = () => {
        document.body.style.cursor = 'auto';
        window.removeEventListener('pointerup', handlePointerUpDom);
      };
      window.addEventListener('pointerup', handlePointerUpDom);
    }
  };

  useEffect(() => {
    // Reset arrays
    partsRef.current = { top: [], mid: [], bot: [], pcb: [], led: [], knobs: [], others: [] };

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        if (m.userData.originalX === undefined) {
          m.userData.originalX = m.position.x;
        }
        if (m.userData.originalY === undefined) {
          m.userData.originalY = m.position.y;
        }
        if (m.userData.originalZ === undefined) {
          m.userData.originalZ = m.position.z;
        }
        if (m.userData.originalScale === undefined) {
          m.userData.originalScale = m.scale.clone();
        }

        if (m.name === 'l') {
          m.material = activePatternId === 'custom' ? customMat : ledMat;
          partsRef.current.led.push(m);
        } else if (m.name.startsWith('t')) {
          partsRef.current.top.push(m);
        } else if (m.name === 'm') {
          partsRef.current.mid.push(m);
        } else if (m.name.startsWith('b')) {
          partsRef.current.bot.push(m);
        } else if (m.name === 'p' || m.name.includes('PCB')) {
          partsRef.current.pcb.push(m);
        } else if (m.name.match(/^c[1-4]$/)) {
          // 개별 색상 변경을 위해 메테리얼 복제 및 원래 색상 저장 (falsy 버그 방지를 위해 === undefined 체크)
          if (m.userData.originalColor === undefined) {
            m.material = (m.material as THREE.Material).clone();
            m.userData.originalColor = (m.material as THREE.MeshStandardMaterial).color.getHex();
          }
          partsRef.current.knobs.push(m);

          // 행성 고리와 공전하는 점 그룹 추가
          if (!m.children.find(c => c.name === 'knob-ring-group')) {
            m.geometry.computeBoundingBox();
            const bbox = m.geometry.boundingBox;
            if (bbox) {
              const radius = (bbox.max.x - bbox.min.x) / 2;
              const height = bbox.max.y - bbox.min.y;
              const ringRadius = radius * 1.5; // 노브보다 조금 더 큰 고리 반경
              
              const ringGroup = new THREE.Group();
              ringGroup.name = 'knob-ring-group';
              // 노브 높이의 중간 살짝 아래쯤에 고리 배치
              ringGroup.position.set(0, bbox.min.y + height * 0.4, 0);
              
              const effectMat = new THREE.MeshStandardMaterial({ 
                color: 0xff3333, emissive: 0xff0000, 
                emissiveIntensity: 2.0,
                transparent: true, opacity: 0.9 
              });
              
              // 두께를 키운 토러스(고리)
              const torusGeom = new THREE.TorusGeometry(ringRadius, radius * 0.08, 12, 48);
              const torus = new THREE.Mesh(torusGeom, effectMat);
              torus.rotation.x = Math.PI / 2; // XZ 평면으로 눕히기
              
              // 크기를 키운 고리 위에 얹혀 있는 구슬(점)
              const dotGeom = new THREE.SphereGeometry(radius * 0.4, 16, 16);
              const dot = new THREE.Mesh(dotGeom, effectMat);
              dot.position.set(ringRadius, 0, 0); 
              
              ringGroup.add(torus);
              ringGroup.add(dot);
              ringGroup.visible = false; // 평소에는 숨김
              
              m.add(ringGroup);
            }
          }
        } else if (!m.parent || m.parent.name !== 'knob-ring-group') {
          partsRef.current.others.push(m);
        }
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }, [scene, ledMat]);

  const prevKnobValues = useRef(knobValues);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    
    if (activePatternId === 'custom') {
      ledMatrix.render(delta, t, knobValues, prevKnobValues.current);
      prevKnobValues.current = { ...knobValues };
    } else {
      ledMat.uniforms.uTime.value = t;
    }

    // 현재 선택된 노브만 고리 이펙트 표시 및 회색 변환
    const currentActiveKnob = useAppStore.getState().activeKnobId;
    partsRef.current.knobs.forEach(m => {
      const isSelected = (currentActiveKnob === m.name);
      
      // 고리 표시 토글
      const ringGroup = m.children.find(c => c.name === 'knob-ring-group');
      if (ringGroup) {
        ringGroup.visible = isSelected;
      }
      
      // 색상 토글
      const mat = m.material as THREE.MeshStandardMaterial;
      if (isSelected) {
        mat.color.setHex(0x666666); // 선택 시 회색
      } else if (m.userData.originalColor !== undefined) {
        mat.color.setHex(m.userData.originalColor); // 아닐 시 원래 색상 복구
      }
    });

    let targetRotationY = 0;
    let targetGroupY = 0;
    let targetGroupX = 0;
    let targetScale = 0.1;
    
    if (buildStep === 0) {
      targetRotationY = Math.sin(t * 0.15) * 0.45;
      targetGroupY = Math.sin(t * 0.3) * 0.03;
    } else {
      targetRotationY = -0.5;
      
      if (buildStep === 1) {
        targetScale = 0.085; // Slight zoom out to show cases
        targetGroupX = -0.3; // Slight left
      } else if (buildStep === 2) {
        targetScale = 0.230;
        targetGroupX = 1.60;
        targetGroupY = -4.45;
        targetRotationY = 2.64;
      } else if (buildStep === 3) {
        const currentIsExploded = useAppStore.getState().isExploded;
        if (currentIsExploded) {
          targetScale = 0.075; // Zoom out further for exploded view
          targetGroupX = -0.3; // Slight left
          targetRotationY = -0.5; // Standard 3/4 view
        } else {
          targetScale = 0.11; // Zoom in slightly when compact
          targetGroupX = -0.3; // Keep original alignment
          targetRotationY = -0.5; // Keep original rotation
        }
      }
    }
    
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotationY, 0.05);
    groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetGroupY, 0.05);
    groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetGroupX, 0.05);
    
    const currentScale = groupRef.current.scale.x;
    const nextScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.05);
    groupRef.current.scale.set(nextScale, nextScale, nextScale);

    let offsetTopZ = 0, offsetMidZ = 0, offsetLedZ = 0, offsetPcbZ = 0, offsetBotZ = 0;
    
    if (buildStep === 1) { // 1. Print
      offsetTopZ = 8; offsetBotZ = -8;
    } else if (buildStep === 2) { // 2. Solder
      offsetLedZ = 6; offsetPcbZ = 0; 
    } else if (buildStep === 3) { // 3. Assemble
      if (isExploded) {
        // LED matrix frontmost, then Top cover, Mid case, PCB, Bot case (furthest back)
        offsetLedZ = 24; offsetTopZ = 16; offsetMidZ = 8; offsetPcbZ = 0; offsetBotZ = -12;
      }
    }

    const lerpSpeed = 0.08;
    
    // Z-axis separation for true exploded view (depth)
    partsRef.current.top.forEach(m => {
      let targetZ = m.userData.originalZ + offsetTopZ;
      let targetY = m.userData.originalY;
      let targetX = m.userData.originalX;

      if (buildStep === 3 && isExploded) {
        if (m.name === 't_rb') {
          // Top cover: move UP
          targetY += 25;
          targetZ += 2; 
        } else if (m.name === 't_b') {
          // Back top case: move BACK
          targetZ -= 20; // push far back
        } else if (m.name !== 't') {
          targetZ += 4;
        }
        // General top group slight Y upward shift
        if (m.name !== 't_rb') targetY += 2;
      }

      m.position.z = THREE.MathUtils.lerp(m.position.z, targetZ, lerpSpeed);
      m.position.y = THREE.MathUtils.lerp(m.position.y, targetY, lerpSpeed);
      m.position.x = THREE.MathUtils.lerp(m.position.x, targetX, lerpSpeed);
    });
    
    partsRef.current.knobs.forEach(m => {
      m.position.z = THREE.MathUtils.lerp(m.position.z, m.userData.originalZ + offsetTopZ + (buildStep === 3 && isExploded ? 8 : 0), lerpSpeed);
      m.position.y = THREE.MathUtils.lerp(m.position.y, m.userData.originalY + (buildStep === 3 && isExploded ? 2 : 0), lerpSpeed);
    });
    
    partsRef.current.mid.forEach(m => m.position.z = THREE.MathUtils.lerp(m.position.z, m.userData.originalZ + offsetMidZ, lerpSpeed));
    partsRef.current.led.forEach(m => m.position.z = THREE.MathUtils.lerp(m.position.z, m.userData.originalZ + offsetLedZ, lerpSpeed));
    partsRef.current.pcb.forEach(m => m.position.z = THREE.MathUtils.lerp(m.position.z, m.userData.originalZ + offsetPcbZ, lerpSpeed));
    partsRef.current.others.forEach(m => m.position.z = THREE.MathUtils.lerp(m.position.z, m.userData.originalZ + offsetPcbZ, lerpSpeed));
    
    partsRef.current.bot.forEach(m => {
      let targetZ = m.userData.originalZ + offsetBotZ;
      let targetY = m.userData.originalY;
      let targetX = m.userData.originalX;
      
      if (buildStep === 3 && isExploded) {
        if (m.name === 'b_f') {
          // Front cover: move to the RIGHT
          targetX += 20;
          targetZ += 2; 
        } else if (m.name === 'b_b') {
          // Back bottom case: move BACK
          targetZ -= 20; // push far back
        } else {
          targetZ += (m.name !== 'b' ? -4 : 0);
          targetY -= 2;
        }
      }

      m.position.z = THREE.MathUtils.lerp(m.position.z, targetZ, lerpSpeed);
      m.position.y = THREE.MathUtils.lerp(m.position.y, targetY, lerpSpeed);
      m.position.x = THREE.MathUtils.lerp(m.position.x, targetX, lerpSpeed);
    });

    const showCase = buildStep === 0 || buildStep === 1 || buildStep === 3 || buildStep === 4;
    const showPcb = buildStep === 0 || buildStep === 2 || buildStep === 3 || buildStep === 4;
    const showLed = buildStep === 0 || buildStep === 3 || buildStep === 4;

    const applyScaleLerp = (m: THREE.Mesh, show: boolean) => {
      const targetScale = show ? m.userData.originalScale as THREE.Vector3 : new THREE.Vector3(0.001, 0.001, 0.001);
      m.scale.lerp(targetScale, lerpSpeed);
      m.visible = m.scale.x > 0.01 || show;
    };

    partsRef.current.top.forEach(m => applyScaleLerp(m, showCase));
    partsRef.current.mid.forEach(m => applyScaleLerp(m, showCase));
    partsRef.current.bot.forEach(m => applyScaleLerp(m, showCase));
    partsRef.current.knobs.forEach(m => applyScaleLerp(m, showCase));
    partsRef.current.pcb.forEach(m => applyScaleLerp(m, showPcb));
    
    // LED Matrix Visibility and Scale restore
    partsRef.current.led.forEach(m => {
       m.visible = showLed;
       if (m.userData.originalScale) {
         m.scale.copy(m.userData.originalScale);
       }
    });
    
    partsRef.current.others.forEach(m => applyScaleLerp(m, showPcb));

    // Glow Effect for Step 4
    const glowTarget = buildStep === 4 ? 2.0 : 0.0;
    partsRef.current.others.forEach(m => {
      if (m.name.toLowerCase().includes('esp') || m.name.toLowerCase().includes('chip')) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.emissive) {
           if (m.userData.originalMaterial === undefined) {
             m.userData.originalMaterial = mat;
             m.material = mat.clone();
             (m.material as THREE.MeshStandardMaterial).emissive.setHex(0xFFD466);
           }
           const currentMat = m.material as THREE.MeshStandardMaterial;
           currentMat.emissiveIntensity = THREE.MathUtils.lerp(currentMat.emissiveIntensity || 0, glowTarget, 0.05);
        }
      }
    });
  });

  return (
    <group ref={groupRef} scale={[0.1, 0.1, 0.1]} position={[0, 0, 0]}>
      <primitive object={scene} onPointerDown={onPointerDown} />
    </group>
  );
}

export default function HeroScene() {
  const isDraggingKnob = useAppStore((state) => state.isDraggingKnob);
  const activeKnobId = useAppStore((state) => state.activeKnobId);
  const buildStep = useAppStore((state) => state.buildStep);
  const [hasInteracted, setHasInteracted] = useState(false);
  useEffect(() => {
    if (activeKnobId) {
      setHasInteracted(true);
    }
  }, [activeKnobId]);

  return (
    <div id="three-canvas" style={{ width: '100%', height: '100%', position: 'relative' }}>

      {/* 조작 안내 문구 (최초 1회 조작 시 서서히 사라짐) */}
      <div
        style={{
          position: 'absolute',
          top: '40px', left: '0', width: '100%', textAlign: 'center',
          color: '#6B655A',
          fontFamily: 'var(--mono)',
          fontWeight: 500,
          fontSize: '11px',
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

      <Canvas camera={{ position: [0.0, 6.0, 10.3], fov: 28 }} dpr={[1, 2]} shadows={{ type: THREE.PCFShadowMap }}>
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
        <Environment preset="city" environmentIntensity={0.25} />
        <Model />
        <OrbitControls target={[0, 1.7, 0]} enablePan={false} enableZoom={true} enableRotate={!isDraggingKnob} />
        <ContactShadows position={[0, -2.5, 0]} opacity={0.35} scale={20} blur={2.5} far={6} color="#1a1814" />
        
        {/* 빛 번짐(Glow/Bloom) 효과 */}
        <EffectComposer enableNormalPass={false}>
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
