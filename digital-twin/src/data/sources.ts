import { KeyResolver, parseMessage } from './protocol';
import type { ConnState, ConnectionDef, TagDef, TagValue } from '../types';

export interface SourceCallbacks {
  onValues: (vals: Record<string, TagValue>, ts?: number) => void;
  onStatus: (state: ConnState, message?: string) => void;
  onTraffic?: (dir: 'rx' | 'tx') => void;
  onLog?: (text: string) => void;
}

export interface DataSource {
  start(): void;
  stop(): void;
  write(tag: TagDef, value: TagValue): Promise<void>;
}

// ─────────────────────────────────────────────────────────
//  WebSocket — LabVIEW(WebSockets API / G Web Server) 또는 PLC 게이트웨이
// ─────────────────────────────────────────────────────────
export class WebSocketSource implements DataSource {
  private ws?: WebSocket;
  private stopped = false;
  private retry = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private pingTimer?: ReturnType<typeof setInterval>;
  private resolver: KeyResolver;
  private pending = new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private seq = 0;

  constructor(private def: ConnectionDef, private tags: TagDef[], private cb: SourceCallbacks) {
    this.resolver = new KeyResolver(tags);
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  private connect() {
    if (this.stopped) return;
    this.cb.onStatus('connecting', this.def.url);
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.def.url);
    } catch (e) {
      this.cb.onStatus('error', (e as Error).message);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.cb.onStatus('connected', this.def.url);
      this.send({
        type: 'hello',
        client: 'digital-twin',
        version: 1,
        tags: this.tags.map((t) => ({ id: t.id, address: t.address, dataType: t.dataType })),
      });
      this.pingTimer = setInterval(() => this.send({ type: 'ping', ts: Date.now() }), 10000);
    };
    ws.onmessage = async (ev) => {
      this.cb.onTraffic?.('rx');
      let text: string;
      if (typeof ev.data === 'string') text = ev.data;
      else if (ev.data instanceof Blob) text = await ev.data.text();
      else text = new TextDecoder().decode(ev.data as ArrayBuffer);
      // LabVIEW 에서 여러 JSON 을 줄바꿈으로 묶어 보내는 경우 지원
      for (const line of text.split(/\n+/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let raw: unknown;
        try {
          raw = JSON.parse(trimmed);
        } catch {
          this.cb.onLog?.(`[${this.def.name}] JSON 파싱 실패: ${trimmed.slice(0, 80)}`);
          continue;
        }
        const msg = parseMessage(raw);
        if (msg.ack) {
          const p = this.pending.get(msg.ack.reqId);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(msg.ack.reqId);
            if (msg.ack.ok) p.resolve();
            else p.reject(new Error(msg.ack.error ?? '쓰기 거부'));
          }
        }
        if (msg.error) this.cb.onLog?.(`[${this.def.name}] 서버 오류: ${msg.error}`);
        if (Object.keys(msg.values).length) this.cb.onValues(this.resolver.resolve(msg.values), msg.ts);
      }
    };
    ws.onerror = () => this.cb.onStatus('error', '연결 오류');
    ws.onclose = (ev) => {
      clearInterval(this.pingTimer);
      if (this.stopped) return;
      this.cb.onStatus('disconnected', `연결 종료 (${ev.code})`);
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    const delay = Math.min(10000, 1000 * 2 ** this.retry++);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      this.cb.onTraffic?.('tx');
      return true;
    }
    return false;
  }

  write(tag: TagDef, value: TagValue): Promise<void> {
    const reqId = `w${++this.seq}`;
    return new Promise((resolve, reject) => {
      if (!this.send({ type: 'write', reqId, tag: tag.id, address: tag.address, value })) {
        reject(new Error('연결되지 않음'));
        return;
      }
      // 게이트웨이가 ack 를 보내지 않으면 3초 후 성공으로 간주
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        resolve();
      }, 3000);
      this.pending.set(reqId, { resolve, reject, timer });
    });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    this.pending.forEach((p) => clearTimeout(p.timer));
    this.pending.clear();
    this.ws?.close();
    this.ws = undefined;
    this.cb.onStatus('disconnected');
  }
}

// ─────────────────────────────────────────────────────────
//  REST 폴링 — LabVIEW Web Service / NI G Web Server / HTTP 게이트웨이
//    GET  {url}/tags?ids=a,b,c   → 위 프로토콜과 동일한 JSON
//    POST {url}/write            ← { tag, address, value }
// ─────────────────────────────────────────────────────────
export class RestSource implements DataSource {
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private resolver: KeyResolver;
  private failures = 0;
  private ok = false;

  constructor(private def: ConnectionDef, private tags: TagDef[], private cb: SourceCallbacks) {
    this.resolver = new KeyResolver(tags);
  }

  private base() {
    return this.def.url.replace(/\/+$/, '');
  }

  start() {
    this.stopped = false;
    this.cb.onStatus('connecting', this.def.url);
    this.poll();
  }

  private async poll() {
    if (this.stopped) return;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), Math.max(2000, this.def.intervalMs * 4));
    try {
      const ids = this.tags.map((t) => encodeURIComponent(t.id)).join(',');
      const res = await fetch(`${this.base()}/tags?ids=${ids}`, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      this.cb.onTraffic?.('rx');
      const msg = parseMessage(raw);
      if (this.failures > 0 || !this.ok) this.cb.onStatus('connected', this.def.url);
      this.ok = true;
      this.failures = 0;
      if (Object.keys(msg.values).length) this.cb.onValues(this.resolver.resolve(msg.values), msg.ts);
    } catch (e) {
      this.failures++;
      this.ok = false;
      this.cb.onStatus('error', (e as Error).name === 'AbortError' ? '응답 시간 초과' : (e as Error).message);
    } finally {
      clearTimeout(to);
    }
    if (!this.stopped) {
      const backoff = this.failures ? Math.min(10000, this.def.intervalMs * 2 ** this.failures) : this.def.intervalMs;
      this.timer = setTimeout(() => this.poll(), Math.max(50, backoff));
    }
  }

  async write(tag: TagDef, value: TagValue) {
    const res = await fetch(`${this.base()}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: tag.id, address: tag.address, value }),
    });
    this.cb.onTraffic?.('tx');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.cb.onStatus('disconnected');
  }
}
