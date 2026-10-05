/**
 * 디지털 트윈 ↔ 게이트웨이(LabVIEW / PLC) 데이터 프로토콜 (JSON)
 * 자세한 설명은 docs/PROTOCOL.md 참고.
 *
 * Server → Client (아래 형태 모두 허용)
 *   { "type": "snapshot" | "update", "ts": 1700000000000, "tags": { "TK01.level": 52.3, "D100": 12 } }
 *   { "type": "update", "values": [ { "id": "CV01.run", "value": true, "ts": 1700000000000 } ] }
 *   { "TK01.level": 52.3, "TK01.temp": 61.0 }               ← LabVIEW 클러스터 → JSON 평문
 *   { "type": "ack", "reqId": "w12", "ok": true }
 *   { "type": "error", "message": "..." }
 *
 * Client → Server
 *   { "type": "hello", "client": "digital-twin", "version": 1, "tags": [ { "id", "address", "dataType" } ] }
 *   { "type": "write", "reqId": "w12", "tag": "CV01.run", "address": "M0", "value": false }
 *   { "type": "ping", "ts": 1700000000000 }
 *
 * 키는 태그 ID 또는 주소(address) 어느 쪽이든 사용할 수 있다.
 */
import type { TagDef, TagValue } from '../types';

export interface ParsedMessage {
  values: Record<string, TagValue>;
  ts?: number;
  ack?: { reqId: string; ok: boolean; error?: string };
  error?: string;
  ignored?: boolean;
}

const RESERVED = new Set(['type', 'ts', 'tags', 'values', 'reqId', 'ok', 'error', 'message', 'client', 'version']);

function isScalar(v: unknown): v is TagValue {
  return typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string';
}

export function parseMessage(raw: unknown): ParsedMessage {
  const out: ParsedMessage = { values: {} };
  if (Array.isArray(raw)) {
    for (const item of raw) mergeItem(out, item);
    return out;
  }
  if (!raw || typeof raw !== 'object') return { values: {}, ignored: true };
  const m = raw as Record<string, unknown>;
  const type = typeof m.type === 'string' ? m.type : undefined;
  if (typeof m.ts === 'number') out.ts = m.ts;
  else if (typeof m.ts === 'string') {
    const t = Date.parse(m.ts);
    if (!Number.isNaN(t)) out.ts = t;
  }

  if (type === 'ack' || type === 'writeResult') {
    out.ack = { reqId: String(m.reqId ?? ''), ok: m.ok !== false, error: m.error ? String(m.error) : undefined };
    return out;
  }
  if (type === 'error') {
    out.error = String(m.message ?? m.error ?? 'unknown error');
    return out;
  }
  if (type === 'pong' || type === 'hello' || type === 'welcome') return { values: {}, ignored: true };

  if (m.tags && typeof m.tags === 'object' && !Array.isArray(m.tags)) {
    for (const [k, v] of Object.entries(m.tags as Record<string, unknown>)) {
      if (isScalar(v)) out.values[k] = v;
      else if (v && typeof v === 'object' && 'value' in v && isScalar((v as { value: unknown }).value))
        out.values[k] = (v as { value: TagValue }).value;
    }
  }
  if (Array.isArray(m.values)) for (const item of m.values) mergeItem(out, item);
  if (Array.isArray(m.tags)) for (const item of m.tags) mergeItem(out, item);

  // 평문 객체 (type 없음)
  if (!type) {
    for (const [k, v] of Object.entries(m)) if (!RESERVED.has(k) && isScalar(v)) out.values[k] = v;
  }
  return out;
}

function mergeItem(out: ParsedMessage, item: unknown) {
  if (!item || typeof item !== 'object') return;
  const it = item as Record<string, unknown>;
  const key = (it.id ?? it.tag ?? it.name ?? it.address) as string | undefined;
  if (key !== undefined && isScalar(it.value)) out.values[String(key)] = it.value;
}

/** 수신 키(태그 ID 또는 주소)를 태그 ID로 해석하고 데이터 타입에 맞게 변환 */
export class KeyResolver {
  private byId = new Map<string, TagDef>();
  private byAddr = new Map<string, TagDef>();

  constructor(tags: TagDef[]) {
    for (const t of tags) {
      this.byId.set(t.id, t);
      if (t.address) {
        this.byAddr.set(t.address, t);
        this.byAddr.set(t.address.toUpperCase(), t);
      }
    }
  }

  resolve(values: Record<string, TagValue>): Record<string, TagValue> {
    const out: Record<string, TagValue> = {};
    for (const [k, v] of Object.entries(values)) {
      const tag = this.byId.get(k) ?? this.byAddr.get(k) ?? this.byAddr.get(k.toUpperCase());
      if (tag) out[tag.id] = coerce(tag, v);
      else out[k] = v;
    }
    return out;
  }
}

export function coerce(tag: Pick<TagDef, 'dataType'>, v: TagValue): TagValue {
  switch (tag.dataType) {
    case 'bool':
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      return ['true', '1', 'on', 'yes'].includes(String(v).toLowerCase());
    case 'int': {
      const n = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
      return Number.isFinite(n) ? Math.round(n) : 0;
    }
    case 'real': {
      const n = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    default:
      return String(v);
  }
}
