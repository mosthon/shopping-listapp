import { useMemo, useState } from 'react';
import { useTwin } from '../store/useTwin';
import { Trend } from './Trend';
import { TagEditor } from './TagEditor';
import { download, fmtTime, fmtValue, isAlarmValue } from './common';
import type { TagDef } from '../types';

function Alarms() {
  const alarms = useTwin((s) => s.alarms);
  const equipment = useTwin((s) => s.plant.equipment);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const list = filter === 'active' ? alarms.filter((a) => a.active || !a.ackedAt) : alarms;
  const name = (id?: string) => equipment.find((e) => e.id === id)?.name ?? '—';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 6, padding: 6, borderBottom: '1px solid var(--line)' }}>
        <div className="seg">
          <button className={filter === 'active' ? 'on' : ''} onClick={() => setFilter('active')}>활성/미확인</button>
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>전체 이력</button>
        </div>
        <div className="spacer" />
        <button className="btn sm" onClick={() => useTwin.getState().ackAll()}>전체 확인 (ACK)</button>
        <button className="btn sm" onClick={() => useTwin.getState().clearAlarmHistory()}>이력 정리</button>
        <button
          className="btn sm"
          onClick={() =>
            download(
              `alarms_${Date.now()}.csv`,
              ['raised,cleared,acked,severity,equipment,tag,text,value', ...alarms.map((a) => [new Date(a.raisedAt).toISOString(), a.clearedAt ? new Date(a.clearedAt).toISOString() : '', a.ackedAt ? new Date(a.ackedAt).toISOString() : '', a.severity, a.equipmentId ?? '', a.tagId, `"${a.text}"`, a.value].join(','))].join('\n'),
              'text/csv',
            )
          }
        >
          CSV
        </button>
      </div>
      <div className="panel-body">
        <table className="table">
          <thead>
            <tr><th>발생</th><th>해제</th><th>심각도</th><th>설비</th><th>메시지</th><th>값</th><th>태그</th><th>상태</th><th /></tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr
                key={a.key}
                className={`click ${a.active ? 'alarm-active' : 'alarm-cleared'} ${a.ackedAt ? '' : 'unack'}`}
                onClick={() => { if (a.equipmentId) { useTwin.getState().select(a.equipmentId); useTwin.getState().focus(a.equipmentId); } }}
              >
                <td className="mono">{fmtTime(a.raisedAt)}</td>
                <td className="mono">{a.clearedAt ? fmtTime(a.clearedAt) : ''}</td>
                <td><span className={`sev ${a.severity}`}>{a.severity.toUpperCase()}</span></td>
                <td>{name(a.equipmentId)}</td>
                <td>{a.text}</td>
                <td className="num">{typeof a.value === 'number' ? a.value.toFixed(2) : String(a.value)}</td>
                <td className="mono">{a.tagId}</td>
                <td>{a.active ? '발생' : '해제'}{a.ackedAt ? ' · 확인' : ''}</td>
                <td>{!a.ackedAt && <button className="btn sm" onClick={(e) => { e.stopPropagation(); useTwin.getState().ackAlarm(a.key); }}>확인</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <div className="empty">표시할 알람이 없습니다 ✓</div>}
      </div>
    </div>
  );
}

function TagRow({ t, onEdit }: { t: TagDef; onEdit: () => void }) {
  const v = useTwin((s) => s.values[t.id]);
  const ts = useTwin((s) => s.updatedAt[t.id]);
  const alarm = isAlarmValue(t, v);
  return (
    <tr className="click" onDoubleClick={onEdit}>
      <td className="mono">{t.id}</td>
      <td>{t.name}</td>
      <td className="mono">{t.source}</td>
      <td className="mono">{t.address}</td>
      <td className="mono">{t.dataType.toUpperCase()}</td>
      <td className="num" style={{ color: alarm ? '#fca5a5' : undefined }}>{fmtValue(t, v)}</td>
      <td>{t.unit}</td>
      <td className="mono">{ts ? fmtTime(ts) : '—'}</td>
      <td>{t.writable ? 'R/W' : 'R'}</td>
      <td><button className="btn sm" onClick={onEdit}>편집</button></td>
    </tr>
  );
}

