import * as THREE from 'three';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { M } from '../materials';
import { BoltCircle, Flange } from '../parts';
import { bool, num, roleValue } from '../../store/useTwin';
import type { ModelProps } from './types';

/** 수직 인라인 원심펌프 — 흡입(-X) / 토출(+X) 플랜지 높이 0.42m (배율 1 기준) */
export function Pump({ eq }: ModelProps) {
  const s = Number(eq.params.size ?? 1);
  const color = String(eq.params.color ?? '#2563eb');
  const shaft = useRef<THREE.Group>(null);
  const rpmSm = useRef(0);

  useFrame((_, dt) => {
    const target = bool(roleValue(eq, 'run'), true) && !bool(roleValue(eq, 'fault')) ? num(roleValue(eq, 'rpm'), 1750) : 0;
    rpmSm.current += (target - rpmSm.current) * Math.min(1, dt * 1.5);
    // 실제 회전수는 너무 빨라 스트로보 현상 → 시각적 배속 1/40
    if (shaft.current) shaft.current.rotation.y += (rpmSm.current / 60) * Math.PI * 2 * dt * 0.025;
  });

  const cy = 0.42;
  return (
    <group scale={s}>
      {/* 받침대 */}
      <mesh position={[0, 0.06, 0]} material={M.paint('#334155', 0.6)} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.12, 0.6]} />
      </mesh>
      <mesh position={[0, 0.2, 0]} material={M.castIron()} castShadow>
        <cylinderGeometry args={[0.16, 0.2, 0.16, 32]} />
      </mesh>
      {/* 볼류트 케이싱 */}
      <mesh position={[0, cy, 0]} material={M.castIron()} castShadow>
        <cylinderGeometry args={[0.24, 0.22, 0.2, 40]} />
      </mesh>
      <mesh position={[0, cy, 0]} rotation={[0, 0, Math.PI / 2]} material={M.castIron()} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 1.0, 24]} />
      </mesh>
      <Flange r={0.075} position={[-0.5, cy, 0]} axis="x" />
      <Flange r={0.075} position={[0.5, cy, 0]} axis="x" />
      {/* 압력계 */}
      <group position={[0.36, cy + 0.08, 0]}>
        <mesh position={[0, 0.06, 0]} material={M.brass()}>
          <cylinderGeometry args={[0.008, 0.008, 0.12, 8]} />
        </mesh>
        <mesh position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.chrome()} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.03, 24]} />
        </mesh>
        <mesh position={[0, 0.16, 0.016]} userData={{ keepMaterial: true }}>
          <circleGeometry args={[0.04, 24]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.3} />
        </mesh>
      </group>
      {/* 랜턴 브라켓 (커플링 노출 창) */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.13, cy + 0.24, Math.sin(a) * 0.13]} material={M.castIron()} castShadow>
            <boxGeometry args={[0.05, 0.28, 0.05]} />
          </mesh>
        );
      })}
      <mesh position={[0, cy + 0.11, 0]} material={M.castIron()}>
        <cylinderGeometry args={[0.18, 0.2, 0.04, 32]} />
      </mesh>
      {/* 회전 축 / 커플링 */}
      <group ref={shaft} position={[0, cy + 0.24, 0]}>
        <mesh material={M.chrome()}>
          <cylinderGeometry args={[0.025, 0.025, 0.26, 16]} />
        </mesh>
        <mesh material={M.darkSteel()}>
          <cylinderGeometry args={[0.055, 0.055, 0.08, 6]} />
        </mesh>
        <mesh position={[0.05, 0, 0]} material={M.paint('#facc15')}>
          <boxGeometry args={[0.02, 0.07, 0.02]} />
        </mesh>
      </group>
      <mesh position={[0, cy + 0.38, 0]} material={M.castIron()}>
        <cylinderGeometry args={[0.2, 0.18, 0.04, 32]} />
      </mesh>
      {/* 모터 (냉각핀) */}
      <group position={[0, cy + 0.4, 0]}>
        <mesh position={[0, 0.25, 0]} material={M.paint(color)} castShadow>
          <cylinderGeometry args={[0.17, 0.17, 0.5, 40]} />
        </mesh>
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.18, 0.25, Math.sin(a) * 0.18]} rotation={[0, -a, 0]} material={M.paint(color)} castShadow>
              <boxGeometry args={[0.03, 0.46, 0.008]} />
            </mesh>
          );
        })}
        {/* 팬 커버 */}
        <mesh position={[0, 0.56, 0]} material={M.paint(color)} castShadow>
          <cylinderGeometry args={[0.15, 0.18, 0.12, 40]} />
        </mesh>
        <mesh position={[0, 0.625, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.darkSteel()}>
          <circleGeometry args={[0.13, 32]} />
        </mesh>
        {/* 단자함 */}
        <RoundedBox args={[0.16, 0.12, 0.14]} radius={0.015} position={[0, 0.3, 0.22]} material={M.paint(color)} castShadow />
        <mesh position={[0, 0.22, 0.29]} material={M.rubber()}>
          <cylinderGeometry args={[0.015, 0.015, 0.05, 10]} />
        </mesh>
        {/* 아이볼트 */}
        <mesh position={[0, 0.68, 0]} rotation={[0, 0, 0]} material={M.chrome()}>
          <torusGeometry args={[0.03, 0.008, 8, 20]} />
        </mesh>
      </group>
      <BoltCircle r={0.26} count={4} size={0.016} y={0.12} />
    </group>
  );
}
