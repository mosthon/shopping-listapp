import * as THREE from 'three';
import { useMemo } from 'react';
import { M } from './materials';
import { hazardTexture } from './textures';

// ─────────────────────────────────────────────────────────
//  재사용 CAD 부품 — 알루미늄 프로파일, H빔, 플랜지, 볼트, 레벨링 풋 등
// ─────────────────────────────────────────────────────────

const geoCache = new Map<string, THREE.BufferGeometry>();
function g<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let x = geoCache.get(key) as T | undefined;
  if (!x) {
    x = make();
    geoCache.set(key, x);
  }
  return x;
}

/** T-슬롯 알루미늄 프로파일 단면 (w × h, 단위 m) — Z 방향으로 1m 압출 */
function tSlotShape(w: number, h: number) {
  const s = new THREE.Shape();
  const slot = Math.min(w, h) * 0.2; // 슬롯 개구 폭
  const depth = Math.min(w, h) * 0.18;
  const x0 = -w / 2, y0 = -h / 2;
  const r = Math.min(w, h) * 0.06;
  s.moveTo(x0 + r, y0);
  const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number, count: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    for (let i = 0; i < count; i++) {
      const c = (len / count) * (i + 0.5);
      const p1 = c - slot / 2, p2 = c + slot / 2;
      s.lineTo(ax + ux * p1, ay + uy * p1);
      s.lineTo(ax + ux * p1 + nx * depth, ay + uy * p1 + ny * depth);
      s.lineTo(ax + ux * (p1 - slot * 0.3) + nx * depth * 1.5, ay + uy * (p1 - slot * 0.3) + ny * depth * 1.5);
      s.lineTo(ax + ux * (p2 + slot * 0.3) + nx * depth * 1.5, ay + uy * (p2 + slot * 0.3) + ny * depth * 1.5);
      s.lineTo(ax + ux * p2 + nx * depth, ay + uy * p2 + ny * depth);
      s.lineTo(ax + ux * p2, ay + uy * p2);
    }
    s.lineTo(bx, by);
  };
  const nW = Math.max(1, Math.round(w / Math.min(w, h)));
  const nH = Math.max(1, Math.round(h / Math.min(w, h)));
  edge(x0 + r, y0, x0 + w - r, y0, 0, 1, nW);
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  edge(x0 + w, y0 + r, x0 + w, y0 + h - r, -1, 0, nH);
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  edge(x0 + w - r, y0 + h, x0 + r, y0 + h, 0, -1, nW);
  s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  edge(x0, y0 + h - r, x0, y0 + r, 1, 0, nH);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  // 중심 구멍
  const hole = new THREE.Path();
  hole.absarc(0, 0, Math.min(w, h) * 0.12, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

export function profileGeometry(w: number, h: number) {
  return g(`prof|${w}|${h}`, () => {
    const geo = new THREE.ExtrudeGeometry(tSlotShape(w, h), { depth: 1, bevelEnabled: false, curveSegments: 3 });
    geo.translate(0, 0, -0.5);
    geo.computeVertexNormals();
    return geo;
  });
}

/** T-슬롯 알루미늄 프로파일. axis 방향으로 length 만큼 */
export function Profile({
  length, w = 0.04, h = 0.04, axis = 'x', position, rotation,
}: {
  length: number; w?: number; h?: number; axis?: 'x' | 'y' | 'z';
  position?: [number, number, number]; rotation?: [number, number, number];
}) {
  const rot: [number, number, number] = axis === 'x' ? [0, Math.PI / 2, 0] : axis === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={profileGeometry(w, h)} material={M.aluminum()} rotation={rot} scale={[1, 1, length]} castShadow receiveShadow />
    </group>
  );
}

