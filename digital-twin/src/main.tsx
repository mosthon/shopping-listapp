import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { useTwin } from './store/useTwin';
import { writeTag } from './data/manager';

// 디버깅/외부 연동용 콘솔 API (예: __twin.getState().values, __writeTag('CV01.run', false))
Object.assign(window, { __twin: useTwin, __writeTag: writeTag });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
