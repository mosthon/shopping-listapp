import { create } from 'zustand';
import { buildDefaultPlant } from '../config/defaultPlant';
import { createEquipment, nextEquipmentId } from '../config/factory';
import { pushSample } from './history';
import type {
  Alarm, ConnState, ConnectionDef, Equipment, EquipmentStatus, EquipmentType, PlantConfig, TagDef, TagValue,
} from '../types';

const PLANT_KEY = 'dt.plant.v1';
const UI_KEY = 'dt.ui.v1';

export type RenderMode = 'real' | 'cad' | 'xray' | 'status';
export type Quality = 'high' | 'medium' | 'low';
export type BottomTab = 'alarms' | 'trend' | 'tags' | 'events';

export interface UiState {
  editMode: boolean;
  transformMode: 'translate' | 'rotate';
  snap: boolean;
  renderMode: RenderMode;
  quality: Quality;
  labels: boolean;
  grid: boolean;
  clip: { enabled: boolean; axis: 'x' | 'y' | 'z'; value: number; flip: boolean };
  bottomTab: BottomTab;
  bottomOpen: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  trendTags: string[];
  trendWindowSec: number;
  autoRotate: boolean;
}

export interface ConnStatus {
  state: ConnState;
  message?: string;
  rx: number;
  tx: number;
  lastRx?: number;
}

export interface EventLog {
  t: number;
  kind: 'info' | 'write' | 'conn' | 'alarm' | 'error';
  text: string;
}

interface TwinState {
  plant: PlantConfig;
  values: Record<string, TagValue>;
  updatedAt: Record<string, number>;
  conn: Record<string, ConnStatus>;
  simulation: boolean;
  alarms: Alarm[];
  events: EventLog[];
  selectedId: string | null;
  hoveredId: string | null;
  focusRequest: { id: string | null; n: number };
  viewRequest: { view: string; n: number };
  ui: UiState;
  dialog: null | 'connections' | 'import' | 'settings' | 'help' | 'add';

  // ── 데이터 ──
  applyValues: (vals: Record<string, TagValue>, ts?: number, sourceId?: string) => void;
  setConnStatus: (id: string, patch: Partial<ConnStatus>) => void;
  setSimulation: (on: boolean) => void;
  log: (kind: EventLog['kind'], text: string) => void;

  // ── 알람 ──
  ackAlarm: (key: string) => void;
  ackAll: () => void;
  clearAlarmHistory: () => void;

  // ── 선택/뷰 ──
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  focus: (id: string | null) => void;
  requestView: (view: string) => void;
  setUi: (patch: Partial<UiState>) => void;
  setDialog: (d: TwinState['dialog']) => void;

  // ── 구성 편집 ──
  updateEquipment: (id: string, patch: Partial<Equipment>) => void;
  updateParams: (id: string, patch: Equipment['params']) => void;
  addEquipment: (type: EquipmentType, position?: [number, number, number], extra?: Partial<Equipment>) => string;
  duplicateEquipment: (id: string) => string | null;
  removeEquipment: (id: string) => void;
  upsertTag: (tag: TagDef, oldId?: string) => void;
  removeTag: (id: string) => void;
  setConnections: (c: ConnectionDef[]) => void;
  setPlantMeta: (patch: Partial<Pick<PlantConfig, 'name' | 'site' | 'floor' | 'kpis'>>) => void;
  loadPlant: (p: PlantConfig) => void;
  resetPlant: () => void;
}

function loadJson<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function saveJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 저장소 사용 불가 시 무시 */
  }
}

const defaultUi: UiState = {
  editMode: false,
  transformMode: 'translate',
  snap: true,
  renderMode: 'real',
  quality: 'high',
  labels: true,
  grid: false,
  clip: { enabled: false, axis: 'x', value: 0, flip: false },
  bottomTab: 'alarms',
  bottomOpen: true,
  leftOpen: true,
  rightOpen: true,
  trendTags: ['TK01.level', 'TK01.temp', 'P01.pressure', 'CV01.speed'],
  trendWindowSec: 120,
  autoRotate: false,
};

// ── 알람 평가 ───────────────────────────────────────────
type AlarmKind = 'HI' | 'LO' | 'ON';

