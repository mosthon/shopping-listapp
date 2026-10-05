import { useEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';
import { forEachSample } from '../store/history';
import type { TagDef, TagValue } from '../types';

// ── 토스트 ─────────────────────────────────────────────
interface Toast { id: number; text: string; kind: 'info' | 'error' }
export const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }));
let tid = 0;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++tid;
  useToasts.setState((s) => ({ list: [...s.list, { id, text, kind }] }));
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), 3500);
}
export function Toasts() {
  const list = useToasts((s) => s.list);
  return (
    <div className="toast-wrap">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}

// ── 포맷 ───────────────────────────────────────────────
export function fmtValue(tag: TagDef | undefined, v: TagValue | undefined): string {
  if (v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'ON' : 'OFF';
  if (typeof v === 'number') {
    if (tag?.dataType === 'bool') return v ? 'ON' : 'OFF';
    const d = tag?.decimals ?? (tag?.dataType === 'int' ? 0 : 1);
    return v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  return String(v);
}
export function fmtTime(t: number, withDate = false) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return withDate ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${time}` : time;
}
export function isAlarmValue(tag: TagDef | undefined, v: TagValue | undefined) {
  if (!tag || v === undefined) return false;
  if (tag.alarmOnTrue && (v === true || v === 1)) return true;
  if (typeof v === 'number') {
    if (tag.alarmHigh !== undefined && v >= tag.alarmHigh) return true;
    if (tag.alarmLow !== undefined && v <= tag.alarmLow) return true;
  }
  return false;
}

// ── 스파크라인 ─────────────────────────────────────────
export function Sparkline({ tagId, color = '#22d3ee', seconds = 60, min, max }: { tagId: string; color?: string; seconds?: number; min?: number; max?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const c = ref.current;
      if (!c) return;
      const w = c.clientWidth, h = c.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const now = Date.now();
      const since = now - seconds * 1000;
      const pts: [number, number][] = [];
      let lo = Infinity, hi = -Infinity;
      forEachSample(tagId, since, (t, v) => {
        pts.push([t, v]);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      });
      if (pts.length < 2) return;
      if (min !== undefined && max !== undefined && max > min && hi - lo > (max - min) * 0.2) { lo = min; hi = max; }
      if (hi - lo < 1e-6) { hi += 0.5; lo -= 0.5; }
      const pad = (hi - lo) * 0.1;
      lo -= pad; hi += pad;
      const X = (t: number) => ((t - since) / (seconds * 1000)) * w;
      const Y = (v: number) => h - ((v - lo) / (hi - lo)) * h;
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, color + '55');
      grd.addColorStop(1, color + '00');
      g.beginPath();
      g.moveTo(X(pts[0][0]), h);
      for (const [t, v] of pts) g.lineTo(X(t), Y(v));
      g.lineTo(X(pts[pts.length - 1][0]), h);
      g.fillStyle = grd;
      g.fill();
      g.beginPath();
      pts.forEach(([t, v], i) => (i ? g.lineTo(X(t), Y(v)) : g.moveTo(X(t), Y(v))));
      g.strokeStyle = color;
      g.lineWidth = 1.4;
      g.stroke();
    };
    draw();
    const id = setInterval(draw, 1000);
    return () => clearInterval(id);
  }, [tagId, color, seconds, min, max]);
  return <canvas ref={ref} />;
}

// ── 모달 ───────────────────────────────────────────────
export function Modal({ title, onClose, children, footer, size }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal>
        <div className="modal-head">
          <h2>{title}</h2>
          <div className="spacer" />
          <button className="btn ghost icon" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button type="button" className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} disabled={disabled} aria-pressed={on} />;
}

export function download(name: string, content: string | Blob, type = 'application/json') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const SERIES_COLORS = ['#22d3ee', '#f59e0b', '#a78bfa', '#4ade80', '#f472b6', '#60a5fa', '#facc15', '#fb7185'];