function Tags() {
  const tags = useTwin((s) => s.plant.tags);
  const connections = useTwin((s) => s.plant.connections);
  const [q, setQ] = useState('');
  const [src, setSrc] = useState('');
  const [edit, setEdit] = useState<{ tag: TagDef; isNew?: boolean } | null>(null);
  const list = useMemo(() => {
    const ql = q.toLowerCase();
    return tags.filter((t) => (!src || t.source === src) && (!ql || `${t.id} ${t.name} ${t.address}`.toLowerCase().includes(ql)));
  }, [tags, q, src]);

  const exportTags = () => {
    const head = 'id,name,source,address,dataType,unit,min,max,writable,alarmHigh,alarmLow,alarmOnTrue';
    const rows = tags.map((t) => [t.id, `"${t.name}"`, t.source, t.address, t.dataType, t.unit ?? '', t.min ?? '', t.max ?? '', t.writable ? 1 : 0, t.alarmHigh ?? '', t.alarmLow ?? '', t.alarmOnTrue ? 1 : 0].join(','));
    download(`tags_${Date.now()}.csv`, [head, ...rows].join('\n'), 'text/csv');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 6, padding: 6, borderBottom: '1px solid var(--line)' }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder="태그 검색 (ID / 이름 / 주소)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 180 }} value={src} onChange={(e) => setSrc(e.target.value)}>
          <option value="">모든 소스</option>
          {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span style={{ alignSelf: 'center', color: 'var(--text-3)', fontSize: 12 }}>{list.length} / {tags.length}</span>
        <div className="spacer" />
        <button className="btn sm" onClick={() => setEdit({ isNew: true, tag: { id: 'NEW.tag', name: '새 태그', address: '', source: connections[0]?.id ?? 'plc1', dataType: 'real', decimals: 1 } })}>+ 태그</button>
        <button className="btn sm" onClick={exportTags}>CSV 내보내기</button>
      </div>
      <div className="panel-body">
        <table className="table">
          <thead>
            <tr><th>태그 ID</th><th>이름</th><th>소스</th><th>주소</th><th>타입</th><th style={{ textAlign: 'right' }}>값</th><th>단위</th><th>갱신</th><th>R/W</th><th /></tr>
          </thead>
          <tbody>
            {list.map((t) => <TagRow key={t.id} t={t} onEdit={() => setEdit({ tag: t })} />)}
          </tbody>
        </table>
      </div>
      {edit && <TagEditor tag={edit.tag} isNew={edit.isNew} onClose={() => setEdit(null)} />}
    </div>
  );
}

function Events() {
  const events = useTwin((s) => s.events);
  const color = { info: '#93a4b8', write: '#22d3ee', conn: '#4ade80', alarm: '#fbbf24', error: '#f87171' } as const;
  return (
    <div className="panel-body">
      <table className="table">
        <thead><tr><th>시각</th><th>구분</th><th>내용</th></tr></thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={i}>
              <td className="mono">{fmtTime(e.t)}</td>
              <td style={{ color: color[e.kind] }}>{e.kind.toUpperCase()}</td>
              <td style={{ whiteSpace: 'normal' }}>{e.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BottomPanel() {
  const tab = useTwin((s) => s.ui.bottomTab);
  const open = useTwin((s) => s.ui.bottomOpen);
  const setUi = useTwin((s) => s.setUi);
  const active = useTwin((s) => s.alarms.filter((a) => a.active).length);
  const tagCount = useTwin((s) => s.plant.tags.length);
  const tabs = [
    { k: 'alarms', l: '알람', c: active, bad: active > 0 },
    { k: 'trend', l: '트렌드' },
    { k: 'tags', l: '태그 모니터', c: tagCount },
    { k: 'events', l: '이벤트 로그' },
  ] as const;
  return (
    <section className="panel bottom">
      <div className="panel-head" style={{ padding: '0 6px 0 0' }}>
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t.k} className={`tab ${tab === t.k && open ? 'on' : ''}`} onClick={() => setUi({ bottomTab: t.k, bottomOpen: true })}>
              {t.l}
              {'c' in t && <span className={`count ${'bad' in t && t.bad ? 'bad' : ''}`}>{t.c}</span>}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={() => setUi({ bottomOpen: !open })}>{open ? '▾ 접기' : '▴ 펼치기'}</button>
      </div>
      {open && (
        <div style={{ flex: 1, minHeight: 0 }}>
          {tab === 'alarms' && <Alarms />}
          {tab === 'trend' && <Trend />}
          {tab === 'tags' && <Tags />}
          {tab === 'events' && <Events />}
        </div>
      )}
    </section>
  );
}
