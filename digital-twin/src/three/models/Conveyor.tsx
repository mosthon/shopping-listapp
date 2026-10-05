import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { M } from '../materials';
import { Profile, LevelingFoot, EStop } from '../parts';
import { beltTexture, cardboardTexture } from '../textures';
import { bool, num, roleValue } from '../../store/useTwin';
import type { ModelProps } from './types';

export function Conveyor({ eq }: ModelProps) {
  const L = Number(eq.params.length ?? 6);
  const W = Number(eq.params.width ?? 0.6);
  const H = Number(eq.params.height ?? 0.85);
  const beltColor = String(eq.params.beltColor ?? '#1f2937');
  const showItems = eq.params.items !== false;
  const drumR = 0.055;
  const topY = H;

  const beltMat = useMemo(() => {
    const t = beltTexture(beltColor).clone();
    t.repeat.set(L * 3, 1);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0 });
  }, [beltColor, L]);

  const boxMat = useMemo(() => new THREE.MeshStandardMaterial({ map: cardboardTexture(), roughness: 0.9 }), []);
  const drums = useRef<THREE.Mesh[]>([]);
  const items = useRef<THREE.Group>(null);
  const offset = useRef(Math.random() * 10);
  const speedSm = useRef(0);

  const legXs = useMemo(() => {
    const n = Math.max(2, Math.ceil(L / 1.6) + 1);
    return Array.from({ length: n }, (_, i) => -L / 2 + 0.15 + (i * (L - 0.3)) / (n - 1));
  }, [L]);

  const itemCount = Math.max(1, Math.floor(L / 1.3));
  const itemSizes = useMemo(
    () => Array.from({ length: itemCount }, (_, i) => [0.3 + ((i * 37) % 10) / 60, 0.22 + ((i * 53) % 10) / 70, Math.min(W * 0.75, 0.32 + ((i * 17) % 10) / 70)]),
    [itemCount, W],
  );

  useFrame((_, dt) => {
    const running = bool(roleValue(eq, 'run'), true) && !bool(roleValue(eq, 'fault'));
    const target = running ? num(roleValue(eq, 'speed'), 12) / 60 : 0; // m/s
    speedSm.current += (target - speedSm.current) * Math.min(1, dt * 3);
    const v = speedSm.current;
    offset.current += v * dt;
    const map = beltMat.map!;
    map.offset.x = -(offset.current / L) * map.repeat.x;
    for (const d of drums.current) if (d) d.rotation.x -= (v * dt) / drumR;
    if (items.current) {
      const n = items.current.children.length;
      const span = L - 0.4;
      items.current.children.forEach((c, i) => {
        const p = ((offset.current + (i * span) / n) % span + span) % span;
        c.position.x = -span / 2 + p;
      });
    }
  });

  return (
    <group>
      {/* 사이드 프레임 (40×80 프로파일) */}
      {[-1, 1].map((s) => (
        <Profile key={s} length={L} w={0.04} h={0.08} axis="x" position={[0, topY - 0.045, s * (W / 2 + 0.025)]} />
      ))}
      {/* 다리 + 하부 브레이스 + 레벨링 풋 */}
      {legXs.map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          {[-1, 1].map((s) => (
            <group key={s}>
              <Profile length={topY - 0.1} axis="y" position={[0, (topY - 0.1) / 2 + 0.05, s * (W / 2 + 0.025)]} />
              <LevelingFoot position={[0, 0, s * (W / 2 + 0.025)]} />
            </group>
          ))}
          <Profile length={W + 0.05} axis="z" position={[0, 0.25, 0]} />
        </group>
      ))}
      <Profile length={L - 0.3} axis="x" position={[0, 0.25, -(W / 2 + 0.025)]} />
      <Profile length={L - 0.3} axis="x" position={[0, 0.25, W / 2 + 0.025]} />

      {/* 벨트 상면 / 리턴 */}
      <mesh position={[0, topY - 0.002, 0]} material={beltMat} receiveShadow castShadow>
        <boxGeometry args={[L - 0.02, 0.006, W]} />
      </mesh>
      <mesh position={[0, topY - drumR * 2 - 0.01, 0]} material={M.rubber()}>
        <boxGeometry args={[L - 0.1, 0.005, W]} />
      </mesh>
      {/* 슬라이더 베드 */}
      <mesh position={[0, topY - 0.03, 0]} material={M.stainless()}>
        <boxGeometry args={[L - 0.12, 0.04, W - 0.02]} />
      </mesh>
      {/* 헤드/테일 드럼 */}
      {[-1, 1].map((s, i) => (
        <mesh
          key={s}
          ref={(m) => { if (m) drums.current[i] = m; }}
          position={[s * (L / 2 - drumR * 0.5), topY - drumR, 0]}
          rotation={[0, 0, Math.PI / 2]}
          material={M.stainless()}
          castShadow
        >
          <cylinderGeometry args={[drumR, drumR, W + 0.01, 28]} />
        </mesh>
      ))}
      {/* 사이드 가이드 레일 */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0, topY + 0.09, s * (W / 2 - 0.01)]} rotation={[0, 0, Math.PI / 2]} material={M.chrome()} castShadow>
            <cylinderGeometry args={[0.009, 0.009, L - 0.3, 10]} />
          </mesh>
          {legXs.map((x, i) => (
            <mesh key={i} position={[x, topY + 0.035, s * (W / 2 + 0.005)]} material={M.chrome()}>
              <cylinderGeometry args={[0.006, 0.006, 0.12, 8]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 구동부: 기어드 모터 */}
      <group position={[L / 2 - drumR, topY - drumR, -(W / 2 + 0.12)]}>
        <RoundedBox args={[0.2, 0.2, 0.16]} radius={0.02} material={M.paint('#1e40af')} castShadow />
        <mesh position={[0, 0, -0.18]} rotation={[Math.PI / 2, 0, 0]} material={M.paint('#1e40af')} castShadow>
          <cylinderGeometry args={[0.085, 0.085, 0.24, 28]} />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[0, 0, -0.08 - i * 0.026]} rotation={[Math.PI / 2, 0, 0]} material={M.paint('#1e3a8a')}>
            <cylinderGeometry args={[0.095, 0.095, 0.008, 28]} />
          </mesh>
        ))}
        <mesh position={[0, 0, -0.32]} rotation={[Math.PI / 2, 0, 0]} material={M.darkSteel()}>
          <cylinderGeometry args={[0.08, 0.085, 0.04, 28]} />
        </mesh>
        <RoundedBox args={[0.09, 0.06, 0.1]} radius={0.01} position={[0, 0.12, -0.16]} material={M.paint('#1e40af')} />
      </group>

      {/* 비상정지 */}
      <group position={[-L / 2 + 0.3, 0, W / 2 + 0.1]}>
        <Profile length={1.05} axis="y" position={[0, 0.525, 0]} />
        <EStop position={[0, 1.08, 0.03]} />
      </group>

      {/* 반송 제품 */}
      {showItems && (
        <group ref={items} position={[0, topY + 0.003, 0]}>
          {itemSizes.map(([a, b, c], i) => (
            <mesh key={i} position={[0, b / 2, 0]} material={boxMat} castShadow receiveShadow>
              <boxGeometry args={[a, b, c]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}
