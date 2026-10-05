import { useEffect } from 'react';
import { Viewport } from './three/Viewport';
import { TopBar } from './ui/TopBar';
import { LeftPanel } from './ui/LeftPanel';
import { RightPanel } from './ui/RightPanel';
import { BottomPanel } from './ui/BottomPanel';
import { ViewportOverlay } from './ui/ViewportOverlay';
import { ConnectionsDialog, HelpDialog, ImportDialog, SettingsDialog } from './ui/Dialogs';
import { Toasts } from './ui/common';
import { useTwin, type RenderMode } from './store/useTwin';
import { startDataManager } from './data/manager';

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const s = useTwin.getState();
      if (s.dialog) return;
      const k = e.key.toLowerCase();
      const modes: RenderMode[] = ['real', 'cad', 'xray', 'status'];
      if (k === 'escape') s.select(null);
      else if (k === 'h') s.requestView('home');
      else if (k === 'f' && s.selectedId) s.focus(s.selectedId);
      else if (k === 'l') s.setUi({ labels: !s.ui.labels });
      else if (k === 'e') s.setUi({ editMode: !s.ui.editMode });
      else if (k === 'g') s.setUi({ transformMode: 'translate' });
      else if (k === 'r' && !e.ctrlKey && !e.metaKey) s.setUi({ transformMode: 'rotate' });
      else if (['1', '2', '3', '4'].includes(k)) s.setUi({ renderMode: modes[Number(k) - 1] });
      else if (k === 'd' && (e.ctrlKey || e.metaKey) && s.ui.editMode && s.selectedId) {
        e.preventDefault();
        s.duplicateEquipment(s.selectedId);
      } else if ((k === 'delete' || k === 'backspace') && s.ui.editMode && s.selectedId) {
        if (confirm('선택한 설비를 삭제할까요?')) s.removeEquipment(s.selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  const ui = useTwin((s) => s.ui);
  const dialog = useTwin((s) => s.dialog);
  useShortcuts();
  useEffect(() => startDataManager(), []);

  return (
    <div className="app">
      <TopBar />
      <div className={`workspace ${ui.leftOpen ? '' : 'no-left'} ${ui.rightOpen ? '' : 'no-right'}`}>
        {ui.leftOpen ? <LeftPanel /> : <div />}
        <main className={`center ${ui.bottomOpen ? '' : 'no-bottom'}`}>
          <div className="viewport">
            <Viewport />
            <ViewportOverlay />
          </div>
          <BottomPanel />
        </main>
        {ui.rightOpen ? <RightPanel /> : <div />}
      </div>
      {dialog === 'connections' && <ConnectionsDialog />}
      {dialog === 'import' && <ImportDialog />}
      {dialog === 'settings' && <SettingsDialog />}
      {dialog === 'help' && <HelpDialog />}
      <Toasts />
    </div>
  );
}
