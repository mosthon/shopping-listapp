import { useTwin, getTag } from '../store/useTwin';
import { Simulator } from './simulator';
import { RestSource, WebSocketSource, type DataSource } from './sources';
import { coerce } from './protocol';
import type { ConnectionDef, TagValue } from '../types';

/**
 * 연결 관리자 — 스토어의 연결 설정을 감시하여 데이터 소스를 생성/재시작하고,
 * 쓰기 요청을 태그의 source 연결로 라우팅한다.
 *  - 활성화된 연결의 태그는 해당 연결이 값을 공급
 *  - 나머지 태그는 시뮬레이션 모드가 켜져 있으면 시뮬레이터가 공급
 */
const sources = new Map<string, { key: string; src: DataSource }>();
let simulator: Simulator | null = null;
let started = false;

// 고빈도 수신값을 프레임 단위로 묶어서 반영
let pending: Record<string, TagValue> = {};
let pendingTs: number | undefined;
let flushScheduled = false;
function queue(vals: Record<string, TagValue>, ts?: number) {
  Object.assign(pending, vals);
  pendingTs = ts ?? pendingTs;
  if (!flushScheduled) {
    flushScheduled = true;
    setTimeout(() => {
      flushScheduled = false;
      const v = pending;
      pending = {};
      useTwin.getState().applyValues(v, pendingTs ?? Date.now());
      pendingTs = undefined;
    }, 50);
  }
}

function connKey(c: ConnectionDef, tagSig: string) {
  return JSON.stringify([c.kind, c.url, c.intervalMs, c.enabled, tagSig]);
}

function simulatedTags() {
  const { plant } = useTwin.getState();
  const active = new Set(plant.connections.filter((c) => c.enabled).map((c) => c.id));
  return plant.tags.filter((t) => !active.has(t.source));
}

function sync() {
  const s = useTwin.getState();
  const { plant } = s;

  for (const c of plant.connections) {
    const tags = plant.tags.filter((t) => t.source === c.id);
    const key = connKey(c, tags.map((t) => `${t.id}@${t.address}:${t.dataType}`).join('|'));
    const cur = sources.get(c.id);
    if (cur && cur.key === key) continue;
    cur?.src.stop();
    sources.delete(c.id);
    if (!c.enabled) {
      s.setConnStatus(c.id, { state: 'disconnected', message: '비활성' });
      continue;
    }
    const cb = {
      onValues: (v: Record<string, TagValue>, ts?: number) => {
        queue(v, ts);
        useTwin.getState().setConnStatus(c.id, { lastRx: Date.now() });
      },
      onStatus: (state: import('../types').ConnState, message?: string) => {
        const prev = useTwin.getState().conn[c.id]?.state;
        useTwin.getState().setConnStatus(c.id, { state, message });
        if (prev !== state && (state === 'connected' || state === 'error'))
          useTwin.getState().log(state === 'connected' ? 'conn' : 'error', `${c.name}: ${state === 'connected' ? '연결됨' : message ?? '오류'}`);
      },
      onTraffic: (dir: 'rx' | 'tx') => {
        const st = useTwin.getState().conn[c.id];
        if (st) st[dir]++; // 카운터는 비반응형으로 증가 (UI 는 주기적으로 읽음)
      },
      onLog: (text: string) => useTwin.getState().log('error', text),
    };
    const src = c.kind === 'rest' ? new RestSource(c, tags, cb) : new WebSocketSource(c, tags, cb);
    sources.set(c.id, { key, src });
    src.start();
  }
  // 삭제된 연결 정리
  for (const [id, { src }] of sources) {
    if (!plant.connections.some((c) => c.id === id)) {
      src.stop();
      sources.delete(id);
    }
  }

  if (s.simulation && !simulator) {
    simulator = new Simulator(simulatedTags, (v) => queue(v));
    simulator.start();
  } else if (!s.simulation && simulator) {
    simulator.stop();
    simulator = null;
  }
}

export function startDataManager() {
  if (started) return;
  started = true;
  sync();
  useTwin.subscribe((s, prev) => {
    if (s.plant.connections !== prev.plant.connections || s.plant.tags !== prev.plant.tags || s.simulation !== prev.simulation) sync();
  });
}

/** 태그 쓰기 — 연결된 장치로 전송하거나, 시뮬레이션 중이면 시뮬레이터에 반영 */
export async function writeTag(tagId: string, value: TagValue): Promise<void> {
  const s = useTwin.getState();
  const tag = getTag(s.plant, tagId);
  if (!tag) throw new Error(`알 수 없는 태그: ${tagId}`);
  const v = coerce(tag, value);
  const conn = s.plant.connections.find((c) => c.id === tag.source);
  try {
    if (conn?.enabled) {
      const src = sources.get(conn.id)?.src;
      if (!src) throw new Error(`${conn.name} 연결 없음`);
      await src.write(tag, v);
      s.log('write', `${tag.name} ← ${String(v)} (${conn.name} ${tag.address})`);
    } else if (simulator) {
      simulator.write(tag, v);
      s.log('write', `${tag.name} ← ${String(v)} (시뮬레이션)`);
    } else {
      throw new Error('연결이 비활성화되어 있고 시뮬레이션도 꺼져 있습니다');
    }
  } catch (e) {
    s.log('error', `쓰기 실패: ${tag.name} — ${(e as Error).message}`);
    throw e;
  }
}
