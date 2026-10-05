#!/usr/bin/env node
/**
 * 모의 게이트웨이 (PLC / LabVIEW 대역) — 디지털 트윈 프런트엔드 통신 테스트용
 *
 *   npm run mock
 *
 *   ws://localhost:8090/plc      PLC 게이트웨이 흉내 (값을 '주소' 키로 전송: D100, M0 …)
 *   ws://localhost:8091/labview  LabVIEW 흉내     (값을 '태그 ID' 키로, 평문 JSON 으로 전송)
 *   http://localhost:8092/api    REST 폴링 테스트 (GET /api/tags, POST /api/write)
 *
 * 클라이언트가 보내는 hello 메시지의 태그 목록을 바탕으로 값을 생성하고,
 * write 요청은 내부 메모리에 반영한 뒤 ack 로 응답한다.
 */
import { WebSocketServer } from 'ws';
import http from 'node:http';

const memory = new Map(); // key(address 또는 id) → value
const meta = new Map(); // key → { dataType }
const t0 = Date.now();

function gen(key, dataType, i, id = key) {
  if (memory.has(key) && dataType === 'bool') return memory.get(key);
  const t = (Date.now() - t0) / 1000;
  const w = memory.get(key);
  switch (dataType) {
    case 'bool':
      return /fault|alarm/i.test(id) ? Math.sin(t / 7 + i) > 0.97 : true;
    case 'int':
      return Math.floor(t * 0.5 + i * 10);
    case 'real': {
      const base = typeof w === 'number' ? w : 40 + (i % 5) * 8;
      return +(base + Math.sin(t / (3 + (i % 7)) + i) * 10).toFixed(3);
    }
    default:
      return `OK ${new Date().toLocaleTimeString()}`;
  }
}

function makeWs(port, path, mode) {
  const wss = new WebSocketServer({ port, path });
  wss.on('connection', (ws, req) => {
    console.log(`[${mode}] client connected ${req.socket.remoteAddress}`);
    let tags = [];
    ws.on('message', (buf) => {
      let m;
      try {
        m = JSON.parse(buf.toString());
      } catch {
        return;
      }
      if (m.type === 'hello') {
        tags = (m.tags ?? []).map((t) => ({ ...t, key: mode === 'plc' && t.address ? t.address : t.id }));
        tags.forEach((t) => meta.set(t.key, t));
        console.log(`[${mode}] hello: ${tags.length} tags`);
        ws.send(JSON.stringify({ type: 'welcome', server: `mock-${mode}` }));
      } else if (m.type === 'write') {
        const key = mode === 'plc' && m.address ? m.address : m.tag;
        memory.set(key, m.value);
        console.log(`[${mode}] write ${key} = ${JSON.stringify(m.value)}`);
        ws.send(JSON.stringify({ type: 'ack', reqId: m.reqId, ok: true }));
      } else if (m.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: m.ts }));
      }
    });
    const timer = setInterval(() => {
      if (!tags.length) return;
      const vals = {};
      tags.forEach((t, i) => (vals[t.key] = gen(t.key, t.dataType, i, t.id)));
      // PLC: 표준 envelope / LabVIEW: 평문 객체 (Flatten To JSON 결과와 동일한 형태)
      const msg = mode === 'plc' ? { type: 'update', ts: Date.now(), tags: vals } : vals;
      ws.send(JSON.stringify(msg));
    }, 200);
    ws.on('close', () => {
      clearInterval(timer);
      console.log(`[${mode}] client disconnected`);
    });
  });
  console.log(`[${mode}] ws://localhost:${port}${path}`);
}

makeWs(8090, '/plc', 'plc');
makeWs(8091, '/labview', 'labview');

// REST
http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.end();
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/api/tags') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
      const tags = {};
      ids.forEach((id, i) => (tags[id] = gen(id, meta.get(id)?.dataType ?? (/\.(run|fault|open|door|gripper|power|comm|agitator)$/.test(id) ? 'bool' : 'real'), i)));
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ type: 'snapshot', ts: Date.now(), tags }));
    }
    if (req.method === 'POST' && url.pathname === '/api/write') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const m = JSON.parse(body);
          memory.set(m.tag, m.value);
          console.log(`[rest] write ${m.tag} = ${JSON.stringify(m.value)}`);
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.statusCode = 400;
          res.end('{"ok":false}');
        }
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  })
  .listen(8092, () => console.log('[rest] http://localhost:8092/api'));
