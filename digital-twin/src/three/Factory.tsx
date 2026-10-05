import * as THREE from 'three';
import { useMemo } from 'react';
import { Grid, MeshReflectorMaterial } from '@react-three/drei';
import { useTwin } from '../store/useTwin';
import { concreteTextures, labelTexture, wallPanelTexture } from './textures';
import { hBeamGeometry } from './parts';
import { M } from './materials';

const noRaycast = () => null;

/** 바닥 구역 라인 (설비 그룹별 자동 생성) */
function ZoneMarkings() {
  const equipment = useTwin((s) => s.plant.equipment);
  const zones = useMemo(() => {
    const groups = new Map<string, THREE.Box2>();
    for (const e of equipment) {
      if (!e.group || e.type === 'pipe' || e.type === 'agv') continue;
      const b = groups.get(e.group) ?? new THREE.Box2();
      const pad = e.type === 'conveyor' ? Number(e.params.length ?? 6) / 2 : e.type === 'tank' ? Number(e.params.radius ?? 1) + 0.6 : 1.5;
      const yaw = (e.rotation[1] * Math.PI) / 180;
      const ex = Math.abs(Math.cos(yaw)) * pad + Math.abs(Math.sin(yaw)) * 1.2;
      const ez = Math.abs(Math.sin(yaw)) * pad + Math.abs(Math.cos(yaw)) * 1.2;
      b.expandByPoint(new THREE.Vector2(e.position[0] - ex, e.position[2] - ez));
      b.expandByPoint(new THREE.Vector2(e.position[0] + ex, e.position[2] + ez));
      groups.set(e.group, b);
    }
    return [...groups.entries()].map(([name, b]) => {
      b.expandByScalar(0.6);
      const c = b.getCenter(new THREE.Vector2());
      const s = b.getSize(new THREE.Vector2());
      return { name, c, s };
    });
  }, [equipment]);

  return (
    <group>
      {zones.map(({ name, c, s }) => {
        const t = 0.1;
        const lines: [number, number, number, number][] = [
          [c.x, c.y - s.y / 2, s.x, t],
          [c.x, c.y + s.y / 2, s.x, t],
          [c.x - s.x / 2, c.y, t, s.y],
          [c.x + s.x / 2, c.y, t, s.y],
        ];
        const tex = labelTexture(name, { bg: 'rgba(0,0,0,0)', fg: 'rgba(250,204,21,0.9)', w: 512, h: 96 });
        return (
          <group key={name}>
            {lines.map(([x, z, w, d], i) => (
              <mesh key={i} position={[x, 0.004, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} receiveShadow>
                <planeGeometry args={[w, d]} />
                <meshStandardMaterial color="#eab308" roughness={0.55} polygonOffset polygonOffsetFactor={-1} />
              </mesh>
            ))}
            <mesh position={[c.x - s.x / 2 + 1.5, 0.005, c.y + s.y / 2 - 0.45]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
              <planeGeometry args={[2.6, 0.5]} />
              <meshStandardMaterial map={tex} transparent roughness={0.6} polygonOffset polygonOffsetFactor={-1} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function Factory() {
  const floor = useTwin((s) => s.plant.floor);
  const quality = useTwin((s) => s.ui.quality);
  const grid = useTwin((s) => s.ui.grid);
  const W = floor.width, D = floor.depth;
  const wallH = 9;

  const [map, rough] = useMemo(() => {
    const m = concreteTextures().clone();
    m.repeat.set(W / 4, D / 4);
    m.needsUpdate = true;
    const r = (concreteTextures().userData.rough as THREE.Texture).clone();
    r.repeat.set(W / 6, D / 6);
    r.needsUpdate = true;
    return [m, r];
  }, [W, D]);

  const wallTex = useMemo(() => {
    const t = wallPanelTexture().clone();
    t.repeat.set(W / 1.5, 1);
    t.needsUpdate = true;
    return t;
  }, [W]);
  const wallTexSide = useMemo(() => {
    const t = wallPanelTexture().clone();
    t.repeat.set(D / 1.5, 1);
    t.needsUpdate = true;
    return t;
  }, [D]);

  const columns = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let x = -W / 2; x <= W / 2 + 0.01; x += 8) out.push([x, 0, -D / 2 + 0.3]);
    for (let z = -D / 2 + 8; z <= D / 2 + 0.01; z += 8) out.push([-W / 2 + 0.3, 0, z]);
    return out;
  }, [W, D]);

  return (
    <group>
      {/* 에폭시 바닥 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[W, D]} />
        {quality === 'high' ? (
          <MeshReflectorMaterial
            map={map}
            roughnessMap={rough}
            roughness={0.7}
            metalness={0.05}
            mirror={0}
            blur={[400, 120]}
            resolution={1024}
            mixBlur={1}
            mixStrength={1.2}
            mixContrast={1}
            depthScale={0.8}
            minDepthThreshold={0.3}
            maxDepthThreshold={1.2}
            color="#a1a5ab"
          />
        ) : (
          <meshStandardMaterial map={map} roughnessMap={rough} roughness={0.75} color="#a1a5ab" />
        )}
      </mesh>
      {/* 외곽 보행로 */}
      {[
        [0, -D / 2 + 1.6, W - 2.4, 1.6],
        [-W / 2 + 1.6, 0.8, 1.6, D - 1.6],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.002, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={noRaycast}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color="#2f6b4f" roughness={0.5} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
      <ZoneMarkings />

      {/* 벽체 (후면 / 좌측) — 내부가 보이도록 2면만 */}
      <mesh position={[0, wallH / 2, -D / 2]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[W, wallH]} />
        <meshStandardMaterial map={wallTex} roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[-W / 2, wallH / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[D, wallH]} />
        <meshStandardMaterial map={wallTexSide} roughness={0.7} metalness={0.2} />
      </mesh>
      {/* 하부 도장 띠 (걸레받이) */}
      <mesh position={[0, 0.6, -D / 2 + 0.01]} raycast={noRaycast}>
        <planeGeometry args={[W, 1.2]} />
        <meshStandardMaterial color="#3b4252" roughness={0.6} />
      </mesh>
      <mesh position={[-W / 2 + 0.01, 0.6, 0]} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast}>
        <planeGeometry args={[D, 1.2]} />
        <meshStandardMaterial color="#3b4252" roughness={0.6} />
      </mesh>
      {/* 고창 (채광창) */}
      <mesh position={[0, wallH - 1.6, -D / 2 + 0.02]} raycast={noRaycast}>
        <planeGeometry args={[W - 4, 1.4]} />
        <meshStandardMaterial color="#cfe6ff" emissive="#cfe6ff" emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      {Array.from({ length: Math.floor((W - 4) / 2) + 1 }, (_, i) => (
        <mesh key={i} position={[-W / 2 + 2 + i * 2, wallH - 1.6, -D / 2 + 0.04]} raycast={noRaycast}>
          <boxGeometry args={[0.08, 1.4, 0.04]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
      {/* H빔 기둥 */}
      {columns.map((p, i) => (
        <mesh key={i} position={p} geometry={hBeamGeometry(0.3, 0.3, 0.012, 0.02)} scale={[1, 1, wallH]} material={M.paint('#2563eb', 0.5)} castShadow raycast={noRaycast} />
      ))}
      {/* 상부 거더 */}
      <mesh position={[0, wallH - 0.25, -D / 2 + 0.3]} material={M.paint('#2563eb', 0.5)} raycast={noRaycast}>
        <boxGeometry args={[W, 0.5, 0.3]} />
      </mesh>
      <mesh position={[-W / 2 + 0.3, wallH - 0.25, 0]} material={M.paint('#2563eb', 0.5)} raycast={noRaycast}>
        <boxGeometry args={[0.3, 0.5, D]} />
      </mesh>

      {grid && (
        <Grid
          position={[0, 0.006, 0]}
          args={[W, D]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#38bdf8"
          sectionSize={4}
          sectionThickness={1.1}
          sectionColor="#22d3ee"
          fadeDistance={80}
          fadeStrength={1}
          infiniteGrid={false}
        />
      )}
    </group>
  );
}
