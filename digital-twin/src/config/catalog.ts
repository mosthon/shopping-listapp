import type { EquipmentType, SimSpec, TagDataType, AlarmSeverity } from '../types';

export interface RoleSpec {
  role: string;
  label: string;
  dataType: TagDataType;
  unit?: string;
  min?: number;
  max?: number;
  writable?: boolean;
  alarmOnTrue?: boolean;
  alarmHigh?: number;
  alarmLow?: number;
  alarmSeverity?: AlarmSeverity;
  alarmText?: string;
  sim?: SimSpec;
}

export interface ParamSpec {
  key: string;
  label: string;
  kind: 'number' | 'color' | 'bool' | 'text';
  min?: number;
  max?: number;
  step?: number;
}

export interface CatalogEntry {
  type: EquipmentType;
  label: string;
  icon: string;
  description: string;
  roles: RoleSpec[];
  params: ParamSpec[];
  defaults: Record<string, number | string | boolean | number[][]>;
}


export const CATALOG: Record<EquipmentType, CatalogEntry> = {
  conveyor: {
    type: 'conveyor',
    label: '벨트 컨베이어',
    icon: '▭',
    description: '알루미늄 프로파일 프레임 + 벨트, 속도 연동 애니메이션',
    roles: [
      { role: 'run', label: '운전', dataType: 'bool', writable: true, sim: { kind: 'const', base: 1 } },
      { role: 'speed', label: '속도', dataType: 'real', unit: 'm/min', min: 0, max: 30, writable: true, alarmHigh: 28, sim: { kind: 'sine', base: 18, amp: 2, period: 30, enableTag: '$run' } },
      { role: 'count', label: '생산 수량', dataType: 'int', unit: 'ea', sim: { kind: 'counter', rate: 0.6, enableTag: '$run' } },
      { role: 'fault', label: '고장', dataType: 'bool', alarmOnTrue: true, alarmSeverity: 'major', alarmText: '컨베이어 모터 과부하', sim: { kind: 'toggle', prob: 0.02, period: 25 } },
    ],
    params: [
      { key: 'length', label: '길이 (m)', kind: 'number', min: 1, max: 30, step: 0.1 },
      { key: 'width', label: '폭 (m)', kind: 'number', min: 0.3, max: 2, step: 0.05 },
      { key: 'height', label: '높이 (m)', kind: 'number', min: 0.4, max: 1.5, step: 0.05 },
      { key: 'beltColor', label: '벨트 색상', kind: 'color' },
      { key: 'items', label: '제품 표시', kind: 'bool' },
    ],
    defaults: { length: 6, width: 0.6, height: 0.85, beltColor: '#1f2937', items: true },
  },
  robot: {
    type: 'robot',
    label: '6축 로봇',
    icon: '⟟',
    description: '6축 다관절 로봇, 관절각(J1~J6) 태그 연동',
    roles: [
      { role: 'run', label: '운전', dataType: 'bool', writable: true, sim: { kind: 'const', base: 1 } },
      { role: 'j1', label: 'J1', dataType: 'real', unit: '°', min: -170, max: 170, sim: { kind: 'sine', base: 0, amp: 75, period: 8, enableTag: '$run' } },
      { role: 'j2', label: 'J2', dataType: 'real', unit: '°', min: -90, max: 90, sim: { kind: 'sine', base: 15, amp: 25, period: 4, phase: 0.6, enableTag: '$run' } },
      { role: 'j3', label: 'J3', dataType: 'real', unit: '°', min: -120, max: 120, sim: { kind: 'sine', base: 30, amp: 25, period: 4, phase: 1.4, enableTag: '$run' } },
      { role: 'j4', label: 'J4', dataType: 'real', unit: '°', min: -180, max: 180, sim: { kind: 'sine', base: 0, amp: 40, period: 6, enableTag: '$run' } },
      { role: 'j5', label: 'J5', dataType: 'real', unit: '°', min: -120, max: 120, sim: { kind: 'sine', base: 40, amp: 25, period: 4, phase: 2.2, enableTag: '$run' } },
      { role: 'j6', label: 'J6', dataType: 'real', unit: '°', min: -360, max: 360, sim: { kind: 'sine', base: 0, amp: 90, period: 5, enableTag: '$run' } },
      { role: 'gripper', label: '그리퍼', dataType: 'bool', writable: true, sim: { kind: 'toggle', prob: 0.5, period: 2 } },
      { role: 'fault', label: '고장', dataType: 'bool', alarmOnTrue: true, alarmSeverity: 'critical', alarmText: '로봇 충돌 감지', sim: { kind: 'toggle', prob: 0.01, period: 30 } },
    ],
    params: [
      { key: 'reach', label: '도달거리 (m)', kind: 'number', min: 0.5, max: 3, step: 0.05 },
      { key: 'color', label: '도장 색상', kind: 'color' },
    ],
    defaults: { reach: 1.4, color: '#f59e0b' },
  },
  tank: {
    type: 'tank',
    label: '저장 탱크',
    icon: '◫',
    description: '스테인리스 탱크, 레벨/온도 표시 및 투명 사이트글라스',
    roles: [
      { role: 'level', label: '레벨', dataType: 'real', unit: '%', min: 0, max: 100, alarmHigh: 92, alarmLow: 8, sim: { kind: 'sine', base: 55, amp: 35, period: 90 } },
      { role: 'temp', label: '온도', dataType: 'real', unit: '°C', min: 0, max: 120, alarmHigh: 85, sim: { kind: 'sine', base: 62, amp: 8, period: 60 } },
      { role: 'agitator', label: '교반기', dataType: 'bool', writable: true, sim: { kind: 'const', base: 1 } },
    ],
    params: [
      { key: 'radius', label: '반경 (m)', kind: 'number', min: 0.3, max: 5, step: 0.05 },
      { key: 'height', label: '동체 높이 (m)', kind: 'number', min: 0.5, max: 12, step: 0.1 },
      { key: 'liquidColor', label: '액체 색상', kind: 'color' },
    ],
    defaults: { radius: 0.9, height: 2.4, liquidColor: '#38bdf8' },
  },
  pump: {
    type: 'pump',
    label: '원심 펌프',
    icon: '◎',
    description: '모터 + 원심펌프 스키드, 회전수/압력 연동',
    roles: [
      { role: 'run', label: '운전', dataType: 'bool', writable: true, sim: { kind: 'const', base: 1 } },
      { role: 'rpm', label: '회전수', dataType: 'real', unit: 'rpm', min: 0, max: 3600, sim: { kind: 'sine', base: 1750, amp: 60, period: 12, enableTag: '$run' } },
      { role: 'pressure', label: '토출 압력', dataType: 'real', unit: 'bar', min: 0, max: 10, alarmHigh: 8.5, sim: { kind: 'sine', base: 4.2, amp: 0.6, period: 20, enableTag: '$run' } },
      { role: 'fault', label: '고장', dataType: 'bool', alarmOnTrue: true, alarmSeverity: 'major', alarmText: '펌프 캐비테이션', sim: { kind: 'toggle', prob: 0.01, period: 40 } },
    ],
    params: [
      { key: 'size', label: '크기 배율', kind: 'number', min: 0.5, max: 3, step: 0.1 },
      { key: 'color', label: '도장 색상', kind: 'color' },
    ],
    defaults: { size: 1, color: '#2563eb' },
  },
  valve: {
    type: 'valve',
    label: '제어 밸브',
    icon: '⋈',
    description: '공압 액추에이터 볼 밸브, 개도 표시',
    roles: [
      { role: 'open', label: '열림', dataType: 'bool', writable: true, sim: { kind: 'toggle', prob: 0.7, period: 15 } },
      { role: 'position', label: '개도', dataType: 'real', unit: '%', min: 0, max: 100, writable: true, sim: { kind: 'follow', followTag: '$open', scale: 100, tau: 1.5 } },
    ],
    params: [
      { key: 'size', label: '크기 배율', kind: 'number', min: 0.5, max: 3, step: 0.1 },
    ],
    defaults: { size: 1 },
  },
  stacklight: {
    type: 'stacklight',
    label: '타워 램프',
    icon: '⫶',
    description: '적/황/녹 3단 신호등 (태그 미연결 시 라인 상태 자동 반영)',
    roles: [
      { role: 'red', label: '적색', dataType: 'bool' },
      { role: 'yellow', label: '황색', dataType: 'bool' },
      { role: 'green', label: '녹색', dataType: 'bool' },
    ],
    params: [{ key: 'height', label: '폴 높이 (m)', kind: 'number', min: 0.2, max: 3, step: 0.05 }],
    defaults: { height: 1.1 },
  },
  cnc: {
    type: 'cnc',
    label: 'CNC 가공기',
    icon: '▣',
    description: '머시닝센터, 스핀들/도어/가공 진행률 연동',
    roles: [
      { role: 'run', label: '운전', dataType: 'bool', writable: true, sim: { kind: 'const', base: 1 } },
      { role: 'spindle', label: '스핀들', dataType: 'real', unit: 'rpm', min: 0, max: 12000, alarmHigh: 11500, sim: { kind: 'sine', base: 8000, amp: 1500, period: 18, enableTag: '$run' } },
      { role: 'progress', label: '진행률', dataType: 'real', unit: '%', min: 0, max: 100, sim: { kind: 'ramp', rate: 4, base: 100, enableTag: '$run' } },
      { role: 'door', label: '도어 열림', dataType: 'bool', writable: true, sim: { kind: 'toggle', prob: 0.15, period: 20 } },
      { role: 'fault', label: '고장', dataType: 'bool', alarmOnTrue: true, alarmSeverity: 'major', alarmText: '공구 마모 한계', sim: { kind: 'toggle', prob: 0.015, period: 35 } },
    ],
    params: [{ key: 'color', label: '커버 색상', kind: 'color' }],
    defaults: { color: '#e5e7eb' },
  },
  cabinet: {
    type: 'cabinet',
    label: '제어반 (PLC)',
    icon: '▥',
    description: 'PLC/LabVIEW 제어반, 통신 상태 표시',
    roles: [
      { role: 'power', label: '전원', dataType: 'bool', sim: { kind: 'const', base: 1 } },
      { role: 'comm', label: '통신 정상', dataType: 'bool', sim: { kind: 'const', base: 1 } },
      { role: 'cpu', label: 'CPU 부하', dataType: 'real', unit: '%', min: 0, max: 100, alarmHigh: 90, sim: { kind: 'random', base: 35, amp: 10 } },
    ],
    params: [
      { key: 'bays', label: '판넬 수', kind: 'number', min: 1, max: 6, step: 1 },
      { key: 'color', label: '도장 색상', kind: 'color' },
    ],
    defaults: { bays: 2, color: '#cbd5e1' },
  },
  agv: {
    type: 'agv',
    label: 'AGV',
    icon: '⬒',
    description: '무인 운반차, 경로 진행률(%)로 위치 연동',
    roles: [
      { role: 'run', label: '운행', dataType: 'bool', writable: true, sim: { kind: 'const', base: 1 } },
      { role: 'progress', label: '경로 위치', dataType: 'real', unit: '%', min: 0, max: 100, sim: { kind: 'ramp', rate: 2.5, base: 100, enableTag: '$run' } },
      { role: 'battery', label: '배터리', dataType: 'real', unit: '%', min: 0, max: 100, alarmLow: 15, sim: { kind: 'sine', base: 60, amp: 30, period: 300 } },
    ],
    params: [
      { key: 'pathW', label: '경로 폭 (m)', kind: 'number', min: 1, max: 40, step: 0.5 },
      { key: 'pathD', label: '경로 깊이 (m)', kind: 'number', min: 1, max: 40, step: 0.5 },
    ],
    defaults: { pathW: 10, pathD: 4 },
  },
  pipe: {
    type: 'pipe',
    label: '배관',
    icon: '⌇',
    description: '꺾임점 기반 배관, 유량 흐름 애니메이션',
    roles: [
      { role: 'flow', label: '유량', dataType: 'real', unit: 'm³/h', min: 0, max: 50, sim: { kind: 'sine', base: 22, amp: 4, period: 25 } },
    ],
    params: [
      { key: 'radius', label: '관경 반경 (m)', kind: 'number', min: 0.02, max: 0.5, step: 0.01 },
      { key: 'color', label: '배관 색상', kind: 'color' },
    ],
    defaults: { radius: 0.06, color: '#9ca3af', points: [[0, 0, 0], [2, 0, 0], [2, 0, 2]] },
  },
  imported: {
    type: 'imported',
    label: 'CAD 모델',
    icon: '⬡',
    description: 'GLB/GLTF/STL/OBJ/STEP 파일 임포트, 노드별 태그 애니메이션',
    roles: [
      { role: 'run', label: '운전', dataType: 'bool', sim: { kind: 'const', base: 1 } },
      { role: 'fault', label: '고장', dataType: 'bool', alarmOnTrue: true, alarmSeverity: 'major', alarmText: '설비 이상', sim: { kind: 'toggle', prob: 0.01, period: 40 } },
    ],
    params: [
      { key: 'unitScale', label: '단위 배율 (mm→m = 0.001)', kind: 'number', min: 0.0001, max: 100, step: 0.001 },
      { key: 'tint', label: '재질 덮어쓰기', kind: 'bool' },
      { key: 'color', label: '덮어쓰기 색상', kind: 'color' },
    ],
    defaults: { unitScale: 1, tint: false, color: '#94a3b8' },
  },
};

export const CATALOG_LIST = Object.values(CATALOG);
