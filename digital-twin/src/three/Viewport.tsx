import * as THREE from 'three';
import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CameraControls, Environment, Lightformer, AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, Outline, Selection, ToneMapping, Vignette, SMAA } from '@react-three/postprocessing';
import { ToneMappingMode, KernelSize } from 'postprocessing';
import { useTwin } from '../store/useTwin';
import { Factory } from './Factory';
import { EquipmentNode } from './EquipmentNode';
import { setClip } from './clipping';

function Equipments() {
  const equipment = useTwin((s) => s.plant.equipment);
  return (
    <group name="equipment-root">
      {equipment.map((e) => (
        <EquipmentNode key={e.id} eq={e} />
      ))}
    </group>
  );
}

function Lights() {
  const quality = useTwin((s) => s.ui.quality);
  const floor = useTwin((s) => s.plant.floor);
  const ext = Math.max(floor.width, floor.depth) / 2 + 2;
  const mapSize = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
  return (
    <>
      <hemisphereLight args={['#e0ecff', '#3a3a40', 0.35]} />
      <directionalLight
        position={[14, 28, 16]}
        intensity={2.4}
        color="#fff6e8"
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
        shadow-camera-left={-ext}
        shadow-camera-right={ext}
        shadow-camera-top={ext}
        shadow-camera-bottom={-ext}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
      <directionalLight position={[-20, 12, -10]} intensity={0.35} color="#cfe0ff" />
      {/* 공장 천장 조명을 흉내낸 환경맵 (오프라인에서도 동작하는 절차적 HDR) */}
      <Environment resolution={256} frames={1} environmentIntensity={1}>
        {/* 공장 내부의 밝은 회색 벽/천장 반사를 흉내낸 배경 */}
        <color attach="background" args={['#4a515c']} />
        <mesh position={[0, -6, 0]} scale={[120, 1, 120]}>
          <boxGeometry />
          <meshBasicMaterial color="#2a2e35" />
        </mesh>
        {Array.from({ length: 4 }, (_, row) =>
          Array.from({ length: 3 }, (_, col) => (
            <Lightformer
              key={`${row}-${col}`}
              form="rect"
              intensity={1.6}
              color="#f4f7ff"
              position={[(col - 1) * 12, 14, (row - 1.5) * 8]}
              rotation-x={Math.PI / 2}
              scale={[8, 0.8, 1]}
            />
          )),
        )}
        <Lightformer form="rect" intensity={1.2} color="#cfe6ff" position={[0, 6, -25]} scale={[40, 3, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#ffe4c4" position={[30, 4, 0]} rotation-y={-Math.PI / 2} scale={[30, 4, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#ffffff" position={[-20, 10, 10]} scale={6} />
      </Environment>
    </>
  );
}

function Effects() {
  const quality = useTwin((s) => s.ui.quality);
  const hi = quality === 'high';
  const low = quality === 'low';
  return (
    <EffectComposer multisampling={low ? 0 : 4} enableNormalPass={false} autoClear={false}>
      <>{!low && <N8AO aoRadius={1.2} distanceFalloff={0.6} intensity={hi ? 2.6 : 2} halfRes={!hi} quality={hi ? 'high' : 'medium'} />}</>
      <>{!low && <Bloom mipmapBlur luminanceThreshold={1.4} luminanceSmoothing={0.15} intensity={0.8} />}</>
      <Outline visibleEdgeColor={0x22d3ee} hiddenEdgeColor={0x0e7490} edgeStrength={4} blur kernelSize={KernelSize.VERY_SMALL} xRay />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <>{hi && <Vignette offset={0.25} darkness={0.55} />}</>
      <>{low && <SMAA />}</>
    </EffectComposer>
  );
}

const VIEWS: Record<string, [number, number, number, number, number, number]> = {
  home: [10, 13, 17, -1, 0, -2],
  top: [0, 48, 0.01, 0, 0, 0],
  front: [0, 6, 30, 0, 1.5, 0],
  side: [32, 7, 0, 0, 1.5, 0],
  iso: [-24, 20, 22, -2, 0, -2],
};

function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const scene = useThree((s) => s.scene);
  const focusReq = useTwin((s) => s.focusRequest);
  const viewReq = useTwin((s) => s.viewRequest);

  useEffect(() => {
    const c = ref.current;
    if (!c || !focusReq.id) return;
    const obj = scene.getObjectByName(`eq:${focusReq.id}`);
    if (!obj) return;
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const dist = Math.max(3, Math.max(size.x, size.y, size.z) * 1.8);
    const dir = new THREE.Vector3();
    c.getPosition(dir).sub(c.getTarget(new THREE.Vector3())).normalize();
    if (dir.y < 0.25) dir.y = 0.4;
    dir.normalize();
    c.setLookAt(center.x + dir.x * dist, center.y + dir.y * dist, center.z + dir.z * dist, center.x, center.y, center.z, true);
  }, [focusReq, scene]);

  useEffect(() => {
    const c = ref.current;
    const v = VIEWS[viewReq.view];
    if (c && v) c.setLookAt(...v, viewReq.n > 0);
  }, [viewReq]);

  useFrame((_, dt) => {
    if (ref.current && useTwin.getState().ui.autoRotate) ref.current.azimuthAngle += dt * 0.08;
  });

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={1.5}
      maxDistance={90}
      maxPolarAngle={Math.PI / 2 - 0.04}
      dollySpeed={0.6}
      smoothTime={0.35}
    />
  );
}

function SceneSettings() {
  const gl = useThree((s) => s.gl);
  const clip = useTwin((s) => s.ui.clip);
  useEffect(() => {
    gl.localClippingEnabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
  }, [gl]);
  useEffect(() => setClip(clip.axis, clip.value, clip.flip), [clip]);
  return null;
}

export function Viewport() {
  const quality = useTwin((s) => s.ui.quality);
  return (
    <Canvas
      shadows
      dpr={quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : 1}
      camera={{ position: VIEWS.home.slice(0, 3) as [number, number, number], fov: 38, near: 0.1, far: 400 }}
      gl={{ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', stencil: false }}
      onPointerMissed={(e) => {
        if (e.button === 0) useTwin.getState().select(null);
      }}
      id="twin-canvas"
    >
      <color attach="background" args={['#0c1016']} />
      <fog attach="fog" args={['#0c1016', 55, 130]} />
      <SceneSettings />
      <PerformanceMonitor
        flipflops={2}
        onDecline={() => {
          // 프레임 저하 시 자동으로 품질 한 단계 하향 (저사양 PC / 내장 그래픽 대응)
          const { ui, setUi, log } = useTwin.getState();
          const next = ui.quality === 'high' ? 'medium' : ui.quality === 'medium' ? 'low' : null;
          if (next) {
            setUi({ quality: next });
            log('info', `렌더링 성능 저하 감지 → 품질 '${next}' 로 자동 조정`);
          }
        }}
      />
      <AdaptiveDpr pixelated={false} />
      <Suspense fallback={null}>
        <Lights />
        <Selection>
          <Factory />
          <Equipments />
          <Effects />
        </Selection>
      </Suspense>
      <CameraRig />
    </Canvas>
  );
}
