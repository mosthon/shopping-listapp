import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { M } from '../materials';
import { cardboardTexture, labelTexture } from '../textures';
import { bool, num, roleValue } from '../../store/useTwin';
import type { ModelProps } from './types';

/** 모서리가 둥근 사각 경로 (XZ 평면, 원점 중심) */
function makePath(w: number, d: number, r: number) {
  r = Math.min(r, w / 2 - 0.01, d / 2 - 0.01);
  const p = new THREE.CurvePath<THREE.Vector3>();
  const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  const hw = w / 2, hd = d / 2;
  p.add(new THREE.LineCurve3(V(-hw + r, hd), V(hw - r, hd)));
  p.add(new THREE.QuadraticBezierCurve3(V(hw - r, hd), V(hw, hd), V(hw, hd - r)));
  p.add(new THREE.LineCurve3(V(hw, hd - r), V(hw, -hd + r)));
  p.add(new THREE.QuadraticBezierCurve3(V(hw, -hd + r), V(hw, -hd), V(hw - r, -hd)));
  p.add(new THREE.LineCurve3(V(hw - r, -hd), V(-hw + r, -hd)));
  p.add(new THREE.QuadraticBezierCurve3(V(-hw + r, -hd), V(-hw, -hd), V(-hw, -hd + r)));
  p.add(new THREE.LineCurve3(V(-hw, -hd + r), V(-hw, hd - r)));
  p.add(new THREE.QuadraticBezierCurve3(V(-hw, hd - r), V(-hw, hd), V(-hw + r, hd)));
  return p;
}

/** 경로를 따라 평평한 띠(바닥 유도 테이프) 생성 */
function ribbon(path: THREE.CurvePath<THREE.Vector3>, width: number, samples = 400) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const len = path.getLength();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = path.getPointAt(u);
    const t = path.getTangentAt(u);
    const n = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(width / 2);
    pos.push(p.x + n.x, 0, p.z + n.z, p.x - n.x, 0, p.z - n.z);
    uv.push(u * len * 2, 0, u * len * 2, 1);
    if (i < samples) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function Agv({ eq }: ModelProps) {
  const w = Number(eq.params.pathW ?? 10);
  const d = Number(eq.params.pathD ?? 4);
  const path = useMemo(() => makePath(w, d, 1.2), [w, d]);
  const tape = useMemo(() => ribbon(path, 0.06), [path]);
  const body = useRef<THREE.Group>(null);
  const lidar = useRef<THREE.Mesh>(null);
  const prog = useRef(-1);
  const ledMat = useMemo(() => M.emissive('#38bdf8', 2.5), []);
  const boxMat = useMemo(() => new THREE.MeshStandardMaterial({ map: cardboardTexture(), roughness: 0.9 }), []);
  const plate = useMemo(() => labelTexture(eq.id, { bg: '#111827', fg: '#facc15', w: 256, h: 80 }), [eq.id]);
  const look = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, dt) => {
    const target = THREE.MathUtils.clamp(num(roleValue(eq, 'progress')) / 100, 0, 1);
    if (prog.current < 0) prog.current = target;
    // 0↔1 래핑 시 짧은 방향으로 보간
    let delta = target - prog.current;
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
    prog.current = (prog.current + delta * Math.min(1, dt * 4) + 1) % 1;
    const p = path.getPointAt(prog.current);
    const t = path.getTangentAt(prog.current);
    if (body.current) {
      body.current.position.set(p.x, 0, p.z);
      look.copy(p).add(t);
      body.current.lookAt(look.x, 0, look.z);
    }
    if (lidar.current) lidar.current.rotation.y += dt * 12;
    const run = bool(roleValue(eq, 'run'), true);
    ledMat.emissive.set(run ? '#38bdf8' : '#f59e0b');
    ledMat.emissiveIntensity = 1.5 + Math.sin(clock.elapsedTime * 4) * 1;
  });

  return (
    <group>
      {/* 바닥 유도 테이프 */}
      <mesh geometry={tape} position={[0, 0.003, 0]} receiveShadow userData={{ keepMaterial: true }}>
        <meshStandardMaterial color="#facc15" roughness={0.5} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {/* 충전 스테이션 */}
      <group position={[-w / 2 + 2, 0, d / 2 + 0.55]}>
        <RoundedBox args={[0.6, 0.5, 0.3]} radius={0.03} position={[0, 0.25, 0]} material={M.paint('#1f2937')} castShadow />
        <mesh position={[0, 0.38, -0.151]} rotation={[0, Math.PI, 0]} material={M.emissive('#22c55e', 2)}>
          <planeGeometry args={[0.2, 0.04]} />
        </mesh>
        <mesh position={[0, 0.06, -0.2]} material={M.brass()}>
          <boxGeometry args={[0.3, 0.03, 0.1]} />
        </mesh>
      </group>

      {/* 차량 (진행방향 +Z) */}
      <group ref={body}>
        <RoundedBox args={[0.62, 0.26, 0.95]} radius={0.04} smoothness={3} position={[0, 0.18, 0]} material={M.paint('#facc15', 0.4)} castShadow receiveShadow />
        <mesh position={[0, 0.06, 0]} material={M.paint('#111827')} castShadow>
          <boxGeometry args={[0.6, 0.08, 0.92]} />
        </mesh>
        {/* 범퍼 */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, 0.12, s * 0.49]} material={M.rubber()}>
            <boxGeometry args={[0.58, 0.08, 0.04]} />
          </mesh>
        ))}
        {/* 바퀴 */}
        {[[-0.28, 0.3], [0.28, 0.3], [-0.28, -0.3], [0.28, -0.3]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.07, z]} rotation={[0, 0, Math.PI / 2]} material={M.rubber()}>
            <cylinderGeometry args={[0.07, 0.07, 0.05, 20]} />
          </mesh>
        ))}
        {/* LED 띠 */}
        <mesh position={[0, 0.2, 0.476]} material={ledMat} userData={{ keepMaterial: true }}>
          <boxGeometry args={[0.5, 0.025, 0.01]} />
        </mesh>
        <mesh position={[0, 0.2, -0.476]} material={ledMat} userData={{ keepMaterial: true }}>
          <boxGeometry args={[0.5, 0.025, 0.01]} />
        </mesh>
        {/* 라이다 */}
        <mesh position={[0, 0.33, 0.38]} material={M.darkSteel()}>
          <cylinderGeometry args={[0.05, 0.055, 0.04, 20]} />
        </mesh>
        <mesh ref={lidar} position={[0, 0.37, 0.38]} material={M.plastic('#0f172a')}>
          <cylinderGeometry args={[0.04, 0.04, 0.04, 6]} />
        </mesh>
        {/* 명판 */}
        <mesh position={[0.311, 0.18, 0]} rotation={[0, Math.PI / 2, 0]} userData={{ keepMaterial: true }}>
          <planeGeometry args={[0.3, 0.09]} />
          <meshStandardMaterial map={plate} />
        </mesh>
        {/* 적재: 팔레트 + 박스 */}
        <group position={[0, 0.31, -0.05]}>
          <mesh material={M.matte('#a16207')} castShadow>
            <boxGeometry args={[0.55, 0.06, 0.75]} />
          </mesh>
          {[[-0.13, -0.18], [0.13, -0.18], [-0.13, 0.18], [0.13, 0.18]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.15, z]} material={boxMat} castShadow>
              <boxGeometry args={[0.25, 0.24, 0.33]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
