import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { M } from '../materials';
import { Flange } from '../parts';
import { bool, num, roleValue } from '../../store/useTwin';
import type { ModelProps } from './types';

/** 공압 액추에이터 볼 밸브 — 원점은 배관 중심선 */
export function Valve({ eq }: ModelProps) {
  const s = Number(eq.params.size ?? 1);
  const indicator = useRef<THREE.Group>(null);
  const pos = useRef(0);
  const indMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 0.4, roughness: 0.4 }), []);
  const tmp = useMemo(() => new THREE.Color(), []);
  const green = useMemo(() => new THREE.Color('#22c55e'), []);

  useFrame((_, dt) => {
    const p = eq.bindings.position ? num(roleValue(eq, 'position')) / 100 : bool(roleValue(eq, 'open')) ? 1 : 0;
    pos.current += (THREE.MathUtils.clamp(p, 0, 1) - pos.current) * Math.min(1, dt * 4);
    if (indicator.current) indicator.current.rotation.y = (1 - pos.current) * (Math.PI / 2);
    tmp.set('#ef4444').lerp(green, pos.current);
    indMat.color.copy(tmp);
    indMat.emissive.copy(tmp);
  });

  return (
    <group scale={s}>
      {/* 바디 */}
      <mesh material={M.stainless()} castShadow>
        <sphereGeometry args={[0.1, 32, 20]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} material={M.stainless()} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 0.32, 24]} />
      </mesh>
      <Flange r={0.065} position={[-0.17, 0, 0]} axis="x" />
      <Flange r={0.065} position={[0.17, 0, 0]} axis="x" />
      {/* 스템 + 브라켓 */}
      <mesh position={[0, 0.14, 0]} material={M.stainless()}>
        <cylinderGeometry args={[0.02, 0.02, 0.1, 12]} />
      </mesh>
      <mesh position={[0, 0.19, 0]} material={M.stainless()} castShadow>
        <boxGeometry args={[0.16, 0.02, 0.1]} />
      </mesh>
      {/* 랙&피니언 액추에이터 */}
      <RoundedBox args={[0.34, 0.13, 0.13]} radius={0.03} smoothness={3} position={[0, 0.27, 0]} material={M.aluminum()} castShadow />
      {[-1, 1].map((x) => (
        <mesh key={x} position={[x * 0.18, 0.27, 0]} rotation={[0, 0, Math.PI / 2]} material={M.paint('#1d4ed8')} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 28]} />
        </mesh>
      ))}
      {/* 솔레노이드 */}
      <RoundedBox args={[0.06, 0.08, 0.06]} radius={0.01} position={[0.1, 0.27, 0.09]} material={M.plastic('#111827')} castShadow />
      {/* 리밋스위치 박스 + 개도 인디케이터 */}
      <RoundedBox args={[0.12, 0.08, 0.1]} radius={0.015} position={[0, 0.375, 0]} material={M.plastic('#e5e7eb')} castShadow />
      <group ref={indicator} position={[0, 0.43, 0]}>
        <mesh material={indMat} userData={{ keepMaterial: true }}>
          <cylinderGeometry args={[0.035, 0.045, 0.035, 24]} />
        </mesh>
        <mesh position={[0, 0.02, 0]} material={M.plastic('#facc15')}>
          <boxGeometry args={[0.09, 0.008, 0.016]} />
        </mesh>
      </group>
    </group>
  );
}
