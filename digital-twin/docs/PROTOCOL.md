# 데이터 연동 프로토콜 (LabVIEW · PLC ↔ 디지털 트윈)

디지털 트윈 프런트엔드는 **JSON 기반의 단순한 프로토콜**로 데이터를 주고받습니다.
브라우저는 Modbus TCP, MC 프로토콜, S7, EtherNet/IP 같은 산업용 프로토콜에 직접 접속할 수 없으므로,
PLC 쪽은 **게이트웨이**가 중계하고, LabVIEW는 직접 WebSocket 서버나 Web Service(REST)를 열어 연결합니다.

```
 ┌─────────────┐  Modbus/MC/S7/OPC UA  ┌──────────────┐   WebSocket (JSON)   ┌──────────────────┐
 │    PLC      │ ◀──────────────────▶ │  게이트웨이   │ ◀──────────────────▶ │                  │
 └─────────────┘                       │ (Node-RED,   │                      │  디지털 트윈 UI    │
                                       │  Python, C#) │                      │  (이 프로젝트)     │
 ┌─────────────┐   WebSocket / REST (JSON)            └──────────────┘      │                  │
 │  LabVIEW    │ ◀──────────────────────────────────────────────────────▶ │                  │
 │ (DAQ/계측)   │                                                           └──────────────────┘
 └─────────────┘
```

연결은 UI 상단의 **⇄ 연결 설정**에서 추가/편집합니다. 각 태그는 `source`(연결 ID)를 가지며,
비활성화된 연결의 태그는 내장 시뮬레이터가 값을 생성합니다 (화면 검증·교육용).

---

## 1. 태그 모델

| 필드 | 설명 | 예 |
|---|---|---|
| `id` | 고유 태그 ID (`설비ID.역할`) | `CV01.speed` |
| `address` | 물리 주소 / 변수 경로 | `D100`, `M0`, `%MW10`, `DB1.DBD4`, `TK01/level` |
| `source` | 데이터를 제공하는 연결 ID | `plc1`, `labview` |
| `dataType` | `bool` · `int` · `real` · `string` | `real` |
| `unit`, `min`, `max` | 표시 단위·공학 범위 | `m/min`, `0`, `30` |
| `alarmHigh`, `alarmLow`, `alarmOnTrue` | 알람 조건 | `28` |
| `writable` | HMI 에서 쓰기 허용 | `true` |

**수신 메시지의 키는 태그 ID 또는 주소 둘 다 허용**됩니다. 게이트웨이는 PLC 주소(`D100`)를 그대로 키로 보내도 되고,
LabVIEW 는 태그 ID(`TK01.level`)를 키로 보내도 됩니다.

---

## 2. WebSocket 프로토콜

### 2.1 서버 → 클라이언트 (값 전송)

아래 형태를 모두 지원합니다. 변화가 있는 태그만 보내도 되고, 전체 스냅샷을 주기적으로 보내도 됩니다.

```jsonc
// (A) 표준 형태
{ "type": "update", "ts": 1760000000000, "tags": { "CV01.speed": 18.2, "D104": 341, "M0": true } }

// (B) 배열 형태 (태그별 타임스탬프)
{ "type": "update", "values": [ { "id": "TK01.level", "value": 52.3, "ts": 1760000000000 } ] }

// (C) 평문 객체 — LabVIEW 'Flatten To JSON' 결과를 그대로 전송
{ "TK01.level": 52.3, "TK01.temp": 61.0, "LINE.power": 182.4 }

// (D) 줄바꿈으로 구분한 여러 JSON (한 프레임에 묶어 보내기)
{"TK01.level":52.3}
{"TK02.level":48.1}
```

- `ts` 는 epoch ms 또는 ISO-8601 문자열. 생략 시 수신 시각 사용.
- 값은 `number | boolean | string`. `0/1`, `"ON"/"OFF"`, `"true"` 도 태그 타입에 맞게 자동 변환됩니다.

### 2.2 클라이언트 → 서버

```jsonc
// 연결 직후: 이 연결에 속한 태그 목록 (게이트웨이가 폴링 대상 결정에 사용)
{ "type": "hello", "client": "digital-twin", "version": 1,
  "tags": [ { "id": "CV01.run", "address": "M0", "dataType": "bool" }, ... ] }

// HMI 쓰기 (운전/정지, 설정값)
{ "type": "write", "reqId": "w12", "tag": "CV01.run", "address": "M0", "value": false }

// 10초마다 keep-alive
{ "type": "ping", "ts": 1760000000000 }
```

### 2.3 쓰기 응답 (선택)

```json
{ "type": "ack", "reqId": "w12", "ok": true }
{ "type": "ack", "reqId": "w12", "ok": false, "error": "인터록: 도어 열림" }
```

`ack` 를 보내지 않으면 3초 후 성공으로 간주합니다. 실패 시 UI 에 오류 토스트와 이벤트 로그가 남습니다.

연결이 끊기면 1s → 2s → 4s … 최대 10s 간격으로 자동 재접속합니다.

---

## 3. REST(HTTP 폴링) 프로토콜

WebSocket 을 쓰기 어려운 경우(예: LabVIEW Web Service, 기존 HTTP 서버) 사용합니다.

| 요청 | 설명 |
|---|---|
| `GET {url}/tags?ids=CV01.run,CV01.speed,…` | 2.1 의 형태 중 하나로 응답 |
| `POST {url}/write` 본문 `{ "tag", "address", "value" }` | 2xx 응답 = 성공 |

