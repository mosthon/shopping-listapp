import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { M } from '../materials';
import { Flange } from '../parts';
import { flowTexture } from '../textures';
import { num, roleValue, useTwin } from '../../store/useTwin';
import type { ModelProps } from './types';

/** 꺾임점을 굽힘 반경으로 라운딩한 배관 경로 */
export function pipePath(points: number[][], bend: number) {
  const pts = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const path = new THREE.CurvePath<THREE.Vector3>();
  if (pts.length < 2) return path;
  let cur = pts[0].clone();
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], c = pts[i], next = pts[i + 1];
    const dIn = c.clone().sub(prev);
    const dOut = next.clone().sub(c);
    const r = Math.min(bend, dIn.length() / 2, dOut.length() / 2);
    dIn.normalize();
    dOut.normalize();
    const a = c.clone().addScaledVector(dIn, -r);
    const b = c.clone().addScaledVector(dOut, r);
    if (cur.distanceTo(a) > 1e-4) path.add(new THREE.LineCurve3(cur, a));
    path.add(new THREE.QuadraticBezierCurve3(a, c.clone(), b));
    cur = b;
  }
  path.add(new THREE.LineCurve3(cur, pts[pts.length - 1].clone()));
  return path;
}

export function Pipe({ eq }: ModelProps) {
  const pts = (eq.params.points as number[][]) ?? [[0, 0, 0], [1, 0, 0]];
  const r = Number(eq.params.radius ?? 0.06);
  const color = String(eq.params.color ?? '#9ca3af');
  const key = JSON.stringify(pts);

  const { geo, flowGeo, flowMat, supports } = useMemo(() => {
    const path = pipePath(pts, r * 4);
    const length = path.getLength();
    const seg = Math.max(8, Math.ceil(length * 12) + pts.length * 12);
    const geo = new THREE.TubeGeometry(path as unknown as THREE.Curve<THREE.Vector3>, seg, r, 20, false);
    const flowGeo = new THREE.TubeGeometry(path as unknown as THREE.Curve<THREE.Vector3>, seg, r * 1.06, 12, false);
    const tex = flowTexture().clone();
    tex.repeat.set(length / 0.45, 1);
    tex.needsUpdate = true;
    const flowMat = new THREE.MeshBasicMaterial({
      color: '#67e8f9', alphaMap: tex, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false,
    });
    // 배관 서포트: 높은 수평 구간은 기둥, 낮은 구간은 슈
    const supports: { p: THREE.Vector3; h: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = new THREE.Vector3(...(pts[i] as [number, number, number]));
      const b = new THREE.Vector3(...(pts[i + 1] as [number, number, number]));
      if (Math.abs(a.y - b.y) > 0.01) continue;
      const L = a.distanceTo(b);
      const n = Math.floor(L / 3);
      for (let k = 1; k <= n; k++) {
        const p = a.clone().lerp(b, k / (n + 1));
        supports.push({ p, h: p.y - r });
      }
    }
    return { geo, flowGeo, flowMat, supports };
  }, [key, r]);

  const flowRef = useRef<THREE.Mesh>(null);
  const off = useRef(0);
  useFrame((_, dt) => {
    const f = num(roleValue(eq, 'flow'), 10);
    const show = useTwin.getState().ui.renderMode !== 'cad' && f > 0.1;
    if (flowRef.current) flowRef.current.visible = show;
    off.current -= (f / 20) * dt;
    flowMat.alphaMap!.offset.x = off.current;
  });

  const first = pts[0], last = pts[pts.length - 1];
  const dirOf = (a: number[], b: number[]): 'x' | 'y' | 'z' => {
    const d = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])];
    return d[0] >= d[1] && d[0] >= d[2] ? 'x' : d[1] >= d[2] ? 'y' : 'z';
  };
  return (
    <group>
      <mesh geometry={geo} material={M.paint(color, 0.35)} castShadow receiveShadow />
      <mesh ref={flowRef} geometry={flowGeo} material={flowMat} userData={{ keepMaterial: true, noPick: true }} />
      {pts.length >= 2 && (
        <>
          <Flange r={r} position={first as [number, number, number]} axis={dirOf(first, pts[1])} thickness={0.02} />
          <Flange r={r} position={last as [number, number, number]} axis={dirOf(pts[pts.length - 2], last)} thickness={0.02} />
        </>
      )}
      {supports.map(({ p, h }, i) =>
        h > 1 ? (
          <group key={i} position={[p.x, 0, p.z]}>
            <mesh position={[0, h / 2, 0]} material={M.paint('#475569')} castShadow>
              <boxGeometry args={[0.08, h, 0.08]} />
            </mesh>
            <mesh position={[0, h - 0.01, 0]} material={M.paint('#475569')}>
              <boxGeometry args={[0.1, 0.03, r * 3]} />
            </mesh>
            <mesh position={[0, 0.01, 0]} material={M.darkSteel()}>
              <boxGeometry args={[0.2, 0.02, 0.2]} />
            </mesh>
          </group>
        ) : (
          <mesh key={i} position={[p.x, h / 2, p.z]} material={M.paint('#475569')} castShadow>
            <boxGeometry args={[0.06, h, r * 2.4]} />
          </mesh>
        ),
      )}
    </group>
  );
}
