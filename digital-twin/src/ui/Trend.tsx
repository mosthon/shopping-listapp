import { useEffect, useRef, useState } from 'react';
import { getTag, useTwin } from '../store/useTwin';
import { exportCsv, forEachSample } from '../store/history';
import { SERIES_COLORS, download, fmtTime, fmtValue } from './common';

/**
 * 다중 태그 트렌드 — 각 시리즈를 태그의 공학 범위(min~max)로 정규화하여
 * 하나의 시간축에 겹쳐 표시. 마우스 위치의 값을 범례에 표시.
 */
export function Trend() {
  const tagIds = useTwin((s) => s.ui.trendTags);
  const windowSec = useTwin((s) => s.ui.trendWindowSec);
  const setUi = useTwin((s) => s.setUi);
  const plant = useTwin((s) => s.plant);
  const ref = useRef<HTMLCanvasElement>(null);
  const hoverX = useRef<number | null>(null);
  const [hoverVals, setHoverVals] = useState<{ t: number; v: (number | undefined)[] } | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedAt = useRef(Date.now());
  const [adding, setAdding] = useState('');
  const liveVals = useTwin((s) => tagIds.map((id) => s.values[id]).join('|'));

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 100) return;
      last = now;
      const c = ref.current;
      if (!c) return;
      const W = c.clientWidth, H = c.clientHeight;
      if (!W || !H) return;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const padL = 44, padR = 10, padT = 10, padB = 22;
      const pw = W - padL - padR, ph = H - padT - padB;
      const end = paused ? pausedAt.current : Date.now();
      const start = end - windowSec * 1000;
      const X = (t: number) => padL + ((t - start) / (windowSec * 1000)) * pw;

      // 그리드
      g.strokeStyle = '#1c2633';
      g.lineWidth = 1;
      g.fillStyle = '#64748b';
      g.font = '10.5px ui-monospace, monospace';
      for (let i = 0; i <= 4; i++) {
        const y = padT + (ph * i) / 4;
        g.beginPath();
        g.moveTo(padL, y);
        g.lineTo(W - padR, y);
        g.stroke();
        g.fillText(`${100 - i * 25}%`, 6, y + 4);
      }
      const step = windowSec <= 60 ? 10 : windowSec <= 300 ? 60 : 300;
      for (let t = Math.ceil(start / 1000 / step) * step * 1000; t <= end; t += step * 1000) {
        const x = X(t);
        g.beginPath();
        g.moveTo(x, padT);
        g.lineTo(x, padT + ph);
        g.stroke();
        g.fillText(fmtTime(t), x - 24, H - 6);
      }

      const hx = hoverX.current;
      const hoverT = hx !== null ? start + ((hx - padL) / pw) * windowSec * 1000 : null;
      const hv: (number | undefined)[] = [];
      tagIds.forEach((id, si) => {
        const tag = getTag(plant, id);
        let lo = tag?.min, hi = tag?.max;
        if (lo === undefined || hi === undefined || hi <= lo) {
          lo = Infinity; hi = -Infinity;
          forEachSample(id, start, (_, v) => { if (v < lo!) lo = v; if (v > hi!) hi = v; });
          if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
          if (hi! - lo! < 1e-6) { hi = hi! + 1; lo = lo! - 1; }
        }
        const Y = (v: number) => padT + ph - ((v - lo!) / (hi! - lo!)) * ph;
        g.beginPath();
        let first = true;
        let best: number | undefined;
        let bestD = Infinity;
        const step2 = tag?.dataType === 'bool';
        let prevY = 0;
        forEachSample(id, start, (t, v) => {
          if (t > end) return;
          const x = X(t), y = Y(v);
          if (first) { g.moveTo(x, y); first = false; }
          else if (step2) { g.lineTo(x, prevY); g.lineTo(x, y); }
          else g.lineTo(x, y);
          prevY = y;
          if (hoverT !== null) {
            const d = Math.abs(t - hoverT);
            if (d < bestD) { bestD = d; best = v; }
          }
        });
        g.strokeStyle = SERIES_COLORS[si % SERIES_COLORS.length];
        g.lineWidth = 1.6;
        g.stroke();
        hv.push(best);
      });
      if (hx !== null && hoverT !== null && hx >= padL && hx <= W - padR) {
        g.strokeStyle = '#94a3b8';
        g.setLineDash([3, 3]);
        g.beginPath();
        g.moveTo(hx, padT);
        g.lineTo(hx, padT + ph);
        g.stroke();
        g.setLineDash([]);
        setHoverVals({ t: hoverT, v: hv });
      } else setHoverVals(null);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [tagIds, windowSec, plant, paused]);

  void liveVals;
  const add = (id: string) => {
    if (!id || tagIds.includes(id) || !plant.tags.some((t) => t.id === id)) return;
    setUi({ trendTags: [...tagIds, id] });
    setAdding('');
  };

  return (
    <div className="trend">
      <div className="trend-canvas">
        <canvas
          ref={ref}
          onMouseMove={(e) => { hoverX.current = e.nativeEvent.offsetX; }}
          onMouseLeave={() => { hoverX.current = null; }}
        />
      </div>
      <div className="trend-side">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <div className="seg">
            {[60, 120, 300, 600].map((s) => (
              <button key={s} className={windowSec === s ? 'on' : ''} onClick={() => setUi({ trendWindowSec: s })}>{s < 60 ? `${s}s` : `${s / 60}m`}</button>
            ))}
          </div>
          <button className={`btn sm ${paused ? 'on' : ''}`} onClick={() => { pausedAt.current = Date.now(); setPaused(!paused); }}>{paused ? '▶' : '❚❚'}</button>
          <button className="btn sm" title="CSV 내보내기" onClick={() => download(`trend_${Date.now()}.csv`, exportCsv(tagIds, Date.now() - windowSec * 1000), 'text/csv')}>CSV</button>
        </div>
        {hoverVals && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtTime(hoverVals.t)}</div>}
        {tagIds.map((id, i) => {
          const tag = getTag(plant, id);
          const v = hoverVals ? hoverVals.v[i] : useTwin.getState().values[id];
          return (
            <div key={id} className="trend-legend" title={id}>
              <i style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag?.name ?? id}</span>
              <b>{fmtValue(tag, v as number | undefined)}{tag?.unit ? ` ${tag.unit}` : ''}</b>
              <button onClick={() => setUi({ trendTags: tagIds.filter((x) => x !== id) })}>✕</button>
            </div>
          );
        })}
        <datalist id="trend-tags">{plant.tags.filter((t) => t.dataType !== 'string').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</datalist>
        <div style={{ display: 'flex', gap: 4 }}>
          <input className="input mono" list="trend-tags" placeholder="태그 추가…" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add(adding)} />
          <button className="btn sm" onClick={() => add(adding)}>+</button>
        </div>
      </div>
    </div>
  );
}
