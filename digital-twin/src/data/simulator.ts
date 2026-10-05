import { coerce } from './protocol';
import type { TagDef, TagValue } from '../types';

/**
 * 내장 시뮬레이터 — 실제 PLC/LabVIEW 연결이 없는 태그에 대해
 * TagDef.sim 힌트를 바탕으로 그럴듯한 신호를 생성한다.
 * 운전 명령 등 쓰기(write)는 오버라이드 값으로 유지된다.
 */
export class Simulator {
  private state = new Map<string, number>();
  private toggleSlot = new Map<string, number>();
  private overrides = new Map<string, TagValue>();
  private last = performance.now();
  private t0 = performance.now();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private getTags: () => TagDef[],
    private emit: (vals: Record<string, TagValue>) => void,
    private intervalMs = 100,
  ) {}

  start() {
    this.stop();
    this.last = performance.now();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.tick();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  write(tag: TagDef, value: TagValue) {
    const v = coerce(tag, value);
    this.overrides.set(tag.id, v);
    if (typeof v === 'number') this.state.set(tag.id, v);
  }

  private tick() {
    const now = performance.now();
    const dt = Math.min(1, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;
    const tags = this.getTags();
    const out: Record<string, TagValue> = {};

    // 1차: enable 판단을 위해 bool/const 태그 먼저 계산
    const ordered = [...tags].sort((a, b) => rank(a) - rank(b));
    for (const tag of ordered) {
      const v = this.compute(tag, t, dt, out);
      if (v !== undefined) out[tag.id] = coerce(tag, v);
    }
    this.emit(out);
  }

  private enabled(tagId: string | undefined, out: Record<string, TagValue>): boolean {
    if (!tagId) return true;
    const v = out[tagId] ?? this.overrides.get(tagId);
    if (v === undefined) return true;
    return v === true || (typeof v === 'number' && v !== 0);
  }

  private compute(tag: TagDef, t: number, dt: number, out: Record<string, TagValue>): TagValue | undefined {
    const sim = tag.sim;
    const ov = this.overrides.get(tag.id);
    if (!sim) return ov ?? (tag.dataType === 'bool' ? false : tag.dataType === 'string' ? '' : 0);
    const en = this.enabled(sim.enableTag, out);
    const prev = this.state.get(tag.id);
    const base = sim.base ?? 0;
    const amp = sim.amp ?? 0;
    const period = sim.period ?? 10;
    let v: number;

    switch (sim.kind) {
      case 'const':
        if (ov !== undefined) return ov;
        return tag.dataType === 'bool' ? base !== 0 : base;
      case 'sine': {
        // 쓰기된 값이 있으면 그 값을 중심으로 출렁임
        const center = typeof ov === 'number' ? ov : base;
        const target = center + amp * Math.sin((2 * Math.PI * t) / period + (sim.phase ?? 0)) + (Math.random() - 0.5) * amp * 0.04;
        v = en ? target : 0;
        v = prev === undefined ? v : prev + (v - prev) * Math.min(1, dt * (en ? 6 : 1.5));
        break;
      }
      case 'random': {
        const p = prev ?? base;
        v = p + (Math.random() - 0.5) * amp * 0.3 + (base - p) * 0.08;
        if (!en) v = p * (1 - dt);
        break;
      }
      case 'ramp': {
        const max = base || 100;
        v = (prev ?? Math.random() * max) + (en ? (sim.rate ?? 1) * dt : 0);
        if (v >= max) v = 0;
        break;
      }
      case 'counter':
        v = (prev ?? Math.floor(Math.random() * 500)) + (en ? (sim.rate ?? 1) * dt : 0);
        this.state.set(tag.id, v);
        return Math.floor(v);
      case 'toggle': {
        if (ov !== undefined && tag.writable) return ov;
        const slot = Math.floor((t + hash(tag.id) * period) / period);
        if (this.toggleSlot.get(tag.id) !== slot) {
          this.toggleSlot.set(tag.id, slot);
          // 첫 슬롯은 비활성으로 시작 (초기 알람 폭주 방지)
          this.state.set(tag.id, prev === undefined && (sim.prob ?? 0.5) < 0.5 ? 0 : Math.random() < (sim.prob ?? 0.5) ? 1 : 0);
        }
        return (this.state.get(tag.id) ?? 0) !== 0;
      }
      case 'follow': {
        const src = sim.followTag ? out[sim.followTag] : undefined;
        if (typeof ov === 'number') return ov;
        const target = (src === true ? 1 : src === false ? 0 : Number(src ?? 0)) * (sim.scale ?? 1);
        const p = prev ?? target;
        v = p + (target - p) * Math.min(1, dt / (sim.tau ?? 1));
        break;
      }
      default:
        return ov;
    }
    if (tag.min !== undefined) v = Math.max(tag.min, v);
    if (tag.max !== undefined) v = Math.min(tag.max, v);
    this.state.set(tag.id, v);
    return v;
  }
}

function rank(t: TagDef) {
  if (!t.sim) return 0;
  if (t.sim.kind === 'const' || t.sim.kind === 'toggle') return 0;
  if (t.sim.kind === 'follow') return 2;
  return 1;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}
