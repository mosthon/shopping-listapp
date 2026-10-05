// ─────────────────────────────────────────────────────────────
//  핵심 도메인 타입 — 설비(Equipment) · 태그(Tag) · 연결(Connection)
// ─────────────────────────────────────────────────────────────

export type TagValue = number | boolean | string;
export type TagDataType = 'bool' | 'int' | 'real' | 'string';

/** 시뮬레이터용 신호 생성 힌트 (실제 연결 시에는 무시됨) */
export interface SimSpec {
  kind: 'const' | 'sine' | 'random' | 'ramp' | 'counter' | 'toggle' | 'follow';
  /** sine/random 기준값 */
  base?: number;
  amp?: number;
  /** 주기(초) */
  period?: number;
  phase?: number;
  /** counter 증가 속도 (초당) / ramp 속도 */
  rate?: number;
  /** 이 태그(bool)가 false면 값이 0으로 수렴 (예: 운전 신호) */
  enableTag?: string;
  /** toggle: true 확률 (0~1) / random 노이즈 */
  prob?: number;
  /** follow: 다른 태그 값을 1차 지연 추종 */
  followTag?: string;
  tau?: number;
  scale?: number;
}

export interface TagDef {
  /** 고유 태그 ID (예: "CV01.Speed") */
  id: string;
  /** 표시 이름 */
  name: string;
  /** 물리 주소: PLC 디바이스(D100, %MW10, DB1.DBD0) 또는 LabVIEW 변수 경로 */
  address: string;
  /** 데이터를 공급하는 연결 ID (connections[].id) */
  source: string;
  dataType: TagDataType;
  unit?: string;
  min?: number;
  max?: number;
  decimals?: number;
  writable?: boolean;
  /** 아날로그 경보 한계 */
  alarmHigh?: number;
  alarmLow?: number;
  /** 디지털 경보: 값이 true이면 경보 */
  alarmOnTrue?: boolean;
  alarmText?: string;
  alarmSeverity?: AlarmSeverity;
  sim?: SimSpec;
}

export type EquipmentType =
  | 'conveyor'
  | 'robot'
  | 'tank'
  | 'pump'
  | 'valve'
  | 'stacklight'
  | 'cnc'
  | 'cabinet'
  | 'agv'
  | 'pipe'
  | 'imported';

export type EquipmentStatus = 'run' | 'idle' | 'alarm' | 'warning' | 'offline';

/** 임포트된 CAD 모델의 특정 노드를 태그로 움직이는 범용 애니메이션 바인딩 */
export interface NodeAnimation {
  node: string;
  mode: 'rotate' | 'translate' | 'visible' | 'color';
  axis: 'x' | 'y' | 'z';
  tag: string;
  /** 값 → 변위 배율 (rotate: deg/unit, translate: m/unit) */
  scale: number;
  offset: number;
}

export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  /** 위치 [x,y,z] (m) */
  position: [number, number, number];
  /** 회전 [x,y,z] (deg) */
  rotation: [number, number, number];
  scale?: number;
  /** 역할(role) → 태그 ID 매핑 */
  bindings: Record<string, string>;
  /** 형상 파라미터 (길이, 반경, 색상 등) */
  params: Record<string, number | string | boolean | number[][]>;
  /** 소속 그룹 / 라인 */
  group?: string;
  description?: string;
  /** imported 타입: 모델 에셋 ID (IndexedDB) */
  assetId?: string;
  animations?: NodeAnimation[];
}

export type ConnectionKind = 'websocket' | 'rest';

export interface ConnectionDef {
  id: string;
  name: string;
  kind: ConnectionKind;
  /** ws://host:port/path 또는 http://host:port/api */
  url: string;
  enabled: boolean;
  /** REST 폴링 주기(ms) */
  intervalMs: number;
  /** 대상 장치 설명 (LabVIEW, Melsec Q, S7-1500, ...) */
  device?: string;
}

export type ConnState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type AlarmSeverity = 'critical' | 'major' | 'minor' | 'info';

export interface Alarm {
  key: string;
  tagId: string;
  equipmentId?: string;
  text: string;
  severity: AlarmSeverity;
  value: TagValue;
  raisedAt: number;
  clearedAt?: number;
  ackedAt?: number;
  active: boolean;
}

export interface KpiDef {
  id: string;
  label: string;
  tag: string;
  unit?: string;
  decimals?: number;
}

export interface PlantConfig {
  version: number;
  name: string;
  site?: string;
  floor: { width: number; depth: number };
  connections: ConnectionDef[];
  tags: TagDef[];
  equipment: Equipment[];
  kpis: KpiDef[];
}