/** H 형강 (건물 기둥) */
export function hBeamGeometry(b: number, d: number, tw: number, tf: number) {
  return g(`hbeam|${b}|${d}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-b / 2, -d / 2);
    s.lineTo(b / 2, -d / 2);
    s.lineTo(b / 2, -d / 2 + tf);
    s.lineTo(tw / 2, -d / 2 + tf);
    s.lineTo(tw / 2, d / 2 - tf);
    s.lineTo(b / 2, d / 2 - tf);
    s.lineTo(b / 2, d / 2);
    s.lineTo(-b / 2, d / 2);
    s.lineTo(-b / 2, d / 2 - tf);
    s.lineTo(-tw / 2, d / 2 - tf);
    s.lineTo(-tw / 2, -d / 2 + tf);
    s.lineTo(-b / 2, -d / 2 + tf);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  });
}

/** 볼트 원 배치 (플랜지/베이스) */
export function BoltCircle({ r, count, size = 0.012, y = 0 }: { r: number; count: number; size?: number; y?: number }) {
  const pts = useMemo(() => Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2), [count]);
  return (
    <group position={[0, y, 0]}>
      {pts.map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * r, size * 0.5, Math.sin(a) * r]} material={M.darkSteel()} castShadow>
          <cylinderGeometry args={[size, size, size, 6]} />
        </mesh>
      ))}
    </group>
  );
}

/** 배관 플랜지 (axis: 배관 방향) */
export function Flange({ r, position, axis = 'x', thickness = 0.025 }: { r: number; position: [number, number, number]; axis?: 'x' | 'y' | 'z'; thickness?: number }) {
  const rot: [number, number, number] = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <group position={position} rotation={rot}>
      <mesh material={M.castIron('#4b5563')} castShadow>
        <cylinderGeometry args={[r * 1.9, r * 1.9, thickness, 28]} />
      </mesh>
      <BoltCircle r={r * 1.55} count={8} size={r * 0.16} y={thickness / 2} />
    </group>
  );
}

/** 레벨링 풋 (고무 패드 + 나사봉) */
export function LevelingFoot({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.008, 0]} material={M.rubber()} castShadow receiveShadow>
        <cylinderGeometry args={[0.04, 0.045, 0.016, 20]} />
      </mesh>
      <mesh position={[0, 0.03, 0]} material={M.chrome()} castShadow>
        <cylinderGeometry args={[0.008, 0.008, 0.04, 8]} />
      </mesh>
      <mesh position={[0, 0.022, 0]} material={M.darkSteel()}>
        <cylinderGeometry args={[0.016, 0.016, 0.01, 6]} />
      </mesh>
    </group>
  );
}

/** 바닥 안전 표시 (노랑/검정 사선 테이프) — 사각 영역 외곽 */
export function HazardFrame({ w, d, t = 0.08, y = 0.003 }: { w: number; d: number; t?: number; y?: number }) {
  const mat = useMemo(() => {
    const tex = hazardTexture().clone();
    tex.needsUpdate = true;
    return tex;
  }, []);
  const strip = (len: number, pos: [number, number, number], rotY: number, key: string) => {
    const tx = mat.clone();
    tx.repeat.set(len / 0.5, 1);
    tx.needsUpdate = true;
    return (
      <mesh key={key} position={pos} rotation={[-Math.PI / 2, 0, rotY]} receiveShadow userData={{ keepMaterial: true }}>
        <planeGeometry args={[len, t]} />
        <meshStandardMaterial map={tx} roughness={0.6} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    );
  };
  return (
    <group>
      {strip(w, [0, y, -d / 2], 0, 'a')}
      {strip(w, [0, y, d / 2], 0, 'b')}
      {strip(d, [-w / 2, y, 0], Math.PI / 2, 'c')}
      {strip(d, [w / 2, y, 0], Math.PI / 2, 'd')}
    </group>
  );
}

/** 비상정지 버튼 박스 */
export function EStop({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh material={M.plastic('#facc15')} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.06]} />
      </mesh>
      <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]} material={M.plastic('#dc2626')} castShadow>
        <cylinderGeometry args={[0.028, 0.022, 0.025, 20]} />
      </mesh>
    </group>
  );
}