function evalAlarm(tag: TagDef, v: TagValue): { kind: AlarmKind; text: string } | null {
  if (tag.alarmOnTrue && (v === true || v === 1)) return { kind: 'ON', text: tag.alarmText ?? `${tag.name} 이상` };
  if (typeof v === 'number') {
    const u = tag.unit ? ` ${tag.unit}` : '';
    if (tag.alarmHigh !== undefined && v >= tag.alarmHigh)
      return { kind: 'HI', text: tag.alarmText && !tag.alarmOnTrue ? tag.alarmText : `${tag.name} 상한 초과 (≥ ${tag.alarmHigh}${u})` };
    if (tag.alarmLow !== undefined && v <= tag.alarmLow)
      return { kind: 'LO', text: tag.alarmText && !tag.alarmOnTrue ? tag.alarmText : `${tag.name} 하한 미달 (≤ ${tag.alarmLow}${u})` };
  }
  return null;
}

// 태그 → 설비 역참조 캐시
let tagIndexFor: PlantConfig | null = null;
let tagIndex = new Map<string, TagDef>();
let tagEquip = new Map<string, string>();
export function indexPlant(p: PlantConfig) {
  if (tagIndexFor === p) return;
  tagIndexFor = p;
  tagIndex = new Map(p.tags.map((t) => [t.id, t]));
  tagEquip = new Map();
  for (const e of p.equipment) for (const t of Object.values(e.bindings)) if (!tagEquip.has(t)) tagEquip.set(t, e.id);
}
export function getTag(p: PlantConfig, id: string) {
  indexPlant(p);
  return tagIndex.get(id);
}
export function equipmentOfTag(p: PlantConfig, id: string) {
  indexPlant(p);
  return tagEquip.get(id);
}

const initialPlant = loadJson<PlantConfig>(PLANT_KEY) ?? buildDefaultPlant();
const initialUi = { ...defaultUi, ...(loadJson<Partial<UiState>>(UI_KEY) ?? {}), editMode: false };

