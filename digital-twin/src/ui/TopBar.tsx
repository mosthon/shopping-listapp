import { useEffect, useState } from 'react';
import { getTag, useTwin } from '../store/useTwin';
import { fmtValue } from './common';
import type { KpiDef } from '../types';

function Kpi({ k }: { k: KpiDef }) {
  const v = useTwin((s) => s.values[k.tag]);
  const tag = useTwin((s) => getTag(s.plant, k.tag));
  const text = typeof v === 'number' ? v.toLocaleString('ko-KR', { maximumFractionDigits: k.decimals ?? 1, minimumFractionDigits: k.decimals ?? 1 }) : fmtValue(tag, v);
  return (
    <div className="kpi" title={k.tag}>
      <div className="k">{k.label}</div>
      <div className="v">
        {text}
        <small>{k.unit ?? tag?.unit}</small>
      </div>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <div className="clock">{now.toLocaleString('ko-KR', { hour12: false })}</div>;
}

export function TopBar() {
  const plant = useTwin((s) => s.plant);
  const conn = useTwin((s) => s.conn);
  const simulation = useTwin((s) => s.simulation);
  const activeAlarms = useTwin((s) => s.alarms.filter((a) => a.active).length);
  const unack = useTwin((s) => s.alarms.filter((a) => !a.ackedAt && a.active).length);
  const editMode = useTwin((s) => s.ui.editMode);
  const setUi = useTwin((s) => s.setUi);
  const setDialog = useTwin((s) => s.setDialog);

  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
            <path d="M3 20h18M5 20V9l5 3V9l5 3V5l4 2v13" />
          </svg>
        </div>
        <div>
          <div className="title">{plant.name}</div>
          <div className="sub">{plant.site ?? '디지털 트윈'} · 설비 {plant.equipment.length} · 태그 {plant.tags.length}</div>
        </div>
      </div>
      <div className="kpis">
        {plant.kpis.map((k) => (
          <Kpi key={k.id} k={k} />
        ))}
      </div>
      <div className="spacer" />
      <div className="conns">
        <span className="pill" onClick={() => setDialog('connections')} title="시뮬레이터: 비활성 연결의 태그 값을 생성">
          <i className={`dot ${simulation ? 'sim' : ''}`} /> SIM
        </span>
        {plant.connections.map((c) => {
          const st = conn[c.id]?.state ?? 'disconnected';
          const cls = !c.enabled ? '' : st === 'connected' ? 'ok' : st === 'connecting' ? 'warn blink' : 'bad';
          return (
            <span key={c.id} className="pill" onClick={() => setDialog('connections')} title={`${c.url}\n${conn[c.id]?.message ?? ''}`}>
              <i className={`dot ${cls}`} /> {c.name}
            </span>
          );
        })}
      </div>
      <button
        className={`alarm-badge ${activeAlarms ? 'active' : ''} ${unack ? 'unack' : ''}`}
        onClick={() => setUi({ bottomOpen: true, bottomTab: 'alarms' })}
        title="알람 보기"
      >
        ⚠ 알람 {activeAlarms}
      </button>
      <Clock />
      <button className={`btn ${editMode ? 'on' : ''}`} onClick={() => setUi({ editMode: !editMode })} title="레이아웃 편집 모드 (E)">
        ✎ {editMode ? '편집 중' : '편집'}
      </button>
      <button className="btn icon" onClick={() => setDialog('connections')} title="연결 설정">⇄</button>
      <button className="btn icon" onClick={() => setDialog('settings')} title="설정">⚙</button>
      <button className="btn icon" onClick={() => setDialog('help')} title="도움말">?</button>
    </header>
  );
}
