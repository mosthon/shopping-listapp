import * as THREE from 'three';
import { M } from './materials';
import type { AssetRecord } from '../utils/assets';

/**
 * CAD/메시 파일 → Object3D 변환
 *  - GLB/GLTF, FBX, OBJ, STL, PLY : three.js 로더
 *  - STEP/STP, IGES/IGS          : occt-import-js (OpenCascade WASM, 필요 시에만 로드)
 */
export async function parseAsset(rec: AssetRecord): Promise<THREE.Object3D> {
  const { ext, data } = rec;
  switch (ext) {
    case 'glb':
    case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath(import.meta.env.BASE_URL + 'draco/');
      loader.setDRACOLoader(draco);
      const input = ext === 'gltf' ? new TextDecoder().decode(data) : data;
      const gltf = await loader.parseAsync(input as ArrayBuffer, '');
      return gltf.scene;
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      return new FBXLoader().parse(data, '');
    }
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      const obj = new OBJLoader().parse(new TextDecoder().decode(data));
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = M.paint('#9ca3af');
      });
      return obj;
    }
    case 'stl': {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      const geo = new STLLoader().parse(data);
      geo.computeVertexNormals();
      const hasColor = !!geo.getAttribute('color');
      const mat = hasColor ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }) : M.paint('#9ca3af');
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = rec.name;
      const g = new THREE.Group();
      g.add(mesh);
      return g;
    }
    case 'ply': {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
      const geo = new PLYLoader().parse(data);
      geo.computeVertexNormals();
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geo, geo.getAttribute('color') ? new THREE.MeshStandardMaterial({ vertexColors: true }) : M.paint('#9ca3af')));
      return g;
    }
    case 'step':
    case 'stp':
    case 'iges':
    case 'igs':
      return parseOcct(rec);
    default:
      throw new Error(`지원하지 않는 형식: .${ext}`);
  }
}

interface OcctMesh {
  name?: string;
  color?: [number, number, number];
  attributes: { position: { array: number[] }; normal?: { array: number[] } };
  index: { array: number[] };
  brep_faces?: { first: number; last: number; color: [number, number, number] | null }[];
}
interface OcctResult {
  success: boolean;
  root?: { name: string; meshes: number[]; children: OcctResult['root'][] };
  meshes: OcctMesh[];
}
type OcctModule = {
  ReadStepFile: (b: Uint8Array, p: unknown) => OcctResult;
  ReadIgesFile: (b: Uint8Array, p: unknown) => OcctResult;
};

let occtPromise: Promise<OcctModule> | null = null;
async function getOcct(): Promise<OcctModule> {
  if (!occtPromise) {
    occtPromise = (async () => {
      const [{ default: init }, { default: wasmUrl }] = await Promise.all([
        import('occt-import-js'),
        import('occt-import-js/dist/occt-import-js.wasm?url'),
      ]);
      return (init as (o: unknown) => Promise<OcctModule>)({ locateFile: () => wasmUrl });
    })();
  }
  return occtPromise;
}

async function parseOcct(rec: AssetRecord): Promise<THREE.Object3D> {
  const occt = await getOcct();
  const buf = new Uint8Array(rec.data);
  const params = { linearUnit: 'meter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 };
  const res = rec.ext.startsWith('i') ? occt.ReadIgesFile(buf, params) : occt.ReadStepFile(buf, params);
  if (!res.success) throw new Error('STEP/IGES 변환 실패');
  const meshes = res.meshes.map((m, i) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
    if (m.attributes.normal) geo.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
    geo.setIndex(m.index.array);
    if (!m.attributes.normal) geo.computeVertexNormals();
    const c = m.color ? new THREE.Color(m.color[0], m.color[1], m.color[2]) : new THREE.Color('#a8b0ba');
    const mat = new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.35, roughness: 0.42, clearcoat: 0.2, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = m.name || `part_${i}`;
    return mesh;
  });
  // 어셈블리 트리 복원
  const build = (node: OcctResult['root']): THREE.Object3D => {
    const g = new THREE.Group();
    if (!node) return g;
    g.name = node.name || 'assembly';
    for (const mi of node.meshes) if (meshes[mi]) g.add(meshes[mi]);
    for (const ch of node.children) g.add(build(ch));
    return g;
  };
  const root = res.root ? build(res.root) : new THREE.Group();
  if (!res.root) meshes.forEach((m) => root.add(m));
  return root;
}

/** 노드 이름 목록 (애니메이션 바인딩 UI 용) */
export function nodeNames(obj: THREE.Object3D): string[] {
  const out: string[] = [];
  obj.traverse((o) => {
    if (o.name && o !== obj) out.push(o.name);
  });
  return [...new Set(out)];
}
