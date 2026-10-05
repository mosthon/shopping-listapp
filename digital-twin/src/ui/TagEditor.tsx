import { useState } from 'react';
import { useTwin } from '../store/useTwin';
import { Modal, toast } from './common';
import type { AlarmSeverity, TagDataType, TagDef } from '../types';

const optNum = (s: string) => (s.trim() === '' ? undefined : Number(s));

export function TagEditor({ tag, onClose, isNew }: { tag: TagDef; onClose: () => void; isNew?: boolean }) {
  const connections = useTwin((s) => s.plant.connections);
  const tags = useTwin((s) => s.plant.tags);
  const upsertTag = useTwin((s) => s.upsertTag);
  const removeTag = useTwin((s) => s.removeTag);
  const [t, setT] = useState<TagDef>(tag);
  const [str, setStr] = useState({
    min: tag.min?.toString() ?? '', max: tag.max?.toString() ?? '',
    alarmHigh: tag.alarmHigh?.toString() ?? '', alarmLow: tag.alarmLow?.toString() ?? '',
  });
  const set = <K extends keyof TagDef>(k: K, v: TagDef[K]) => setT((x) => ({ ...x, [k]: v }));

  const save = () => {
    if (!t.id.trim()) return toast('태그 ID를 입력하세요', 'error');
    if (t.id !== tag.id && tags.some((x) => x.id === t.id)) return toast('이미 존재하는 태그 ID 입니다', 'error');
    const out: TagDef = {
      ...t,
      min: optNum(str.min), max: optNum(str.max), alarmHigh: optNum(str.alarmHigh), alarmLow: optNum(str.alarmLow),
    };
    upsertTag(out, isNew ? undefined : tag.id);
    toast(`태그 저장: ${out.id}`);
    onClose();
  };

  return (
    <Modal
      title={isNew ? '새 태그' : `태그 편집 — ${tag.id}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          {!isNew && (
            <button className="btn danger" onClick={() => { if (confirm(`태그 ${tag.id} 를 삭제할까요?`)) { removeTag(tag.id); onClose(); } }}>
              삭제
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={save}>저장</button>
        </>
      }
    >
      <div className="grid2">
        <label className="field">태그 ID<input className="input mono" value={t.id} onChange={(e) => set('id', e.target.value)} /></label>
        <label className="field">표시 이름<input className="input" value={t.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="field">
          데이터 소스 (연결)
          <select className="input" value={t.source} onChange={(e) => set('source', e.target.value)}>
            {connections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
          </select>
        </label>
        <label className="field">
          주소 / 변수 경로
          <input className="input mono" placeholder="D100, %MW10, DB1.DBD4, Tank1/Level" value={t.address} onChange={(e) => set('address', e.target.value)} />
        </label>
        <label className="field">
          데이터 타입
          <select className="input" value={t.dataType} onChange={(e) => set('dataType', e.target.value as TagDataType)}>
            <option value="bool">BOOL</option>
            <option value="int">INT / DINT</option>
            <option value="real">REAL / FLOAT</option>
            <option value="string">STRING</option>
          </select>
        </label>
        <label className="field">단위<input className="input" value={t.unit ?? ''} onChange={(e) => set('unit', e.target.value || undefined)} /></label>
        <label className="field">최소<input className="input mono" value={str.min} onChange={(e) => setStr({ ...str, min: e.target.value })} /></label>
        <label className="field">최대<input className="input mono" value={str.max} onChange={(e) => setStr({ ...str, max: e.target.value })} /></label>
        <label className="field">소수 자릿수<input className="input mono" type="number" min={0} max={6} value={t.decimals ?? 1} onChange={(e) => set('decimals', Number(e.target.value))} /></label>
        <label className="field" style={{ alignContent: 'end' }}>
          <span><input type="checkbox" checked={!!t.writable} onChange={(e) => set('writable', e.target.checked)} /> 쓰기 허용 (HMI 제어)</span>
        </label>
      </div>
      <div className="card">
        <div className="card-head"><span className="t">알람 설정</span></div>
        <div className="grid2">
          <label className="field">상한 (HI)<input className="input mono" value={str.alarmHigh} onChange={(e) => setStr({ ...str, alarmHigh: e.target.value })} /></label>
          <label className="field">하한 (LO)<input className="input mono" value={str.alarmLow} onChange={(e) => setStr({ ...str, alarmLow: e.target.value })} /></label>
          <label className="field">
            심각도
            <select className="input" value={t.alarmSeverity ?? 'minor'} onChange={(e) => set('alarmSeverity', e.target.value as AlarmSeverity)}>
              <option value="critical">Critical</option>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
              <option value="info">Info</option>
            </select>
          </label>
          <label className="field" style={{ alignContent: 'end' }}>
            <span><input type="checkbox" checked={!!t.alarmOnTrue} onChange={(e) => set('alarmOnTrue', e.target.checked)} /> 디지털 알람 (TRUE = 이상)</span>
          </label>
        </div>
        <label className="field">알람 메시지<input className="input" value={t.alarmText ?? ''} onChange={(e) => set('alarmText', e.target.value || undefined)} /></label>
      </div>
    </Modal>
  );
}
