import * as THREE from 'three';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, TransformControls } from '@react-three/drei';
import { Select } from '@react-three/postprocessing';
import { MODELS, labelHeight } from './models';
import { CAD_EDGE_MATERIAL, CAD_MATERIAL, ALL_OVERRIDE_MATERIALS, statusMaterial, xrayMaterial } from './materials';
import { CLIP_PLANES } from './clipping';
import { STATUS_META, computeStatus, getTag, useTwin } from '../store/useTwin';
import { CATALOG } from '../config/catalog';
import type { Equipment, EquipmentStatus } from '../types';
import type { RenderMode } from '../store/useTwin';

const D2R = Math.PI / 180;
const edgeCache = new Map<string, THREE.EdgesGeometry>();
const noRaycast = () => null;

/** 렌더 모드(실사/CAD/X-ray/상태색) 재질 교체 + 단면 클리핑 적용 */
function applyMaterials(root: THREE.Object3D, mode: RenderMode, status: EquipmentStatus, clip: boolean) {
  const overrides = new Set<THREE.Material>(ALL_OVERRIDE_MATERIALS());
  const color = STATUS_META[status].color;
  root.traverse((o) => {
    if (o.userData.isEdge) {
      o.visible = mode === 'cad';
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.userData.keepMaterial) {
      const cur = m.material as THREE.Material;
      if (!overrides.has(cur)) m.userData.realMat = cur;
      const real = m.userData.realMat as THREE.Material;
      let next: THREE.Material = real;
      if (mode === 'cad') next = CAD_MATERIAL;
      else if (mode === 'xray') next = xrayMaterial(color);
      else if (mode === 'status') next = statusMaterial(color);
      if (m.material !== next) m.material = next;

      if (mode === 'cad' && !m.userData.edges && m.geometry) {
        const key = m.geometry.uuid;
        let eg = edgeCache.get(key);
        if (!eg) {
          eg = new THREE.EdgesGeometry(m.geometry, 28);
          edgeCache.set(key, eg);
        }
        const line = new THREE.LineSegments(eg, CAD_EDGE_MATERIAL);
        line.userData.isEdge = true;
        line.raycast = noRaycast;
        m.add(line);
        m.userData.edges = line;
      }
    }
    // 단면 클리핑
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const want = clip ? CLIP_PLANES : null;
      if (mat.clippingPlanes !== want) {
        mat.clippingPlanes = want;
        mat.clipShadows = true;
        mat.needsUpdate = true;
      }
    }
  });
  for (const mat of [CAD_EDGE_MATERIAL]) {
    const want = clip ? CLIP_PLANES : null;
    if (mat.clippingPlanes !== want) {
      mat.clippingPlanes = want;
      mat.needsUpdate = true;
    }
  }
}

function useStatus(eq: Equipment): EquipmentStatus {
  return useTwin((s) => computeStatus(eq, s));
}

const PRIMARY_ROLE: Partial<Record<Equipment['type'], string[]>> = {
  conveyor: ['speed', 'count'],
  robot: ['j1', 'gripper'],
  tank: ['level', 'temp'],
  pump: ['pressure', 'rpm'],
  valve: ['position'],
  cnc: ['spindle', 'progress'],
  cabinet: ['cpu'],
  agv: ['battery', 'progress'],
  pipe: ['flow'],
  imported: ['run'],
};

function LabelValue({ tagId }: { tagId: string }) {
  const v = useTwin((s) => s.values[tagId]);
  const tag = useTwin((s) => getTag(s.plant, tagId));
  if (!tag) return null;
  let text: string;
  if (typeof v === 'number') text = v.toFixed(tag.decimals ?? 1);
  else if (typeof v === 'boolean') text = v ? 'ON' : 'OFF';
  else text = v === undefined ? '—' : String(v);
  const role = tag.name.split(' ').slice(-1)[0];
  return (
    <div className="lbl-row">
      <span>{role}</span>
      <b>
        {text}
        {tag.unit && typeof v === 'number' ? <small> {tag.unit}</small> : null}
      </b>
    </div>
  );
}

function labelAnchor(eq: Equipment): [number, number, number] {
  if (eq.type === 'pipe') {
    const pts = (eq.params.points as number[][]) ?? [[0, 0, 0]];
    const mid = pts[Math.floor(pts.length / 2)];
    return [mid[0], mid[1] + 0.5, mid[2]];
  }
  if (eq.type === 'agv') return [0, 1, Number(eq.params.pathD ?? 4) / 2];
  return [0, labelHeight(eq.type, eq.params), 0];
}

/** 상태 링 (알람/선택 시 바닥에 표시) */
function StatusRing({ radius, color, pulse }: { radius: number; color: string; pulse: boolean }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false }), [color]);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const k = pulse ? 1 + (Math.sin(clock.elapsedTime * 5) + 1) * 0.04 : 1;
    ref.current.scale.setScalar(k);
    mat.opacity = pulse ? 0.45 + (Math.sin(clock.elapsedTime * 5) + 1) * 0.25 : 0.65;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} material={mat} userData={{ keepMaterial: true }} raycast={noRaycast}>
      <ringGeometry args={[radius, radius + 0.08, 64]} />
    </mesh>
  );
}

