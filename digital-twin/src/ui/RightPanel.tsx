import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { STATUS_META, computeStatus, getTag, useTwin } from '../store/useTwin';
import { CATALOG } from '../config/catalog';
import { writeTag } from '../data/manager';
import { useImportMeta } from '../three/models/Imported';
import { Sparkline, Switch, fmtTime, fmtValue, isAlarmValue, toast } from './common';
import { TagEditor } from './TagEditor';
import type { Equipment, EquipmentStatus, NodeAnimation, TagDef } from '../types';

// ─────────────────────────────────────────────────────────
//  실시간 값 + 제어
// ─────────────────────────────────────────────────────────
function NumericControl({ tag }: { tag: TagDef }) {
  const cur = useTwin((s) => s.values[tag.id]);
  const [v, setV] = useState<string>('');
  useEffect(() => {
    if (v === '' && typeof cur === 'number') setV(cur.toFixed(tag.decimals ?? 1));
  }, [cur, v, tag.decimals]);
  const min = tag.min ?? 0, max = tag.max ?? 100;
  const apply = () => {
    const n = Number(v);
    if (!Number.isFinite(n)) return toast('숫자를 입력하세요', 'error');
    writeTag(tag.id, n).then(() => toast(`${tag.name} ← ${n}`), (e: Error) => toast(e.message, 'error'));
  };
  return (
    <div className="ctrl">
      <input type="range" min={min} max={max} step={(max - min) / 200} value={Number(v) || 0} onChange={(e) => setV(e.target.value)} />
      <input className="input mono" style={{ width: 74 }} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} />
      <button className="btn sm primary" onClick={apply}>쓰기</button>
    </div>
  );
}

function ValueRow({ role, label, tagId }: { role: string; label: string; tagId: string }) {
  const tag = useTwin((s) => getTag(s.plant, tagId));
  const v = useTwin((s) => s.values[tagId]);
  const editMode = useTwin((s) => s.ui.editMode);
  const [edit, setEdit] = useState(false);
  if (!tag) return (
    <div className="val-row">
      <div className="vl">{label}<small>{tagId} (태그 없음)</small></div>
      <div className="vv">—</div>
    </div>
  );
  const alarm = isAlarmValue(tag, v);
  const numeric = tag.dataType === 'real' || tag.dataType === 'int';
  const ranged = numeric && tag.min !== undefined && tag.max !== undefined && typeof v === 'number';
  return (
    <div className="val-row" data-role={role}>
      <div className="vl">
        {label}
        <small title={`${tag.id} @ ${tag.source}:${tag.address}`}>{tag.source}:{tag.address || '(주소 미지정)'}</small>
      </div>
      <div className={`vv ${alarm ? 'alarm' : ''}`}>
        {tag.dataType === 'bool' ? (
          <span className="chip" style={{ color: v ? '#4ade80' : '#94a3b8' }}>{fmtValue(tag, v)}</span>
        ) : (
          <>{fmtValue(tag, v)} <small>{tag.unit}</small></>
        )}
      </div>
      {ranged && (
        <div className="bar">
          <i style={{ width: `${Math.max(0, Math.min(100, (((v as number) - tag.min!) / (tag.max! - tag.min!)) * 100))}%`, background: alarm ? '#ef4444' : undefined }} />
        </div>
      )}
      {numeric && <Sparkline tagId={tag.id} min={tag.min} max={tag.max} color={alarm ? '#ef4444' : '#22d3ee'} />}
      {tag.writable && (
        tag.dataType === 'bool' ? (
          <div className="ctrl">
            <Switch on={!!v} onChange={(nv) => writeTag(tag.id, nv).catch((e: Error) => toast(e.message, 'error'))} />
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>HMI 제어</span>
          </div>
        ) : numeric ? <NumericControl tag={tag} /> : null
      )}
      {editMode && (
        <div className="ctrl">
          <button className="btn sm" onClick={() => setEdit(true)}>태그 편집</button>
        </div>
      )}
      {edit && <TagEditor tag={tag} onClose={() => setEdit(false)} />}
    </div>
  );
}

