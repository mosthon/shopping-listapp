import { useEffect, useRef, useState } from 'react';
import { useTwin } from '../store/useTwin';
import { Modal, Switch, download, toast } from './common';
import { SUPPORTED_EXT, saveAsset, listAssets, deleteAsset, getAsset } from '../utils/assets';
import { parseAsset } from '../three/loaders';
import { clearHistory } from '../store/history';
import type { ConnectionDef, KpiDef, PlantConfig } from '../types';
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────
//  연결 설정 (LabVIEW / PLC 게이트웨이)
// ─────────────────────────────────────────────────────────
function ConnectionCard({ c, onChange, onRemove }: { c: ConnectionDef; onChange: (c: ConnectionDef) => void; onRemove: () => void }) {
  const st = useTwin((s) => s.conn[c.id]);
  const tagCount = useTwin((s) => s.plant.tags.filter((t) => t.source === c.id).length);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const color = !c.enabled ? '' : st?.state === 'connected' ? 'ok' : st?.state === 'connecting' ? 'warn blink' : 'bad';
  return (
    <div className="card">
      <div className="card-head">
        <i className={`dot ${color}`} />
        <span className="t">{c.name}</span>
        <span className="chip mono">{c.id}</span>
        <span className="chip">태그 {tagCount}</span>
        <div className="spacer" />
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.enabled ? '활성' : '비활성 (시뮬레이션)'}</span>
        <Switch on={c.enabled} onChange={(v) => onChange({ ...c, enabled: v })} />
      </div>
      <div className="grid2">
        <label className="field">이름<input className="input" value={c.name} onChange={(e) => onChange({ ...c, name: e.target.value })} /></label>
        <label className="field">
          방식
          <select className="input" value={c.kind} onChange={(e) => onChange({ ...c, kind: e.target.value as ConnectionDef['kind'] })}>
            <option value="websocket">WebSocket (실시간 푸시)</option>
            <option value="rest">REST / HTTP 폴링</option>
          </select>
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          URL
          <input className="input mono" value={c.url} placeholder={c.kind === 'websocket' ? 'ws://192.168.0.10:8090/plc' : 'http://192.168.0.10:8080/api'} onChange={(e) => onChange({ ...c, url: e.target.value })} />
        </label>
        <label className="field">장치 설명<input className="input" value={c.device ?? ''} onChange={(e) => onChange({ ...c, device: e.target.value })} /></label>
        <label className="field">폴링 주기 (ms, REST)<input className="input mono" type="number" min={50} value={c.intervalMs} onChange={(e) => onChange({ ...c, intervalMs: Math.max(50, Number(e.target.value)) })} /></label>
      </div>
      {c.enabled && (
        <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span>상태: <b>{st?.state ?? '-'}</b></span>
          <span>{st?.message}</span>
          <span>RX {st?.rx ?? 0} · TX {st?.tx ?? 0}</span>
          {st?.lastRx && <span>마지막 수신 {((Date.now() - st.lastRx) / 1000).toFixed(1)}s 전</span>}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn sm danger" onClick={onRemove}>연결 삭제</button>
      </div>
    </div>
  );
}

export function ConnectionsDialog() {
  const connections = useTwin((s) => s.plant.connections);
  const setConnections = useTwin((s) => s.setConnections);
  const simulation = useTwin((s) => s.simulation);
  const setSimulation = useTwin((s) => s.setSimulation);
  const close = () => useTwin.getState().setDialog(null);
  const [draft, setDraft] = useState(connections);
  const dirty = JSON.stringify(draft) !== JSON.stringify(connections);

  const add = () => {
    let n = 1;
    while (draft.some((c) => c.id === `conn${n}`)) n++;
    setDraft([...draft, { id: `conn${n}`, name: `새 연결 ${n}`, kind: 'websocket', url: 'ws://localhost:8090/', enabled: false, intervalMs: 500 }]);
  };

  return (
    <Modal
      title="데이터 연결 — LabVIEW / PLC"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={add}>+ 연결 추가</button>
          <div className="spacer" />
          <button className="btn" onClick={close}>닫기</button>
          <button className="btn primary" disabled={!dirty} onClick={() => { setConnections(draft); toast('연결 설정 적용됨'); }}>적용</button>
        </>
      }
    >
      <div className="card">
        <div className="card-head">
          <i className={`dot ${simulation ? 'sim' : ''}`} />
          <span className="t">내장 시뮬레이터</span>
          <div className="spacer" />
          <Switch on={simulation} onChange={setSimulation} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
          비활성화된 연결에 속한 태그 값을 자동 생성합니다. 실제 장비 연결 전 화면 검증, 시운전 교육에 사용하세요. 연결을 활성화하면 해당 태그만 실제 값으로 전환됩니다.
        </div>
      </div>
      {draft.map((c, i) => (
        <ConnectionCard
          key={i}
          c={c}
          onChange={(nc) => setDraft(draft.map((x, k) => (k === i ? nc : x)))}
          onRemove={() => confirm(`${c.name} 연결을 삭제할까요? (태그는 유지)`) && setDraft(draft.filter((_, k) => k !== i))}
        />
      ))}
      <div className="note">
        <b>통신 구조</b>: 브라우저는 PLC 산업용 프로토콜(Modbus TCP, MC, S7, EtherNet/IP 등)에 직접 접속할 수 없으므로
        <b> 게이트웨이</b>(Node-RED, Python, C# 서비스 또는 LabVIEW 자체)가 PLC와 통신하고 JSON으로 중계합니다.
        LabVIEW는 <code>WebSockets API</code>(LabVIEW 2020+ / NI WebSockets 라이브러리) 또는 <code>Web Service</code>(REST)로 직접 연결할 수 있습니다.
        <br />
        수신 예시: <code>{'{"type":"update","tags":{"TK01.level":52.3,"D100":12}}'}</code> — 키는 태그 ID 또는 주소 모두 가능
        <br />
        쓰기 요청: <code>{'{"type":"write","reqId":"w1","tag":"CV01.run","address":"M0","value":true}'}</code>
        <br />
        자세한 규격은 <code>docs/PROTOCOL.md</code>, 테스트용 모의 게이트웨이는 <code>npm run mock</code>.
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────
//  CAD 모델 임포트
// ─────────────────────────────────────────────────────────
export function ImportDialog() {
  const close = () => useTwin.getState().setDialog(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [assets, setAssets] = useState<Awaited<ReturnType<typeof listAssets>>>([]);
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => listAssets().then(setAssets);
  useEffect(() => { refresh(); }, []);

  const place = async (assetId: string, name: string, ext: string) => {
    // 크기 추정으로 단위 자동 판별 (mm 모델 → 0.001)
    let unitScale = 1;
    try {
      const rec = await getAsset(assetId);
      if (rec) {
        const obj = await parseAsset(rec);
        const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 100) unitScale = 0.001; // mm
        else if (maxDim > 30 && ext !== 'step' && ext !== 'stp') unitScale = 0.01; // cm
      }
    } catch (e) {
      toast(`모델 해석 실패: ${(e as Error).message}`, 'error');
      return;
    }
    const id = useTwin.getState().addEquipment('imported', [0, 0, 6], {
      name: name.replace(/\.[^.]+$/, ''), assetId, group: 'CAD 모델', params: { unitScale, tint: false, color: '#94a3b8' },
    });
    useTwin.getState().setUi({ editMode: true });
    useTwin.getState().focus(id);
    toast(`${name} 배치됨 (단위 배율 ${unitScale})`);
    close();
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const f = files[0];
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    if (!SUPPORTED_EXT.includes(ext)) return toast(`지원하지 않는 형식: .${ext}`, 'error');
    try {
      setBusy(`${f.name} 저장 및 변환 중… ${['step', 'stp', 'iges', 'igs'].includes(ext) ? '(STEP/IGES는 OpenCascade 엔진 로딩으로 시간이 걸릴 수 있습니다)' : ''}`);
      const rec = await saveAsset(f);
      await place(rec.id, rec.name, rec.ext);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <Modal title="3D CAD 모델 임포트" onClose={close}>
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
      >
        <div style={{ fontSize: 28 }}>⬡</div>
        <div><b>CAD 파일을 끌어다 놓거나 클릭하여 선택</b></div>
        <div style={{ fontSize: 12, marginTop: 6 }}>지원: STEP(.stp/.step) · IGES · GLB/GLTF · FBX · OBJ · STL · PLY</div>
        <input ref={input} type="file" hidden accept={SUPPORTED_EXT.map((e) => '.' + e).join(',')} onChange={(e) => onFiles(e.target.files)} />
      </div>
      {busy && <div className="note">⏳ {busy}</div>}
      <div className="note">
        • SolidWorks / Inventor / CATIA / NX → <b>STEP(AP214)</b>으로 내보내면 어셈블리 구조와 색상이 유지됩니다.<br />
        • 실사 품질이 필요하면 Blender 등에서 재질을 입힌 뒤 <b>GLB</b>로 내보내는 것을 권장합니다.<br />
        • 어셈블리의 파트 이름은 ‘애니메이션’ 탭에서 태그와 연결해 회전/이동시킬 수 있습니다 (예: 로봇 관절, 실린더 스트로크).
      </div>
      {assets.length > 0 && (
        <div className="card">
          <div className="card-head"><span className="t">저장된 모델 (브라우저 IndexedDB)</span></div>
          <table className="table">
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className="mono">{(a.size / 1024 / 1024).toFixed(2)} MB</td>
                  <td className="mono">{new Date(a.createdAt).toLocaleString('ko-KR')}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn sm" onClick={() => place(a.id, a.name, a.ext)}>배치</button>{' '}
                    <button className="btn sm danger" onClick={() => deleteAsset(a.id).then(refresh)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────
//  설정 (프로젝트 / KPI / 내보내기)
// ─────────────────────────────────────────────────────────
export function SettingsDialog() {
  const plant = useTwin((s) => s.plant);
  const setPlantMeta = useTwin((s) => s.setPlantMeta);
  const close = () => useTwin.getState().setDialog(null);
  const file = useRef<HTMLInputElement>(null);
  const [kpis, setKpis] = useState<KpiDef[]>(plant.kpis);

  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const p = JSON.parse(await f.text()) as PlantConfig;
      if (!Array.isArray(p.equipment) || !Array.isArray(p.tags)) throw new Error('형식 오류');
      useTwin.getState().loadPlant(p);
      clearHistory();
      toast('레이아웃을 불러왔습니다');
      close();
    } catch (e) {
      toast(`불러오기 실패: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <Modal title="프로젝트 설정" onClose={close}>
      <div className="card">
        <div className="card-head"><span className="t">프로젝트</span></div>
        <div className="grid2">
          <label className="field">라인/프로젝트 이름<input className="input" value={plant.name} onChange={(e) => setPlantMeta({ name: e.target.value })} /></label>
          <label className="field">사이트<input className="input" value={plant.site ?? ''} onChange={(e) => setPlantMeta({ site: e.target.value })} /></label>
          <label className="field">바닥 폭 X (m)<input className="input mono" type="number" min={10} max={300} value={plant.floor.width} onChange={(e) => setPlantMeta({ floor: { ...plant.floor, width: Math.max(10, Number(e.target.value)) } })} /></label>
          <label className="field">바닥 깊이 Z (m)<input className="input mono" type="number" min={10} max={300} value={plant.floor.depth} onChange={(e) => setPlantMeta({ floor: { ...plant.floor, depth: Math.max(10, Number(e.target.value)) } })} /></label>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><span className="t">상단 KPI</span><div className="spacer" />
          <button className="btn sm" onClick={() => setKpis([...kpis, { id: `k${Date.now()}`, label: 'KPI', tag: plant.tags[0]?.id ?? '', decimals: 1 }])}>+ 추가</button>
        </div>
        <datalist id="kpi-tags">{plant.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</datalist>
        {kpis.map((k, i) => (
          <div key={k.id} className="grid3" style={{ gridTemplateColumns: '1fr 1.4fr 70px 60px auto' }}>
            <input className="input" value={k.label} onChange={(e) => setKpis(kpis.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input className="input mono" list="kpi-tags" value={k.tag} onChange={(e) => setKpis(kpis.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)))} />
            <input className="input" placeholder="단위" value={k.unit ?? ''} onChange={(e) => setKpis(kpis.map((x, j) => (j === i ? { ...x, unit: e.target.value || undefined } : x)))} />
            <input className="input mono" type="number" min={0} max={4} value={k.decimals ?? 1} onChange={(e) => setKpis(kpis.map((x, j) => (j === i ? { ...x, decimals: Number(e.target.value) } : x)))} />
            <button className="btn sm danger" onClick={() => setKpis(kpis.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn sm primary" onClick={() => { setPlantMeta({ kpis }); toast('KPI 저장됨'); }}>KPI 적용</button>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><span className="t">레이아웃 파일</span></div>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>설비 배치·태그·연결 설정 전체를 JSON 으로 저장/복원합니다. (임포트 CAD 파일은 브라우저 저장소에 별도 보관)</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => download(`${plant.name.replace(/\s+/g, '_')}.twin.json`, JSON.stringify(plant, null, 2))}>⭳ JSON 내보내기</button>
          <button className="btn" onClick={() => file.current?.click()}>⭱ JSON 불러오기</button>
          <input ref={file} type="file" accept=".json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
          <div className="spacer" />
          <button className="btn danger" onClick={() => { if (confirm('기본 데모 레이아웃으로 초기화할까요? (현재 편집 내용 삭제)')) { useTwin.getState().resetPlant(); clearHistory(); close(); } }}>기본값으로 초기화</button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────
//  도움말
// ─────────────────────────────────────────────────────────
export function HelpDialog() {
  const close = () => useTwin.getState().setDialog(null);
  const K = ({ k }: { k: string }) => <span className="kbd">{k}</span>;
  return (
    <Modal title="사용 안내" onClose={close}>
      <div className="grid2">
        <div className="card">
          <div className="card-head"><span className="t">조작</span></div>
          <div className="kv" style={{ gridTemplateColumns: '130px 1fr' }}>
            <span>좌클릭 드래그</span><span>회전</span>
            <span>우클릭 드래그</span><span>이동 (팬)</span>
            <span>휠</span><span>확대/축소</span>
            <span>클릭 / 더블클릭</span><span>설비 선택 / 포커스</span>
            <span><K k="H" /></span><span>기본 뷰</span>
            <span><K k="F" /></span><span>선택 설비 포커스</span>
            <span><K k="L" /></span><span>라벨 표시 전환</span>
            <span><K k="1" />~<K k="4" /></span><span>실사 / CAD / X-Ray / 상태색</span>
            <span><K k="E" /></span><span>편집 모드</span>
            <span><K k="G" /> / <K k="R" /></span><span>이동 / 회전 기즈모</span>
            <span><K k="Ctrl" />+<K k="D" /></span><span>복제 (편집 모드)</span>
            <span><K k="Del" /></span><span>삭제 (편집 모드)</span>
            <span><K k="Esc" /></span><span>선택 해제</span>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="t">구성 흐름</span></div>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 12.5, color: 'var(--text-2)' }}>
            <li><b>설비 배치</b>: 왼쪽 ‘설비 라이브러리’에서 추가하거나 CAD 파일(STEP/GLB…)을 임포트</li>
            <li><b>편집 모드</b>에서 기즈모로 위치·회전 조정, 오른쪽 ‘형상/배치’에서 치수 입력</li>
            <li><b>태그 바인딩</b>: 역할(운전, 속도, 레벨…)에 PLC 주소 / LabVIEW 변수 지정</li>
            <li><b>연결 설정</b>: 게이트웨이/LabVIEW WebSocket URL 입력 후 활성화</li>
            <li>알람 한계·KPI 지정 후 <b>JSON 내보내기</b>로 프로젝트 보관</li>
          </ol>
        </div>
      </div>
    </Modal>
  );
}
