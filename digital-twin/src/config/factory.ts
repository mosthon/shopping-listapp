import { CATALOG } from './catalog';
import type { Equipment, EquipmentType, SimSpec, TagDef } from '../types';

let addrCounter = { bit: 0, word: 100 };

export function resetAddressCounter(bit = 0, word = 100) {
  addrCounter = { bit, word };
}

function nextAddress(dataType: TagDef['dataType'], device?: string): string {
  if (device === 'labview') return '';
  if (dataType === 'bool') return `M${addrCounter.bit++}`;
  const a = `D${addrCounter.word}`;
  addrCounter.word += dataType === 'real' ? 2 : 1;
  return a;
}

function resolveSim(sim: SimSpec | undefined, eqId: string): SimSpec | undefined {
  if (!sim) return undefined;
  const r = (t?: string) => (t && t.startsWith('$') ? `${eqId}.${t.slice(1)}` : t);
  return { ...sim, enableTag: r(sim.enableTag), followTag: r(sim.followTag) };
}

export interface CreateOptions {
  id: string;
  name?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  params?: Equipment['params'];
  source?: string;
  /** 'plc' → D/M 디바이스 자동할당, 'labview' → 변수 경로 */
  addressing?: 'plc' | 'labview';
  group?: string;
  /** 일부 role 은 태그 생성 생략 */
  skipRoles?: string[];
}

/** 카탈로그 정의로부터 설비 + 기본 태그 세트를 생성 */
export function createEquipment(type: EquipmentType, o: CreateOptions): { equipment: Equipment; tags: TagDef[] } {
  const entry = CATALOG[type];
  const source = o.source ?? 'plc1';
  const tags: TagDef[] = [];
  const bindings: Record<string, string> = {};
  for (const r of entry.roles) {
    if (o.skipRoles?.includes(r.role)) continue;
    const tagId = `${o.id}.${r.role}`;
    bindings[r.role] = tagId;
    tags.push({
      id: tagId,
      name: `${o.name ?? o.id} ${r.label}`,
      address: o.addressing === 'labview' ? `${o.id}/${r.role}` : nextAddress(r.dataType),
      source,
      dataType: r.dataType,
      unit: r.unit,
      min: r.min,
      max: r.max,
      decimals: r.dataType === 'real' ? (r.unit === 'bar' ? 2 : 1) : 0,
      writable: r.writable,
      alarmHigh: r.alarmHigh,
      alarmLow: r.alarmLow,
      alarmOnTrue: r.alarmOnTrue,
      alarmSeverity: r.alarmSeverity,
      alarmText: r.alarmText ? `${o.name ?? o.id}: ${r.alarmText}` : undefined,
      sim: resolveSim(r.sim, o.id),
    });
  }
  const equipment: Equipment = {
    id: o.id,
    name: o.name ?? `${entry.label} ${o.id}`,
    type,
    position: o.position ?? [0, 0, 0],
    rotation: o.rotation ?? [0, 0, 0],
    bindings,
    params: { ...entry.defaults, ...(o.params ?? {}) },
    group: o.group,
  };
  return { equipment, tags };
}

/** 기존 ID와 겹치지 않는 설비 ID 생성 (예: CV03) */
export function nextEquipmentId(type: EquipmentType, existing: string[]): string {
  const prefix: Record<EquipmentType, string> = {
    conveyor: 'CV', robot: 'RB', tank: 'TK', pump: 'P', valve: 'XV', stacklight: 'SL',
    cnc: 'MC', cabinet: 'CP', agv: 'AGV', pipe: 'L', imported: 'EQ',
  };
  const p = prefix[type];
  for (let i = 1; i < 1000; i++) {
    const id = `${p}${String(i).padStart(2, '0')}`;
    if (!existing.includes(id)) return id;
  }
  return `${p}${Date.now()}`;
}