export const useTwin = create<TwinState>()((set, get) => ({
  plant: initialPlant,
  values: {},
  updatedAt: {},
  conn: {},
  simulation: true,
  alarms: [],
  events: [{ t: Date.now(), kind: 'info', text: '디지털 트윈 시작' }],
  selectedId: null,
  hoveredId: null,
  focusRequest: { id: null, n: 0 },
  viewRequest: { view: 'home', n: 0 },
  ui: initialUi,
  dialog: null,

  applyValues: (vals, ts = Date.now()) => {
    const s = get();
    indexPlant(s.plant);
    const values = { ...s.values };
    const updatedAt = { ...s.updatedAt };
    let alarms = s.alarms;
    let alarmsChanged = false;
    const newEvents: EventLog[] = [];

    for (const id in vals) {
      const v = vals[id];
      values[id] = v;
      updatedAt[id] = ts;
      if (typeof v === 'number') pushSample(id, ts, v);
      else if (typeof v === 'boolean') pushSample(id, ts, v ? 1 : 0);

      const tag = tagIndex.get(id);
      if (!tag || (tag.alarmHigh === undefined && tag.alarmLow === undefined && !tag.alarmOnTrue)) continue;
      const res = evalAlarm(tag, v);
      const activeIdx = alarms.findIndex((a) => a.tagId === id && a.active);
      const active = activeIdx >= 0 ? alarms[activeIdx] : undefined;
      const activeKind = active?.key.split('|')[1] as AlarmKind | undefined;

      if (active && (!res || res.kind !== activeKind)) {
        if (!alarmsChanged) alarms = [...alarms];
        alarmsChanged = true;
        alarms[activeIdx] = { ...active, active: false, clearedAt: ts };
        newEvents.push({ t: ts, kind: 'alarm', text: `해제: ${active.text}` });
      }
      if (res && (!active || res.kind !== activeKind)) {
        if (!alarmsChanged) alarms = [...alarms];
        alarmsChanged = true;
        alarms.unshift({
          key: `${id}|${res.kind}|${ts}`,
          tagId: id,
          equipmentId: tagEquip.get(id),
          text: res.text,
          severity: tag.alarmSeverity ?? (res.kind === 'ON' ? 'major' : 'minor'),
          value: v,
          raisedAt: ts,
          active: true,
        });
        newEvents.push({ t: ts, kind: 'alarm', text: `발생: ${res.text}` });
      }
    }
    if (alarmsChanged && alarms.length > 500) {
      // 활성/미확인 알람은 유지하고 오래된 이력만 정리
      alarms = alarms.filter((a, i) => i < 400 || a.active || !a.ackedAt);
    }
    set({
      values,
      updatedAt,
      ...(alarmsChanged ? { alarms } : {}),
      ...(newEvents.length ? { events: [...newEvents.reverse(), ...s.events].slice(0, 300) } : {}),
    });
  },

  setConnStatus: (id, patch) =>
    set((s) => ({ conn: { ...s.conn, [id]: { ...(s.conn[id] ?? { state: 'disconnected', rx: 0, tx: 0 }), ...patch } } })),

  setSimulation: (on) => {
    set({ simulation: on });
    get().log('conn', on ? '시뮬레이션 모드 ON' : '시뮬레이션 모드 OFF');
  },

  log: (kind, text) => set((s) => ({ events: [{ t: Date.now(), kind, text }, ...s.events].slice(0, 300) })),

  ackAlarm: (key) =>
    set((s) => ({ alarms: s.alarms.map((a) => (a.key === key && !a.ackedAt ? { ...a, ackedAt: Date.now() } : a)) })),
  ackAll: () => set((s) => ({ alarms: s.alarms.map((a) => (a.ackedAt ? a : { ...a, ackedAt: Date.now() })) })),
  clearAlarmHistory: () => set((s) => ({ alarms: s.alarms.filter((a) => a.active) })),

  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  focus: (id) => set((s) => ({ focusRequest: { id, n: s.focusRequest.n + 1 } })),
  requestView: (view) => set((s) => ({ viewRequest: { view, n: s.viewRequest.n + 1 } })),
  setUi: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),
  setDialog: (dialog) => set({ dialog }),

  updateEquipment: (id, patch) =>
    set((s) => ({ plant: { ...s.plant, equipment: s.plant.equipment.map((e) => (e.id === id ? { ...e, ...patch } : e)) } })),
  updateParams: (id, patch) =>
    set((s) => ({
      plant: {
        ...s.plant,
        equipment: s.plant.equipment.map((e) => (e.id === id ? { ...e, params: { ...e.params, ...patch } } : e)),
      },
    })),

  addEquipment: (type, position = [0, 0, 0], extra) => {
    const s = get();
    const id = nextEquipmentId(type, s.plant.equipment.map((e) => e.id));
    const source = s.plant.connections[0]?.id ?? 'plc1';
    const { equipment, tags } = createEquipment(type, { id, position, source });
    // 주소 충돌 방지: 기존 태그와 겹치는 주소는 비워서 사용자가 지정하도록 함
    const usedAddr = new Set(s.plant.tags.map((t) => `${t.source}:${t.address}`));
    for (const t of tags) if (usedAddr.has(`${t.source}:${t.address}`)) t.address = '';
    const eq = { ...equipment, ...extra, params: { ...equipment.params, ...(extra?.params ?? {}) } };
    set({ plant: { ...s.plant, equipment: [...s.plant.equipment, eq], tags: [...s.plant.tags, ...tags] }, selectedId: id });
    get().log('info', `설비 추가: ${eq.name}`);
    return id;
  },

  duplicateEquipment: (srcId) => {
    const s = get();
    const src = s.plant.equipment.find((e) => e.id === srcId);
    if (!src) return null;
    const id = nextEquipmentId(src.type, s.plant.equipment.map((e) => e.id));
    const bindings: Record<string, string> = {};
    const newTags: TagDef[] = [];
    for (const [role, tagId] of Object.entries(src.bindings)) {
      const t = s.plant.tags.find((x) => x.id === tagId);
      if (t && tagId.startsWith(srcId + '.')) {
        const nid = id + tagId.slice(srcId.length);
        const reId = (x?: string) => (x && x.startsWith(srcId + '.') ? id + x.slice(srcId.length) : x);
        newTags.push({
          ...t,
          id: nid,
          name: t.name.replace(src.name, `${src.name} (복제)`),
          address: '',
          sim: t.sim ? { ...t.sim, enableTag: reId(t.sim.enableTag), followTag: reId(t.sim.followTag) } : undefined,
        });
        bindings[role] = nid;
      } else bindings[role] = tagId;
    }
    const p = src.position;
    const eq: Equipment = { ...structuredClone(src), id, name: `${src.name} (복제)`, bindings, position: [p[0] + 2, p[1], p[2] + 2] };
    set({ plant: { ...s.plant, equipment: [...s.plant.equipment, eq], tags: [...s.plant.tags, ...newTags] }, selectedId: id });
    return id;
  },

  removeEquipment: (id) => {
    const s = get();
    const eq = s.plant.equipment.find((e) => e.id === id);
    if (!eq) return;
    // 해당 설비 전용 태그(ID 접두사 일치)만 함께 삭제
    const tags = s.plant.tags.filter((t) => !t.id.startsWith(id + '.'));
    set({
      plant: { ...s.plant, equipment: s.plant.equipment.filter((e) => e.id !== id), tags },
      selectedId: s.selectedId === id ? null : s.selectedId,
    });
    get().log('info', `설비 삭제: ${eq.name}`);
  },

  upsertTag: (tag, oldId) =>
    set((s) => {
      const key = oldId ?? tag.id;
      const exists = s.plant.tags.some((t) => t.id === key);
      const tags = exists ? s.plant.tags.map((t) => (t.id === key ? tag : t)) : [...s.plant.tags, tag];
      let equipment = s.plant.equipment;
      if (oldId && oldId !== tag.id) {
        equipment = equipment.map((e) => {
          const b = Object.fromEntries(Object.entries(e.bindings).map(([r, t]) => [r, t === oldId ? tag.id : t]));
          return { ...e, bindings: b };
        });
      }
      return { plant: { ...s.plant, tags, equipment } };
    }),

  removeTag: (id) =>
    set((s) => ({
      plant: {
        ...s.plant,
        tags: s.plant.tags.filter((t) => t.id !== id),
        equipment: s.plant.equipment.map((e) => ({
          ...e,
          bindings: Object.fromEntries(Object.entries(e.bindings).filter(([, t]) => t !== id)),
        })),
      },
    })),

  setConnections: (connections) => set((s) => ({ plant: { ...s.plant, connections } })),
  setPlantMeta: (patch) => set((s) => ({ plant: { ...s.plant, ...patch } })),

  loadPlant: (p) => {
    set({ plant: p, values: {}, updatedAt: {}, alarms: [], selectedId: null });
    get().log('info', `레이아웃 불러오기: ${p.name}`);
  },
  resetPlant: () => {
    set({ plant: buildDefaultPlant(), values: {}, updatedAt: {}, alarms: [], selectedId: null });
    get().log('info', '기본 레이아웃으로 초기화');
  },
}));