function Monitor({ eq }: { eq: Equipment }) {
  const roles = CATALOG[eq.type].roles;
  const alarms = useTwin(useShallow((s) => s.alarms.filter((a) => a.active && a.equipmentId === eq.id)));
  const runTag = useTwin((s) => (eq.bindings.run ? getTag(s.plant, eq.bindings.run) : undefined));
  const known = new Set(roles.map((r) => r.role));
  const extra = Object.keys(eq.bindings).filter((r) => !known.has(r));
  const cmd = (v: boolean) => runTag && writeTag(runTag.id, v).then(() => toast(`${eq.name} ${v ? '운전' : '정지'} 지령`), (e: Error) => toast(e.message, 'error'));
  return (
    <>
      {runTag?.writable && (
        <div className="section">
          <h4>운전 지령</h4>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn primary" style={{ flex: 1 }} onClick={() => cmd(true)}>▶ 운전</button>
            <button className="btn danger" style={{ flex: 1 }} onClick={() => cmd(false)}>■ 정지</button>
          </div>
        </div>
      )}
      {alarms.length > 0 && (
        <div className="section">
          <h4 style={{ color: '#fca5a5' }}>활성 알람 {alarms.length}</h4>
          {alarms.map((a) => (
            <div key={a.key} className="val-row" style={{ borderColor: '#7f1d1d' }}>
              <div className="vl"><span><span className={`sev ${a.severity}`}>{a.severity.toUpperCase()}</span> {a.text}</span><small>{fmtTime(a.raisedAt)} · {a.tagId}</small></div>
              <div>{!a.ackedAt && <button className="btn sm" onClick={() => useTwin.getState().ackAlarm(a.key)}>확인</button>}</div>
            </div>
          ))}
        </div>
      )}
      <div className="section">
        <h4>실시간 데이터</h4>
        {roles.filter((r) => eq.bindings[r.role]).map((r) => (
          <ValueRow key={r.role} role={r.role} label={r.label} tagId={eq.bindings[r.role]} />
        ))}
        {extra.map((r) => <ValueRow key={r} role={r} label={r} tagId={eq.bindings[r]} />)}
        {!Object.keys(eq.bindings).length && <div className="empty">바인딩된 태그가 없습니다. ‘바인딩’ 탭에서 연결하세요.</div>}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
//  태그 바인딩
// ─────────────────────────────────────────────────────────
function Bindings({ eq }: { eq: Equipment }) {
  const tags = useTwin((s) => s.plant.tags);
  const connections = useTwin((s) => s.plant.connections);
  const updateEquipment = useTwin((s) => s.updateEquipment);
  const [editing, setEditing] = useState<{ tag: TagDef; isNew?: boolean } | null>(null);
  const [newRole, setNewRole] = useState('');
  const roles = CATALOG[eq.type].roles;
  const allRoles = [...roles.map((r) => ({ role: r.role, label: r.label, spec: r })), ...Object.keys(eq.bindings).filter((r) => !roles.some((x) => x.role === r)).map((r) => ({ role: r, label: r, spec: undefined }))];

  const setBinding = (role: string, tagId: string) => {
    const b = { ...eq.bindings };
    if (tagId) b[role] = tagId;
    else delete b[role];
    updateEquipment(eq.id, { bindings: b });
  };
  const createTag = (role: string) => {
    const spec = roles.find((r) => r.role === role);
    setEditing({
      isNew: true,
      tag: {
        id: `${eq.id}.${role}`, name: `${eq.name} ${spec?.label ?? role}`, address: '', source: connections[0]?.id ?? 'plc1',
        dataType: spec?.dataType ?? 'real', unit: spec?.unit, min: spec?.min, max: spec?.max, writable: spec?.writable,
        alarmOnTrue: spec?.alarmOnTrue, alarmHigh: spec?.alarmHigh, alarmLow: spec?.alarmLow, alarmSeverity: spec?.alarmSeverity,
      },
    });
  };

  return (
    <div className="section">
      <h4>역할(Role) ↔ 태그 매핑</h4>
      <div className="note">각 역할에 PLC/LabVIEW 태그를 연결하면 3D 모델 동작·상태 색상·알람이 자동으로 연동됩니다.</div>
      <datalist id="tag-list">{tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</datalist>
      {allRoles.map(({ role, label, spec }) => {
        const tagId = eq.bindings[role] ?? '';
        const tag = tags.find((t) => t.id === tagId);
        return (
          <div key={role} className="bind-row">
            <span className="role" title={spec ? `${spec.dataType}${spec.unit ? ' · ' + spec.unit : ''}` : ''}>{label}</span>
            <input className="input mono" list="tag-list" value={tagId} placeholder="(미연결)" onChange={(e) => setBinding(role, e.target.value)} />
            {tag ? (
              <button className="btn sm" onClick={() => setEditing({ tag })} title={`${tag.source}:${tag.address}`}>편집</button>
            ) : (
              <button className="btn sm" onClick={() => createTag(role)}>생성</button>
            )}
          </div>
        );
      })}
      <div className="bind-row">
        <input className="input" placeholder="사용자 역할 추가" value={newRole} onChange={(e) => setNewRole(e.target.value.replace(/\s/g, ''))} />
        <span />
        <button className="btn sm" disabled={!newRole} onClick={() => { setBinding(newRole, `${eq.id}.${newRole}`); createTag(newRole); setNewRole(''); }}>추가</button>
      </div>
      {editing && <TagEditor tag={editing.tag} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  형상 / 배치
// ─────────────────────────────────────────────────────────
function NumInput({ value, onChange, step = 0.1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  const [s, setS] = useState(String(value));
  useEffect(() => setS(String(value)), [value]);
  return (
    <input
      className="input mono"
      type="number"
      step={step}
      value={s}
      onChange={(e) => {
        setS(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

function Geometry({ eq }: { eq: Equipment }) {
  const updateEquipment = useTwin((s) => s.updateEquipment);
  const updateParams = useTwin((s) => s.updateParams);
  const duplicate = useTwin((s) => s.duplicateEquipment);
  const remove = useTwin((s) => s.removeEquipment);
  const spec = CATALOG[eq.type];
  const [pts, setPts] = useState(() => JSON.stringify(eq.params.points ?? []));
  useEffect(() => setPts(JSON.stringify(eq.params.points ?? [])), [eq.params.points]);

  const setPos = (i: number, v: number) => {
    const p = [...eq.position] as [number, number, number];
    p[i] = v;
    updateEquipment(eq.id, { position: p });
  };
  const setRot = (i: number, v: number) => {
    const r = [...eq.rotation] as [number, number, number];
    r[i] = v;
    updateEquipment(eq.id, { rotation: r });
  };

  return (
    <>
      <div className="section">
        <h4>기본 정보</h4>
        <div className="kv">
          <span>이름</span><input className="input" value={eq.name} onChange={(e) => updateEquipment(eq.id, { name: e.target.value })} />
          <span>그룹 / 라인</span><input className="input" value={eq.group ?? ''} onChange={(e) => updateEquipment(eq.id, { group: e.target.value || undefined })} />
          <span>설명</span><input className="input" value={eq.description ?? ''} onChange={(e) => updateEquipment(eq.id, { description: e.target.value || undefined })} />
        </div>
      </div>
      <div className="section">
        <h4>배치 (m / °)</h4>
        <div className="grid3">
          {(['X', 'Y', 'Z'] as const).map((a, i) => (
            <label key={a} className="field">위치 {a}<NumInput value={eq.position[i]} onChange={(v) => setPos(i, v)} /></label>
          ))}
          {(['X', 'Y', 'Z'] as const).map((a, i) => (
            <label key={a} className="field">회전 {a}<NumInput value={eq.rotation[i]} step={15} onChange={(v) => setRot(i, v)} /></label>
          ))}
          <label className="field">배율<NumInput value={eq.scale ?? 1} onChange={(v) => updateEquipment(eq.id, { scale: v })} /></label>
        </div>
      </div>
      <div className="section">
        <h4>형상 파라미터</h4>
        <div className="kv">
          {spec.params.map((p) => (
            <ParamField key={p.key} label={p.label}>
              {p.kind === 'number' ? (
                <NumInput value={Number(eq.params[p.key] ?? 0)} step={p.step} onChange={(v) => updateParams(eq.id, { [p.key]: v })} />
              ) : p.kind === 'color' ? (
                <input className="input" type="color" value={String(eq.params[p.key] ?? '#888888')} onChange={(e) => updateParams(eq.id, { [p.key]: e.target.value })} />
              ) : p.kind === 'bool' ? (
                <Switch on={!!eq.params[p.key]} onChange={(v) => updateParams(eq.id, { [p.key]: v })} />
              ) : (
                <input className="input" value={String(eq.params[p.key] ?? '')} onChange={(e) => updateParams(eq.id, { [p.key]: e.target.value })} />
              )}
            </ParamField>
          ))}
        </div>
        {eq.type === 'pipe' && (
          <label className="field">
            경로 꺾임점 [[x,y,z], …] (m)
            <textarea className="input" rows={4} value={pts} onChange={(e) => setPts(e.target.value)} />
            <button
              className="btn sm"
              onClick={() => {
                try {
                  const v = JSON.parse(pts);
                  if (!Array.isArray(v) || v.some((p) => !Array.isArray(p) || p.length !== 3)) throw new Error();
                  updateParams(eq.id, { points: v });
                } catch {
                  toast('형식 오류: [[x,y,z], ...]', 'error');
                }
              }}
            >
              경로 적용
            </button>
          </label>
        )}
      </div>
      <div className="section">
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" onClick={() => useTwin.getState().focus(eq.id)}>⌖ 포커스</button>
          <button className="btn" onClick={() => duplicate(eq.id)}>⧉ 복제</button>
          <div className="spacer" />
          <button className="btn danger" onClick={() => confirm(`${eq.name} 을(를) 삭제할까요? (전용 태그도 함께 삭제)`) && remove(eq.id)}>삭제</button>
        </div>
      </div>
    </>
  );
}

function ParamField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span>{label}</span>
      <div>{children}</div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
//  임포트 CAD 노드 애니메이션
// ─────────────────────────────────────────────────────────
function Animations({ eq }: { eq: Equipment }) {
  const nodes = useImportMeta((s) => s.nodes[eq.id] ?? []);
  const status = useImportMeta((s) => s.status[eq.id]);
  const tags = useTwin((s) => s.plant.tags);
  const updateEquipment = useTwin((s) => s.updateEquipment);
  const list = eq.animations ?? [];
  const set = (i: number, patch: Partial<NodeAnimation>) => updateEquipment(eq.id, { animations: list.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
  return (
    <div className="section">
      <h4>노드 애니메이션 (태그 → 동작)</h4>
      <div className="note">
        CAD 어셈블리의 파트(노드)를 태그 값으로 회전/이동/표시/색상 변경합니다. 예) 회전: 값 × 배율(°) + 오프셋. 상태: {status ?? '-'} · 노드 {nodes.length}개
      </div>
      <datalist id="node-list">{nodes.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="tag-list2">{tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</datalist>
      {list.map((a, i) => (
        <div key={i} className="card" style={{ padding: 8, gap: 6 }}>
          <div className="grid2">
            <label className="field">노드<input className="input mono" list="node-list" value={a.node} onChange={(e) => set(i, { node: e.target.value })} /></label>
            <label className="field">태그<input className="input mono" list="tag-list2" value={a.tag} onChange={(e) => set(i, { tag: e.target.value })} /></label>
          </div>
          <div className="grid3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <label className="field">동작
              <select className="input" value={a.mode} onChange={(e) => set(i, { mode: e.target.value as NodeAnimation['mode'] })}>
                <option value="rotate">회전</option><option value="translate">이동</option><option value="visible">표시</option><option value="color">경고색</option>
              </select>
            </label>
            <label className="field">축
              <select className="input" value={a.axis} onChange={(e) => set(i, { axis: e.target.value as NodeAnimation['axis'] })}>
                <option value="x">X</option><option value="y">Y</option><option value="z">Z</option>
              </select>
            </label>
            <label className="field">배율<NumInput value={a.scale} onChange={(v) => set(i, { scale: v })} /></label>
            <label className="field">오프셋<NumInput value={a.offset} onChange={(v) => set(i, { offset: v })} /></label>
          </div>
          <button className="btn sm danger" onClick={() => updateEquipment(eq.id, { animations: list.filter((_, k) => k !== i) })}>제거</button>
        </div>
      ))}
      <button className="btn" onClick={() => updateEquipment(eq.id, { animations: [...list, { node: nodes[0] ?? '', mode: 'rotate', axis: 'y', tag: '', scale: 1, offset: 0 }] })}>
        + 애니메이션 추가
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  개요 (선택 없음)
// ─────────────────────────────────────────────────────────
function Overview() {
  const equipment = useTwin((s) => s.plant.equipment);
  const statuses = useTwin((s) => s.plant.equipment.map((e) => computeStatus(e, s)).join(','));
  const list = statuses ? (statuses.split(',') as EquipmentStatus[]) : [];
  const counts = useMemo(() => {
    const c: Record<EquipmentStatus, number> = { run: 0, idle: 0, alarm: 0, warning: 0, offline: 0 };
    list.forEach((s) => c[s]++);
    return c;
  }, [statuses]); // eslint-disable-line react-hooks/exhaustive-deps
  const conn = useTwin((s) => s.conn);
  const connections = useTwin((s) => s.plant.connections);
  const simulation = useTwin((s) => s.simulation);
  const tags = useTwin((s) => s.plant.tags);
  const util = list.length ? Math.round((counts.run / list.length) * 100) : 0;
  return (
    <div className="panel-body">
      <div className="section">
        <h4>공장 현황</h4>
        <div className="overview-stats">
          {(Object.keys(counts) as EquipmentStatus[]).map((k) => (
            <div key={k} className="ov-stat">
              <div className="n" style={{ color: STATUS_META[k].color }}>{counts[k]}</div>
              <div className="l"><i className="dot" style={{ background: STATUS_META[k].color }} />{STATUS_META[k].label}</div>
            </div>
          ))}
          <div className="ov-stat">
            <div className="n">{util}%</div>
            <div className="l">설비 가동률</div>
          </div>
        </div>
      </div>
      <div className="section">
        <h4>데이터 연결</h4>
        <div className="val-row">
          <div className="vl">내장 시뮬레이터<small>비활성 연결의 태그 값 생성</small></div>
          <div className="vv"><span className="chip" style={{ color: simulation ? '#c4b5fd' : '#94a3b8' }}>{simulation ? 'ON' : 'OFF'}</span></div>
        </div>
        {connections.map((c) => {
          const st = conn[c.id];
          const n = tags.filter((t) => t.source === c.id).length;
          return (
            <div key={c.id} className="val-row">
              <div className="vl">{c.name}<small>{c.kind.toUpperCase()} · {c.url} · 태그 {n}</small></div>
              <div className="vv"><span className="chip" style={{ color: st?.state === 'connected' ? '#4ade80' : c.enabled ? '#fca5a5' : '#94a3b8' }}>{c.enabled ? st?.state ?? '—' : '비활성'}</span></div>
            </div>
          );
        })}
        <button className="btn" onClick={() => useTwin.getState().setDialog('connections')}>연결 설정 열기</button>
      </div>
      <div className="section">
        <h4>설비 상태 목록</h4>
        {equipment.map((e, i) => (
          <div key={e.id} className="tree-item" style={{ paddingLeft: 8 }} onClick={() => useTwin.getState().select(e.id)} onDoubleClick={() => useTwin.getState().focus(e.id)}>
            <span className="ic">{CATALOG[e.type].icon}</span>
            <span className="nm">{e.name}</span>
            <span className="chip" style={{ color: STATUS_META[list[i] ?? 'offline'].color }}>{STATUS_META[list[i] ?? 'offline'].label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
export function RightPanel() {
  const selectedId = useTwin((s) => s.selectedId);
  const eq = useTwin((s) => s.plant.equipment.find((e) => e.id === s.selectedId));
  const status = useTwin((s) => (eq ? computeStatus(eq, s) : 'offline'));
  const [tab, setTab] = useState<'mon' | 'bind' | 'geo' | 'anim'>('mon');
  useEffect(() => {
    if (tab === 'anim' && eq?.type !== 'imported') setTab('mon');
  }, [eq?.type, tab]);

  return (
    <aside className="panel right">
      <div className="panel-head">
        <h3>{eq ? '설비 정보' : '개요'}</h3>
        <div className="spacer" />
        {selectedId && <button className="btn ghost sm" onClick={() => useTwin.getState().select(null)}>✕</button>}
      </div>
      {!eq ? (
        <Overview />
      ) : (
        <>
          <div className="insp-head">
            <div className="nm">{eq.name}</div>
            <div className="meta">
              <span className="chip"><i className="dot" style={{ background: STATUS_META[status].color }} />{STATUS_META[status].label}</span>
              <span className="chip">{CATALOG[eq.type].icon} {CATALOG[eq.type].label}</span>
              <span className="chip mono">{eq.id}</span>
              {eq.group && <span className="chip">{eq.group}</span>}
            </div>
          </div>
          <div className="panel-head" style={{ padding: 0 }}>
            <div className="tabs">
              <button className={`tab ${tab === 'mon' ? 'on' : ''}`} onClick={() => setTab('mon')}>모니터</button>
              <button className={`tab ${tab === 'bind' ? 'on' : ''}`} onClick={() => setTab('bind')}>태그 바인딩</button>
              <button className={`tab ${tab === 'geo' ? 'on' : ''}`} onClick={() => setTab('geo')}>형상/배치</button>
              {eq.type === 'imported' && <button className={`tab ${tab === 'anim' ? 'on' : ''}`} onClick={() => setTab('anim')}>애니메이션</button>}
            </div>
          </div>
          <div className="panel-body">
            {tab === 'mon' && <Monitor eq={eq} />}
            {tab === 'bind' && <Bindings eq={eq} />}
            {tab === 'geo' && <Geometry eq={eq} />}
            {tab === 'anim' && <Animations eq={eq} />}
          </div>
        </>
      )}
    </aside>
  );
}