export const EquipmentNode = memo(function EquipmentNode({ eq }: { eq: Equipment }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const status = useStatus(eq);
  const selected = useTwin((s) => s.selectedId === eq.id);
  const hovered = useTwin((s) => s.hoveredId === eq.id);
  const selectedRef = useRef(selected);
  const hoveredRef = useRef(hovered);
  selectedRef.current = selected;
  hoveredRef.current = hovered;
  const renderMode = useTwin((s) => s.ui.renderMode);
  const showLabels = useTwin((s) => s.ui.labels);
  const editMode = useTwin((s) => s.ui.editMode);
  const transformMode = useTwin((s) => s.ui.transformMode);
  const snap = useTwin((s) => s.ui.snap);
  const clip = useTwin((s) => s.ui.clip.enabled);
  const [footprint, setFootprint] = useState(1);
  const [target, setTarget] = useState<THREE.Group | null>(null);
  const Model = MODELS[eq.type];

  // 재질/클리핑 적용 (모델 비동기 로딩 대비 주기 재적용)
  useEffect(() => {
    if (!inner.current) return;
    applyMaterials(inner.current, renderMode, status, clip);
  }, [renderMode, status, clip, eq]);
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 1 && inner.current) {
      acc.current = 0;
      if (renderMode !== 'real' || clip) applyMaterials(inner.current, renderMode, status, clip);
    }
  });

  // 풋프린트 계산 (상태 링 반경)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!inner.current) return;
      const box = new THREE.Box3().setFromObject(inner.current);
      if (box.isEmpty()) return;
      const s = box.getSize(new THREE.Vector3());
      setFootprint(Math.min(4, Math.max(s.x, s.z) / 2 / (eq.scale ?? 1) + 0.25));
    }, 300);
    return () => clearTimeout(t);
  }, [eq.params, eq.type, eq.scale, eq.assetId]);

  useEffect(() => setTarget(outer.current), []);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useTwin.getState().select(eq.id);
  };
  const onDouble = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useTwin.getState().select(eq.id);
    useTwin.getState().focus(eq.id);
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useTwin.getState().hover(eq.id);
    document.body.style.cursor = 'pointer';
  };
  const onOut = () => {
    if (useTwin.getState().hoveredId === eq.id) useTwin.getState().hover(null);
    document.body.style.cursor = '';
  };

  const commit = () => {
    const o = outer.current;
    if (!o) return;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    useTwin.getState().updateEquipment(eq.id, {
      position: [r(o.position.x), r(o.position.y), r(o.position.z)],
      rotation: [r(o.rotation.x / D2R), r(o.rotation.y / D2R), r(o.rotation.z / D2R)],
    });
  };

  const ringable = !['pipe', 'agv', 'valve', 'stacklight', 'conveyor'].includes(eq.type);
  const showRing = ringable && (selected || status === 'alarm' || status === 'warning');
  const ringColor = selected ? '#22d3ee' : STATUS_META[status].color;
  const roles = PRIMARY_ROLE[eq.type] ?? [];
  const labelTags = roles.map((r) => eq.bindings[r]).filter(Boolean);
  const anchor = labelAnchor(eq);
  const hasLabel = eq.type !== 'stacklight';
  const labelVisible = useRef(false);
  labelVisible.current = showLabels || hovered || selected;
  const labelEl = useRef<HTMLDivElement>(null);
  const anchorV = useMemo(() => new THREE.Vector3(), []);
  // 라벨: 마운트 유지 + DOM 직접 토글 (멀리 있는 라벨은 자동 숨김)
  useFrame(({ camera }) => {
    const el = labelEl.current;
    if (!el || !outer.current) return;
    anchorV.set(anchor[0], anchor[1], anchor[2]);
    outer.current.localToWorld(anchorV);
    const d = camera.position.distanceTo(anchorV);
    const force = hoveredRef.current || selectedRef.current;
    const show = labelVisible.current && (force || d < 42);
    const disp = show ? '' : 'none';
    if (el.style.display !== disp) el.style.display = disp;
    const sc = force ? 1 : THREE.MathUtils.clamp(1.25 - d / 60, 0.62, 1);
    el.style.setProperty('--lbl-scale', sc.toFixed(2));
  });

  return (
    <>
      <group
        ref={outer}
        name={`eq:${eq.id}`}
        position={eq.position}
        rotation={[eq.rotation[0] * D2R, eq.rotation[1] * D2R, eq.rotation[2] * D2R]}
        scale={eq.scale ?? 1}
        onClick={onClick}
        onDoubleClick={onDouble}
        onPointerOver={onOver}
        onPointerOut={onOut}
      >
        <Select enabled={selected || hovered}>
          <group ref={inner}>
            <Model eq={eq} status={status} />
          </group>
        </Select>
        {showRing && <StatusRing radius={footprint} color={ringColor} pulse={!selected && status === 'alarm'} />}
        {hasLabel && (
          <Html position={anchor} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div ref={labelEl} style={{ display: 'none' }} className={`eq-label st-${status} ${selected ? 'sel' : ''}`}>
              <div className="lbl-head">
                <i style={{ background: STATUS_META[status].color }} />
                <span>{eq.name}</span>
              </div>
              <div className="lbl-sub">
                {CATALOG[eq.type].label} · {STATUS_META[status].label}
              </div>
              {labelTags.map((t) => (
                <LabelValue key={t} tagId={t} />
              ))}
            </div>
          </Html>
        )}
      </group>
      {editMode && selected && target && (
        <TransformControls
          object={target}
          mode={transformMode}
          translationSnap={snap ? 0.1 : null}
          rotationSnap={snap ? 15 * D2R : null}
          showX={transformMode === 'translate'}
          showZ={transformMode === 'translate'}
          showY
          size={0.8}
          onMouseUp={commit}
        />
      )}
    </>
  );
});