// ── 영속화 (디바운스) ───────────────────────────────────
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useTwin.subscribe((s, prev) => {
  if (s.plant !== prev.plant || s.ui !== prev.ui) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const st = useTwin.getState();
      saveJson(PLANT_KEY, st.plant);
      saveJson(UI_KEY, st.ui);
    }, 400);
  }
});

// ── 파생 상태 헬퍼 ──────────────────────────────────────
export function num(v: TagValue | undefined, d = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : d;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  }
  return d;
}
export function bool(v: TagValue | undefined, d = false): boolean {
  if (v === undefined) return d;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return v === 'true' || v === '1' || v === 'ON';
}

/** 설비의 role 값 조회 (렌더 루프용 – 비반응형) */
export function roleValue(eq: Equipment, role: string): TagValue | undefined {
  const t = eq.bindings[role];
  return t ? useTwin.getState().values[t] : undefined;
}

export function isTagLive(s: Pick<TwinState, 'plant' | 'conn' | 'simulation'>, tagId: string): boolean {
  const tag = getTag(s.plant, tagId);
  if (!tag) return false;
  const c = s.plant.connections.find((x) => x.id === tag.source);
  if (c?.enabled) return s.conn[c.id]?.state === 'connected';
  return s.simulation;
}

export function computeStatus(
  eq: Equipment,
  s: Pick<TwinState, 'plant' | 'values' | 'alarms' | 'conn' | 'simulation'>,
): EquipmentStatus {
  const tagIds = Object.values(eq.bindings);
  if (tagIds.length && !tagIds.some((t) => isTagLive(s, t))) return 'offline';
  let warn = false;
  for (const a of s.alarms) {
    if (!a.active) continue;
    if (a.equipmentId === eq.id || tagIds.includes(a.tagId)) {
      if (a.severity === 'critical' || a.severity === 'major') return 'alarm';
      warn = true;
    }
  }
  if (bool(s.values[eq.bindings.fault ?? ''])) return 'alarm';
  if (warn) return 'warning';
  if (eq.bindings.run) return bool(s.values[eq.bindings.run]) ? 'run' : 'idle';
  if (eq.bindings.open) return bool(s.values[eq.bindings.open]) ? 'run' : 'idle';
  return 'run';
}

export const STATUS_META: Record<EquipmentStatus, { label: string; color: string }> = {
  run: { label: '운전', color: '#22c55e' },
  idle: { label: '정지', color: '#eab308' },
  alarm: { label: '알람', color: '#ef4444' },
  warning: { label: '경고', color: '#f97316' },
  offline: { label: '오프라인', color: '#64748b' },
};
