import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { M } from '../materials';
import { BoltCircle, Flange } from '../parts';
import { labelTexture } from '../textures';
import { bool, num, roleValue } from '../../store/useTwin';
import type { ModelProps } from './types';

/** 접시형(토리구형) 경판 단면 */
function headProfile(r: number, depth: number, segments = 16) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = (t * Math.PI) / 2;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * depth));
  }
  pts[pts.length - 1].x = 0.0001;
  return pts;
}

export function Tank({ eq }: ModelProps) {
  const r = Number(eq.params.radius ?? 0.9);
  const h = Number(eq.params.height ?? 2.4);
  const liquidColor = String(eq.params.liquidColor ?? '#38bdf8');
  const legH = Math.max(0.35, r * 0.45);
  const headD = r * 0.35;
  const y0 = legH + headD; // 동체 하단
  const y1 = y0 + h; // 동체 상단

  const headGeo = useMemo(() => new THREE.LatheGeometry(headProfile(r, headD), 48), [r, headD]);
  const liquidMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: liquidColor, roughness: 0.1, transmission: 0.3, transparent: true, opacity: 0.85, emissive: liquidColor, emissiveIntensity: 0.15 }),
    [liquidColor],
  );
  const gaugeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: liquidColor, emissive: liquidColor, emissiveIntensity: 0.6, roughness: 0.3 }), [liquidColor]);
  const plate = useMemo(() => labelTexture(eq.id, { bg: '#0f172a', fg: '#e2e8f0', w: 256, h: 80 }), [eq.id]);

  const liquid = useRef<THREE.Mesh>(null);
  const gauge = useRef<THREE.Mesh>(null);
  const agitator = useRef<THREE.Group>(null);
  const lvl = useRef(0.5);

  useFrame((_, dt) => {
    const target = THREE.MathUtils.clamp(num(roleValue(eq, 'level'), 50) / 100, 0, 1);
    lvl.current += (target - lvl.current) * Math.min(1, dt * 2);
    const L = Math.max(0.001, lvl.current);
    if (liquid.current) {
      liquid.current.scale.y = L;
      liquid.current.position.y = y0 + (h * L) / 2;
    }
    if (gauge.current) {
      gauge.current.scale.y = L;
      gauge.current.position.y = y0 + 0.1 + ((h - 0.2) * L) / 2;
    }
    if (agitator.current && bool(roleValue(eq, 'agitator'), true)) agitator.current.rotation.y += dt * 3;
  });

  const legs = 4;
  const ladderX = r + 0.28;
  const rungs = Math.floor((y1 + headD) / 0.3);

  return (
    <group>
      {/* 다리 + 베이스 플레이트 */}
      {Array.from({ length: legs }, (_, i) => {
        const a = (i / legs) * Math.PI * 2 + Math.PI / 4;
        const x = Math.cos(a) * r * 0.82, z = Math.sin(a) * r * 0.82;
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, (y0 - headD * 0.3) / 2, 0]} material={M.stainless()} castShadow>
              <cylinderGeometry args={[0.045, 0.045, y0 - headD * 0.3, 16]} />
            </mesh>
            <mesh position={[0, 0.01, 0]} material={M.stainless()} castShadow receiveShadow>
              <boxGeometry args={[0.18, 0.02, 0.18]} />
            </mesh>
            <BoltCircle r={0.065} count={4} size={0.01} y={0.02} />
          </group>
        );
      })}
      {/* 하부 경판 */}
      <mesh geometry={headGeo} position={[0, y0, 0]} rotation={[Math.PI, 0, 0]} material={M.stainlessSmooth()} castShadow receiveShadow />
      {/* 동체 */}
      <mesh position={[0, y0 + h / 2, 0]} material={M.stainless()} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, h, 64, 1, true]} />
      </mesh>
      {/* 보강 링 */}
      {[0.02, 0.5, 0.98].map((t) => (
        <mesh key={t} position={[0, y0 + h * t, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.stainless()} castShadow>
          <torusGeometry args={[r + 0.005, 0.018, 8, 64]} />
        </mesh>
      ))}
      {/* 상부 경판 */}
      <mesh geometry={headGeo} position={[0, y1, 0]} material={M.stainlessSmooth()} castShadow />
      {/* 내부 액체 (X-ray / 단면 보기 시 보임) */}
      <mesh ref={liquid} material={liquidMat} userData={{ keepMaterial: true }}>
        <cylinderGeometry args={[r * 0.985, r * 0.985, h, 48]} />
      </mesh>

      {/* 맨홀 + 교반기 모터 */}
      <group position={[r * 0.45, y1 + headD * 0.75, 0]}>
        <mesh material={M.stainless()} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.16, 32]} />
        </mesh>
        <BoltCircle r={0.19} count={12} size={0.012} y={0.08} />
      </group>
      <group position={[0, y1 + headD, 0]}>
        <mesh position={[0, 0.06, 0]} material={M.stainless()} castShadow>
          <cylinderGeometry args={[0.14, 0.16, 0.12, 28]} />
        </mesh>
        <group ref={agitator} position={[0, 0.12, 0]}>
          <mesh position={[0, 0.06, 0]} material={M.darkSteel()}>
            <cylinderGeometry args={[0.035, 0.035, 0.12, 12]} />
          </mesh>
          <mesh position={[0.03, 0.06, 0]} material={M.paint('#facc15')}>
            <boxGeometry args={[0.012, 0.1, 0.012]} />
          </mesh>
        </group>
        <mesh position={[0, 0.38, 0]} material={M.paint('#1d4ed8')} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.3, 28]} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[0, 0.27 + i * 0.04, 0]} material={M.paint('#1e3a8a')}>
            <cylinderGeometry args={[0.12, 0.12, 0.01, 28]} />
          </mesh>
        ))}
        <mesh position={[0, 0.56, 0]} material={M.darkSteel()}>
          <cylinderGeometry args={[0.1, 0.11, 0.06, 28]} />
        </mesh>
      </group>

      {/* 사이트 글라스 레벨 게이지 */}
      <group position={[0, 0, -(r + 0.07)]}>
        <mesh position={[0, y0 + h / 2, 0]} material={M.glass('#e0f2fe')} userData={{ keepMaterial: true }}>
          <cylinderGeometry args={[0.025, 0.025, h - 0.15, 12]} />
        </mesh>
        <mesh ref={gauge} material={gaugeMat} userData={{ keepMaterial: true }}>
          <cylinderGeometry args={[0.018, 0.018, h - 0.2, 10]} />
        </mesh>
        {[y0 + 0.05, y1 - 0.05].map((y) => (
          <mesh key={y} position={[0, y, 0.035]} rotation={[Math.PI / 2, 0, 0]} material={M.stainless()}>
            <cylinderGeometry args={[0.02, 0.02, 0.07, 10]} />
          </mesh>
        ))}
      </group>

      {/* 명판 */}
      <mesh position={[0, y0 + h * 0.72, r + 0.002]} userData={{ keepMaterial: true }}>
        <planeGeometry args={[0.6, 0.19]} />
        <meshStandardMaterial map={plate} roughness={0.4} metalness={0.2} />
      </mesh>
      {/* 온도 센서 (RTD) */}
      <group position={[r * 0.7, y0 + h * 0.3, r * 0.7]} rotation={[0, -Math.PI / 4, 0]}>
        <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]} material={M.stainless()}>
          <cylinderGeometry args={[0.012, 0.012, 0.12, 8]} />
        </mesh>
        <mesh position={[0, 0, 0.14]} material={M.plastic('#334155')}>
          <cylinderGeometry args={[0.04, 0.04, 0.06, 16]} />
        </mesh>
      </group>

      {/* 하부 출구 노즐 */}
      <group position={[0, legH * 0.8, 0]}>
        <mesh position={[0, headD * 0.2, 0]} material={M.stainless()}>
          <cylinderGeometry args={[0.05, 0.05, headD * 0.6, 16]} />
        </mesh>
      </group>
      <mesh position={[r * 0.5 + 0.05, 0.42, 0]} rotation={[0, 0, Math.PI / 2]} material={M.stainless()}>
        <cylinderGeometry args={[0.06, 0.06, r, 16]} />
      </mesh>
      <Flange r={0.06} position={[r + 0.08, 0.42, 0]} axis="x" />

      {/* 사다리 */}
      <group position={[ladderX, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} position={[x, (y1 + headD) / 2, 0]} material={M.paint('#facc15', 0.5)} castShadow>
            <boxGeometry args={[0.05, y1 + headD, 0.02]} />
          </mesh>
        ))}
        {Array.from({ length: rungs }, (_, i) => (
          <mesh key={i} position={[0, 0.25 + i * 0.3, 0]} rotation={[0, 0, Math.PI / 2]} material={M.darkSteel()} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.44, 8]} />
          </mesh>
        ))}
      </group>
      {/* 상부 핸드레일 */}
      <group position={[0, y1 + headD * 0.3, 0]}>
        <mesh position={[0, 0.9, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.paint('#facc15', 0.5)} castShadow>
          <torusGeometry args={[r * 0.9, 0.018, 8, 64, Math.PI * 1.6]} />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 6) * Math.PI * 1.6;
          return (
            <mesh key={i} position={[Math.cos(a) * r * 0.9, 0.45, Math.sin(a) * r * 0.9]} material={M.paint('#facc15', 0.5)}>
              <cylinderGeometry args={[0.014, 0.014, 0.9, 8]} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
