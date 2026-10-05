import { useTwin, type RenderMode, type Quality } from '../store/useTwin';
import { toast } from './common';

const MODES: [RenderMode, string, string][] = [
  ['real', '실사', 'PBR 실사 렌더링'],
  ['cad', 'CAD', '음영 + 외곽선 (CAD 스타일)'],
  ['xray', 'X-Ray', '투시 (내부 액위 등 확인)'],
  ['status', '상태색', '설비 상태별 색상'],
];

export function ViewportOverlay() {
  const ui = useTwin((s) => s.ui);
  const setUi = useTwin((s) => s.setUi);
  const selectedId = useTwin((s) => s.selectedId);
  const view = (v: string) => useTwin.getState().requestView(v);

  const screenshot = () => {
    const c = document.querySelector('#twin-canvas canvas') as HTMLCanvasElement | null;
    if (!c) return;
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `digital-twin_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      a.click();
      toast('스크린샷 저장됨');
    });
  };

  return (
    <>
      <div className="vp-toolbar">
        <div className="glass">
          <span className="lbl">뷰</span>
          <button className="btn sm ghost" onClick={() => view('home')} title="기본 뷰 (H)">⌂</button>
          <button className="btn sm ghost" onClick={() => view('top')} title="평면도">평면</button>
          <button className="btn sm ghost" onClick={() => view('front')} title="정면도">정면</button>
          <button className="btn sm ghost" onClick={() => view('side')} title="측면도">측면</button>
          <button className="btn sm ghost" onClick={() => view('iso')} title="등각">ISO</button>
          <button className="btn sm ghost" disabled={!selectedId} onClick={() => useTwin.getState().focus(selectedId)} title="선택 설비로 이동 (F)">⌖</button>
        </div>
        <div className="glass">
          <div className="seg">
            {MODES.map(([k, l, t]) => (
              <button key={k} className={ui.renderMode === k ? 'on' : ''} onClick={() => setUi({ renderMode: k })} title={t}>{l}</button>
            ))}
          </div>
        </div>
        <div className="glass">
          <button className={`btn sm ${ui.labels ? 'on' : 'ghost'}`} onClick={() => setUi({ labels: !ui.labels })} title="설비 라벨 (L)">라벨</button>
          <button className={`btn sm ${ui.grid ? 'on' : 'ghost'}`} onClick={() => setUi({ grid: !ui.grid })} title="그리드">그리드</button>
          <button className={`btn sm ${ui.clip.enabled ? 'on' : 'ghost'}`} onClick={() => setUi({ clip: { ...ui.clip, enabled: !ui.clip.enabled } })} title="단면 보기">단면</button>
          <button className={`btn sm ${ui.autoRotate ? 'on' : 'ghost'}`} onClick={() => setUi({ autoRotate: !ui.autoRotate })} title="자동 회전 (전시 모드)">⟳</button>
          <button className="btn sm ghost" onClick={screenshot} title="스크린샷 PNG">📷</button>
        </div>
        {ui.clip.enabled && (
          <div className="glass clip-pop">
            <div className="seg">
              {(['x', 'y', 'z'] as const).map((a) => (
                <button key={a} className={ui.clip.axis === a ? 'on' : ''} onClick={() => setUi({ clip: { ...ui.clip, axis: a, value: a === 'y' ? 1.5 : 0 } })}>{a.toUpperCase()}</button>
              ))}
            </div>
            <input
              type="range"
              min={ui.clip.axis === 'y' ? 0 : -25}
              max={ui.clip.axis === 'y' ? 6 : 25}
              step={0.05}
              value={ui.clip.value}
              onChange={(e) => setUi({ clip: { ...ui.clip, value: Number(e.target.value) } })}
            />
            <span className="mono" style={{ fontSize: 11, width: 46 }}>{ui.clip.value.toFixed(2)}m</span>
            <button className="btn sm ghost" onClick={() => setUi({ clip: { ...ui.clip, flip: !ui.clip.flip } })} title="방향 반전">⇋</button>
          </div>
        )}
        <div className="spacer" style={{ pointerEvents: 'none' }} />
        <div className="glass">
          <span className="lbl">품질</span>
          <div className="seg">
            {([['low', '저'], ['medium', '중'], ['high', '고']] as [Quality, string][]).map(([k, l]) => (
              <button key={k} className={ui.quality === k ? 'on' : ''} onClick={() => setUi({ quality: k })}>{l}</button>
            ))}
          </div>
          <button className={`btn sm ${ui.leftOpen ? 'ghost' : 'on'}`} onClick={() => setUi({ leftOpen: !ui.leftOpen })} title="왼쪽 패널">◧</button>
          <button className={`btn sm ${ui.rightOpen ? 'ghost' : 'on'}`} onClick={() => setUi({ rightOpen: !ui.rightOpen })} title="오른쪽 패널">◨</button>
        </div>
      </div>
      {ui.editMode && (
        <div className="vp-edit-banner">
          <b>편집 모드</b>
          <div className="seg">
            <button className={ui.transformMode === 'translate' ? 'on' : ''} onClick={() => setUi({ transformMode: 'translate' })}>이동 (G)</button>
            <button className={ui.transformMode === 'rotate' ? 'on' : ''} onClick={() => setUi({ transformMode: 'rotate' })}>회전 (R)</button>
          </div>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={ui.snap} onChange={(e) => setUi({ snap: e.target.checked })} /> 스냅 (0.1m / 15°)
          </label>
          <button className="btn sm" disabled={!selectedId} onClick={() => selectedId && useTwin.getState().duplicateEquipment(selectedId)}>복제</button>
          <button className="btn sm danger" disabled={!selectedId} onClick={() => selectedId && confirm('선택한 설비를 삭제할까요?') && useTwin.getState().removeEquipment(selectedId)}>삭제</button>
          <button className="btn sm" onClick={() => setUi({ editMode: false })}>완료</button>
        </div>
      )}
      <div className="vp-hint">
        좌클릭 회전 · 우클릭 이동 · 휠 확대 · 더블클릭 포커스 {ui.editMode ? '· 기즈모로 위치 편집' : ''}
      </div>
    </>
  );
}
