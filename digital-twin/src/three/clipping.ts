import * as THREE from 'three';

/** 전역 단면(섹션) 평면 — 설비 재질에만 적용되어 바닥/건물은 유지 */
export const CLIP_PLANE = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
export const CLIP_PLANES = [CLIP_PLANE];

export function setClip(axis: 'x' | 'y' | 'z', value: number, flip: boolean) {
  const n = new THREE.Vector3(axis === 'x' ? -1 : 0, axis === 'y' ? -1 : 0, axis === 'z' ? -1 : 0);
  if (flip) n.negate();
  CLIP_PLANE.normal.copy(n);
  CLIP_PLANE.constant = flip ? -value : value;
}
