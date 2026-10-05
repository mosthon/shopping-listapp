// 태그별 시계열 링 버퍼 (리액트 상태 밖에서 관리 → 고빈도 갱신에도 리렌더 없음)
const CAPACITY = 6000;

interface Ring {
  t: Float64Array;
  v: Float32Array;
  head: number;
  len: number;
}

const rings = new Map<string, Ring>();
let version = 0;

export function pushSample(tagId: string, t: number, v: number) {
  let r = rings.get(tagId);
  if (!r) {
    r = { t: new Float64Array(CAPACITY), v: new Float32Array(CAPACITY), head: 0, len: 0 };
    rings.set(tagId, r);
  }
  r.t[r.head] = t;
  r.v[r.head] = v;
  r.head = (r.head + 1) % CAPACITY;
  if (r.len < CAPACITY) r.len++;
  version++;
}

/** since(ms epoch) 이후 샘플을 시간순으로 순회 */
export function forEachSample(tagId: string, since: number, fn: (t: number, v: number) => void) {
  const r = rings.get(tagId);
  if (!r) return;
  const start = (r.head - r.len + CAPACITY) % CAPACITY;
  for (let i = 0; i < r.len; i++) {
    const k = (start + i) % CAPACITY;
    if (r.t[k] >= since) fn(r.t[k], r.v[k]);
  }
}

export function getSamples(tagId: string, since: number): { t: number[]; v: number[] } {
  const t: number[] = [];
  const v: number[] = [];
  forEachSample(tagId, since, (a, b) => {
    t.push(a);
    v.push(b);
  });
  return { t, v };
}

export function historyVersion() {
  return version;
}

export function clearHistory() {
  rings.clear();
  version++;
}

export function exportCsv(tagIds: string[], since: number): string {
  const rows: string[] = ['timestamp,tag,value'];
  for (const id of tagIds) {
    forEachSample(id, since, (t, v) => rows.push(`${new Date(t).toISOString()},${id},${v}`));
  }
  return rows.join('\n');
}