폴링 주기는 연결 설정의 `intervalMs` (기본 200~500ms). 실패 시 지수 백오프.
브라우저에서 다른 포트/호스트로 접근하므로 서버는 **CORS 헤더**(`Access-Control-Allow-Origin: *`)를 보내야 합니다.

---

## 4. LabVIEW 구현 가이드

### 방법 A — WebSocket 서버 (권장, 실시간)
1. VI Package Manager 에서 **WebSockets API**(LabVIEW Tools Network) 또는 LabVIEW 2020+ 의 WebSocket 기능 설치
2. TCP Listen(예: 8091) → WebSocket Handshake → 루프에서:
   - DAQ 값들을 **클러스터**로 묶고 (요소 이름 = 태그 ID 또는 주소)
   - `Flatten To JSON` → `WebSocket Write` (100~200 ms 주기)
   - `WebSocket Read`(timeout 0) 로 `write` 메시지를 읽어 `Unflatten From JSON` → 해당 제어 실행
3. 트윈의 연결 설정: `ws://<LabVIEW PC IP>:8091/` · 방식 WebSocket

> 클러스터 요소 이름에 `.` 이 들어가기 어렵다면 주소를 `TK01/level` 처럼 지정하고 그 문자열을 요소 이름으로 사용하세요.

### 방법 B — LabVIEW Web Service (REST)
1. 프로젝트에 Web Service 추가 → `GET /tags` 메서드 VI 에서 클러스터를 `Flatten To JSON` 으로 출력
2. `POST /write` 메서드 VI 에서 본문을 파싱해 제어 큐(Queue/Notifier)로 전달
3. 출력 헤더에 `Access-Control-Allow-Origin: *` 추가
4. 트윈의 연결 설정: `http://<IP>:8001/<서비스명>` · 방식 REST

### 방법 C — 정적 배포
`npm run build` 결과물(`dist/`)은 상대 경로로 빌드되므로 LabVIEW Web Server 의 public 폴더, IIS, nginx,
또는 네트워크 공유 폴더 어디에 두어도 동작합니다.

---

## 5. PLC 게이트웨이 구현 예

| 게이트웨이 | PLC 측 | 비고 |
|---|---|---|
| **Node-RED** | `node-red-contrib-modbus`, `node-red-contrib-s7`, `node-red-contrib-mcprotocol` | `websocket out` 노드로 2.1 형태 전송 — 코딩 최소 |
| **Python** | `pymodbus`, `python-snap7`, `pymcprotocol`, `asyncua` | `websockets` 라이브러리로 서버 구성 |
| **C# / .NET** | `NModbus`, `S7netplus`, `McProtocol`, OPC UA SDK | Windows 서비스로 상주 |
| **OPC UA 서버** 경유 | 대부분의 PLC | 게이트웨이가 OPC UA 구독 → JSON 변환 |

### Python 예시 (Modbus TCP → WebSocket)

```python
import asyncio, json, time, websockets
from pymodbus.client import AsyncModbusTcpClient

PLC_IP = "192.168.0.10"
clients = set()
tags = []  # hello 로 받은 태그 목록

async def poll():
    plc = AsyncModbusTcpClient(PLC_IP); await plc.connect()
    while True:
        rr = await plc.read_holding_registers(100, count=50)   # D100~D149
        coils = await plc.read_coils(0, count=32)               # M0~M31
        vals = {f"D{100+i}": v for i, v in enumerate(rr.registers)}
        vals |= {f"M{i}": b for i, b in enumerate(coils.bits[:32])}
        msg = json.dumps({"type": "update", "ts": int(time.time()*1000), "tags": vals})
        await asyncio.gather(*(c.send(msg) for c in clients), return_exceptions=True)
        await asyncio.sleep(0.2)

async def handler(ws):
    clients.add(ws)
    try:
        async for raw in ws:
            m = json.loads(raw)
            if m["type"] == "write":
                # 주소 해석 후 PLC 에 쓰기 (예: M0 → coil 0)
                await ws.send(json.dumps({"type": "ack", "reqId": m["reqId"], "ok": True}))
    finally:
        clients.discard(ws)

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8090):
        await poll()

asyncio.run(main())
```

> REAL(32bit float) 값은 두 워드를 합쳐 변환해야 합니다 (`struct.unpack('>f', ...)`, 워드 순서는 PLC 기종에 따라 다름).

---

## 6. 테스트용 모의 게이트웨이

```bash
npm run mock
```

| 엔드포인트 | 동작 |
|---|---|
| `ws://localhost:8090/plc` | PLC 흉내 — 주소(`D100`, `M0`) 키로 200ms 마다 전송, write → ack |
| `ws://localhost:8091/labview` | LabVIEW 흉내 — 태그 ID 키의 평문 JSON 전송 |
| `http://localhost:8092/api` | REST 폴링 (`GET /tags`, `POST /write`) |

기본 레이아웃의 연결(`plc1`, `labview`)이 이 주소로 설정되어 있으므로 연결 설정에서 **활성화**만 하면 됩니다.

브라우저 콘솔에서도 확인할 수 있습니다:

```js
__twin.getState().values['CV01.speed']   // 현재 값
__writeTag('CV01.run', false)            // 쓰기 (게이트웨이로 전송)
```
