import * as THREE from 'three';
import { brushedTexture, paintRoughness } from './textures';

// 공유 PBR 재질 라이브러리 — 동일 재질은 한 번만 생성해 GPU 비용 최소화
const cache = new Map<string, THREE.Material>();
function get<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.userData.shared = true;
    cache.set(key, m);
  }
  return m;
}

export const M = {
  /** 산업용 도장 강판 (분체도장) */
  paint: (color: string, rough = 0.42) =>
    get(`paint|${color}|${rough}`, () =>
      new THREE.MeshPhysicalMaterial({
        color, roughness: rough, metalness: 0.15, roughnessMap: paintRoughness(),
        clearcoat: 0.35, clearcoatRoughness: 0.35,
      })),
  /** 무광 도장 */
  matte: (color: string) => get(`matte|${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05 })),
  /** 헤어라인 스테인리스 */
  stainless: () =>
    get('stainless', () =>
      new THREE.MeshPhysicalMaterial({
        color: '#c9ced4', metalness: 0.92, roughness: 0.3, roughnessMap: brushedTexture(),
        anisotropy: 0.5, envMapIntensity: 1,
      })),
  /** 경판/돔용 스테인리스 (브러시 결 없음) */
  stainlessSmooth: () =>
    get('stainlessSmooth', () => new THREE.MeshStandardMaterial({ color: '#c3c8ce', metalness: 0.9, roughness: 0.26 })),
  /** 알루미늄 압출 프로파일 (아노다이징) */
  aluminum: () =>
    get('aluminum', () =>
      new THREE.MeshPhysicalMaterial({ color: '#c3c8ce', metalness: 0.9, roughness: 0.38, roughnessMap: brushedTexture() })),
  /** 크롬 도금 */
  chrome: () => get('chrome', () => new THREE.MeshStandardMaterial({ color: '#f1f5f9', metalness: 1, roughness: 0.08 })),
  /** 흑색 산화/주물 */
  darkSteel: () => get('darkSteel', () => new THREE.MeshStandardMaterial({ color: '#2b2f36', metalness: 0.7, roughness: 0.5 })),
  /** 주철 (펌프 케이싱) */
  castIron: (color = '#3f4c5f') => get(`cast|${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.62, roughnessMap: paintRoughness() })),
  rubber: () => get('rubber', () => new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.92, metalness: 0 })),
  plastic: (color: string) => get(`plastic|${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 })),
  /** 투명 강화유리 / 폴리카보네이트 */
  glass: (tint = '#dbeafe') =>
    get(`glass|${tint}`, () =>
      new THREE.MeshPhysicalMaterial({
        color: tint, metalness: 0, roughness: 0.05, transmission: 0.92, thickness: 0.02, ior: 1.5,
        transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide,
      })),
  /** 화면/표시등 등 자체발광 (Bloom 대상) */
  emissive: (color: string, intensity = 2) =>
    new THREE.MeshStandardMaterial({ color: '#111', emissive: color, emissiveIntensity: intensity, toneMapped: false }),
  brass: () => get('brass', () => new THREE.MeshStandardMaterial({ color: '#c8a24a', metalness: 1, roughness: 0.3 })),
};

// ── 렌더 모드 오버라이드 재질 ───────────────────────────
export const CAD_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#e8ecf1', roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
});
export const CAD_EDGE_MATERIAL = new THREE.LineBasicMaterial({ color: '#334155', transparent: true, opacity: 0.85 });

const xrayCache = new Map<string, THREE.Material>();
export function xrayMaterial(color: string) {
  let m = xrayCache.get(color);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV;
        #include <clipping_planes_pars_vertex>
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          #include <clipping_planes_vertex>
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
        #include <clipping_planes_pars_fragment>
        void main(){
          #include <clipping_planes_fragment>
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          gl_FragColor = vec4(uColor * (0.6 + f * 1.6), 0.06 + f * 0.6);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      clipping: true,
    });
    xrayCache.set(color, m);
  }
  return m;
}

const statusCache = new Map<string, THREE.Material>();
export function statusMaterial(color: string) {
  let m = statusCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.6, metalness: 0.1 });
    statusCache.set(color, m);
  }
  return m;
}

export const ALL_OVERRIDE_MATERIALS = () => [CAD_MATERIAL, ...xrayCache.values(), ...statusCache.values()];
