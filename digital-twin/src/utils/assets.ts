// CAD 모델 파일 저장소 (IndexedDB) — 대용량 파일도 브라우저에 보존
const DB = 'dt-assets';
const STORE = 'files';

export interface AssetRecord {
  id: string;
  name: string;
  ext: string;
  size: number;
  createdAt: number;
  data: ArrayBuffer;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAsset(file: File): Promise<AssetRecord> {
  const data = await file.arrayBuffer();
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const rec: AssetRecord = {
    id: `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    ext,
    size: file.size,
    createdAt: Date.now(),
    data,
  };
  await tx('readwrite', (s) => s.put(rec));
  return rec;
}

const memo = new Map<string, Promise<AssetRecord | undefined>>();
export function getAsset(id: string): Promise<AssetRecord | undefined> {
  let p = memo.get(id);
  if (!p) {
    p = tx<AssetRecord | undefined>('readonly', (s) => s.get(id) as IDBRequest<AssetRecord | undefined>).catch(() => undefined);
    memo.set(id, p);
  }
  return p;
}

export async function listAssets(): Promise<Omit<AssetRecord, 'data'>[]> {
  const all = await tx<AssetRecord[]>('readonly', (s) => s.getAll() as IDBRequest<AssetRecord[]>).catch(() => []);
  return all.map(({ data: _d, ...r }) => { void _d; return r; });
}

export async function deleteAsset(id: string) {
  memo.delete(id);
  await tx('readwrite', (s) => s.delete(id));
}

export const SUPPORTED_EXT = ['glb', 'gltf', 'stl', 'obj', 'fbx', 'ply', 'step', 'stp', 'iges', 'igs'];
