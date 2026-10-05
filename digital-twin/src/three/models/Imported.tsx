import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { create } from 'zustand';
import { M } from '../materials';
import { parseAsset, nodeNames } from '../loaders';
import { getAsset } from '../../utils/assets';
import { num, useTwin } from '../../store/useTwin';
import type { ModelProps } from './types';

/** 임포트 모델의 노드 목록/로딩 상태 (UI 공유) */
export const useImportMeta = create<{ nodes: Record<string, string[]>; status: Record<string, string> }>(() => ({ nodes: {}, status: {} }));

const D2R = Math.PI / 180;

export function Imported({ eq }: ModelProps) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const unitScale = Number(eq.params.unitScale ?? 1);
  const tint = !!eq.params.tint;
  const color = String(eq.params.color ?? '#94a3b8');

  useEffect(() => {
    let alive = true;
    setObj(null);
    setErr(null);
    if (!eq.assetId) {
      setErr('모델 파일 없음');
      return;
    }
    useImportMeta.setState((s) => ({ status: { ...s.status, [eq.id]: '로딩 중…' } }));
    getAsset(eq.assetId)
      .then(async (rec) => {
        if (!rec) throw new Error('저장소에서 파일을 찾을 수 없음 (다시 임포트 필요)');
        const o = await parseAsset(rec);
        if (!alive) return;
        o.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            m.userData.origMaterial = m.material;
          }
        });
        setObj(o);
        useImportMeta.setState((s) => ({ nodes: { ...s.nodes, [eq.id]: nodeNames(o) }, status: { ...s.status, [eq.id]: 'ok' } }));
      })
      .catch((e: Error) => {
        if (!alive) return;
        setErr(e.message);
        useImportMeta.setState((s) => ({ status: { ...s.status, [eq.id]: e.message } }));
      });
    return () => {
      alive = false;
    };
  }, [eq.assetId, eq.id]);

  // 바닥 중심 정렬 + 단위 변환
  const offset = useMemo(() => {
    if (!obj) return new THREE.Vector3();
    obj.scale.setScalar(1);
    obj.position.set(0, 0, 0);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    return new THREE.Vector3(-c.x, -box.min.y, -c.z);
  }, [obj]);

  useEffect(() => {
    if (!obj) return;
    obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.material = tint ? M.paint(color) : (m.userData.origMaterial as THREE.Material);
    });
  }, [obj, tint, color]);

  // 노드 애니메이션의 기준 자세 저장
  const base = useRef(new Map<string, { p: THREE.Vector3; r: THREE.Euler; vis: boolean }>());
  useEffect(() => {
    base.current.clear();
    if (!obj) return;
    for (const a of eq.animations ?? []) {
      const n = obj.getObjectByName(a.node);
      if (n && !base.current.has(a.node)) base.current.set(a.node, { p: n.position.clone(), r: n.rotation.clone(), vis: n.visible });
    }
  }, [obj, eq.animations]);

  useFrame(() => {
    if (!obj || !eq.animations?.length) return;
    const vals = useTwin.getState().values;
    for (const a of eq.animations) {
      const n = obj.getObjectByName(a.node);
      const b = base.current.get(a.node);
      if (!n || !b) continue;
      const v = num(vals[a.tag]) * a.scale + a.offset;
      if (a.mode === 'rotate') {
        n.rotation.copy(b.r);
        n.rotation[a.axis] = b.r[a.axis] + v * D2R;
      } else if (a.mode === 'translate') {
        n.position.copy(b.p);
        n.position[a.axis] = b.p[a.axis] + v;
      } else if (a.mode === 'visible') {
        n.visible = v > 0.5;
      } else if (a.mode === 'color') {
        n.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) m.material = v > 0.5 ? M.paint('#ef4444') : (m.userData.origMaterial as THREE.Material);
        });
      }
    }
  });

  if (err || !obj) {
    return (
      <group>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={err ? '#7f1d1d' : '#334155'} wireframe />
        </mesh>
      </group>
    );
  }
  return (
    <group scale={unitScale}>
      <primitive object={obj} position={offset} />
    </group>
  );
}
