import { useMemo, useState } from 'react';
import { STATUS_META, computeStatus, useTwin } from '../store/useTwin';
import { CATALOG, CATALOG_LIST } from '../config/catalog';
import type { Equipment, EquipmentType } from '../types';

function TreeItem({ eq }: { eq: Equipment }) {
  const selected = useTwin((s) => s.selectedId === eq.id);
  const status = useTwin((s) => computeStatus(eq, s));
  return (
    <div
      className={`tree-item ${selected ? 'sel' : ''}`}
      onClick={() => useTwin.getState().select(eq.id)}
      onDoubleClick={() => useTwin.getState().focus(eq.id)}
      onMouseEnter={() => useTwin.getState().hover(eq.id)}
      onMouseLeave={() => useTwin.getState().hover(null)}
      title={`${eq.name} (${STATUS_META[status].label}) — 더블클릭: 카메라 이동`}
    >
      <span className="ic">{CATALOG[eq.type].icon}</span>
      <span className="nm">{eq.name}</span>
      <span className="id">{eq.id}</span>
      <i className={`dot ${status === 'run' ? 'ok' : status === 'alarm' ? 'bad blink' : status === 'idle' || status === 'warning' ? 'warn' : ''}`} />
    </div>
  );
}

function Tree() {
  const equipment = useTwin((s) => s.plant.equipment);
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const m = new Map<string, Equipment[]>();
    const ql = q.trim().toLowerCase();
    for (const e of equipment) {
      if (ql && !`${e.name} ${e.id} ${CATALOG[e.type].label}`.toLowerCase().includes(ql)) continue;
      const g = e.group || '미분류';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(e);
    }
    return [...m.entries()];
  }, [equipment, q]);

  return (
    <>
      <div className="search">
        <input className="input" placeholder="설비 검색 (이름 / ID / 종류)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="panel-body">
        {groups.map(([g, list]) => (
          <div key={g} className="tree-group">
            <div className="tree-group-head" onClick={() => setClosed((c) => ({ ...c, [g]: !c[g] }))}>
              <span>{closed[g] ? '▸' : '▾'}</span> {g} <span style={{ marginLeft: 'auto' }}>{list.length}</span>
            </div>
            {!closed[g] && list.map((e) => <TreeItem key={e.id} eq={e} />)}
          </div>
        ))}
        {!groups.length && <div className="empty">검색 결과 없음</div>}
      </div>
    </>
  );
}

function Library() {
  const addEquipment = useTwin((s) => s.addEquipment);
  const setDialog = useTwin((s) => s.setDialog);
  const setUi = useTwin((s) => s.setUi);
  const add = (type: EquipmentType) => {
    if (type === 'imported') {
      setDialog('import');
      return;
    }
    const id = addEquipment(type, [Math.round((Math.random() - 0.5) * 8), 0, Math.round(4 + Math.random() * 3)], { group: '신규' });
    setUi({ editMode: true });
    useTwin.getState().focus(id);
  };
  return (
    <div className="panel-body">
      <div className="note" style={{ margin: 8 }}>
        설비를 클릭하면 공장에 배치되고 <b>기본 태그 세트</b>가 자동 생성됩니다. 편집 모드에서 위치를 조정하고, 오른쪽 패널에서 PLC 주소/LabVIEW 변수를 지정하세요.
      </div>
      <div className="palette">
        {CATALOG_LIST.map((c) => (
          <button key={c.type} className="pal-item" onClick={() => add(c.type)} title={c.description}>
            <span className="pi">{c.icon}</span>
            <span className="pn">{c.label}</span>
            <span className="pd">{c.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function LeftPanel() {
  const [tab, setTab] = useState<'tree' | 'lib'>('tree');
  return (
    <aside className="panel left">
      <div className="panel-head" style={{ padding: 0 }}>
        <div className="tabs">
          <button className={`tab ${tab === 'tree' ? 'on' : ''}`} onClick={() => setTab('tree')}>설비 계층</button>
          <button className={`tab ${tab === 'lib' ? 'on' : ''}`} onClick={() => setTab('lib')}>설비 라이브러리</button>
        </div>
      </div>
      {tab === 'tree' ? <Tree /> : <Library />}
    </aside>
  );
}
