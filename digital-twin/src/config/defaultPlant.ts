import { createEquipment, resetAddressCounter, type CreateOptions } from './factory';
import type { Equipment, EquipmentType, PlantConfig, TagDef } from '../types';

/**
 * 데모용 기본 공장 레이아웃.
 *  - plc1    : PLC 게이트웨이 (WebSocket) — 모션/운전/카운터 등 제어 신호
 *  - labview : LabVIEW (WebSocket)      — 레벨·온도·유량 등 계측 신호
 * 연결이 비활성화된 동안에는 내장 시뮬레이터가 값을 생성한다.
 */
export function buildDefaultPlant(): PlantConfig {
  resetAddressCounter();
  const equipment: Equipment[] = [];
  const tags: TagDef[] = [];
  const add = (type: EquipmentType, o: CreateOptions) => {
    const r = createEquipment(type, o);
    equipment.push(r.equipment);
    tags.push(...r.tags);
    return r.equipment;
  };

  // ── 유틸리티 존 (LabVIEW 계측) ─────────────────────────
  add('cabinet', { id: 'CP01', name: '메인 제어반', position: [-17, 0, -11.2], group: '유틸리티', params: { bays: 3 } });
  add('tank', { id: 'TK01', name: '원료 탱크 #1', position: [-16, 0, -5], group: '유틸리티', source: 'labview', addressing: 'labview' });
  add('tank', { id: 'TK02', name: '원료 탱크 #2', position: [-16, 0, -1.2], group: '유틸리티', source: 'labview', addressing: 'labview', params: { liquidColor: '#a3e635' } });
  add('pump', { id: 'P01', name: '이송 펌프', position: [-12.5, 0, -3], group: '유틸리티' });
  add('valve', { id: 'XV01', name: '공급 밸브', position: [-10.2, 0.42, -3], group: '유틸리티' });
  add('pipe', {
    id: 'L01', name: '흡입 배관', group: '유틸리티', source: 'labview', addressing: 'labview',
    params: { points: [[-15.1, 0.42, -5], [-14, 0.42, -5], [-14, 0.42, -1.2], [-15.1, 0.42, -1.2]], radius: 0.06 },
  });
  // 흡입 헤더 → 펌프 분기 (유량 태그는 L01 공유)
  add('pipe', {
    id: 'L03', name: '펌프 흡입 분기', group: '유틸리티', skipRoles: ['flow'],
    params: { points: [[-14, 0.42, -3], [-13.15, 0.42, -3]], radius: 0.06 },
  }).bindings.flow = 'L01.flow';
  add('pipe', {
    id: 'L02', name: '절삭유 공급 배관', group: '유틸리티', source: 'labview', addressing: 'labview',
    params: { points: [[-11.8, 0.42, -3], [-6, 0.42, -3], [-6, 3.4, -3], [-6, 3.4, -8.2], [1.5, 3.4, -8.2], [1.5, 2.45, -8.2]], radius: 0.05, color: '#16a34a' },
  });

  // ── 가공 존 (PLC) ─────────────────────────────────────
  add('cnc', { id: 'MC01', name: '머시닝센터 #1', position: [-3, 0, -6.6], group: '가공 라인' });
  add('cnc', { id: 'MC02', name: '머시닝센터 #2', position: [1.5, 0, -6.6], group: '가공 라인', params: { color: '#d6d3d1' } });
  add('robot', { id: 'RB01', name: '로딩 로봇 #1', position: [-0.8, 0, -3.9], group: '가공 라인' });
  add('robot', { id: 'RB02', name: '팔레타이징 로봇', position: [6, 0, -0.4], group: '조립/이송', params: { color: '#ef4444', reach: 1.6 } });
  add('conveyor', { id: 'CV01', name: '메인 컨베이어', position: [2, 0, -2], group: '조립/이송', params: { length: 12 } });
  add('conveyor', { id: 'CV02', name: '출하 컨베이어', position: [10.5, 0, 1.2], rotation: [0, -90, 0], group: '조립/이송', params: { length: 7, beltColor: '#0f766e' } });
  add('stacklight', { id: 'SL01', name: '라인 신호등', position: [8.6, 0, -2.9], group: '조립/이송', skipRoles: ['red', 'yellow', 'green'] });
  add('stacklight', { id: 'SL02', name: '가공 신호등', position: [3.2, 0, -5.2], group: '가공 라인', skipRoles: ['red', 'yellow', 'green'] });

  // ── 물류 ───────────────────────────────────────────────
  add('agv', { id: 'AGV01', name: 'AGV #1', position: [1, 0, 6], group: '물류', params: { pathW: 20, pathD: 4.5 } });

  // 라인 단위 KPI 태그
  tags.push(
    { id: 'LINE.oee', name: '라인 OEE', address: 'D900', source: 'plc1', dataType: 'real', unit: '%', min: 0, max: 100, decimals: 1, alarmLow: 70, alarmSeverity: 'minor', alarmText: 'OEE 목표 미달', sim: { kind: 'sine', base: 84, amp: 6, period: 120 } },
    { id: 'LINE.power', name: '라인 전력', address: 'Power/Total', source: 'labview', dataType: 'real', unit: 'kW', min: 0, max: 400, decimals: 1, sim: { kind: 'random', base: 182, amp: 14 } },
    { id: 'LINE.cycle', name: '사이클 타임', address: 'D902', source: 'plc1', dataType: 'real', unit: 's', min: 0, max: 120, decimals: 1, sim: { kind: 'random', base: 42, amp: 2 } },
  );

  return {
    version: 1,
    name: '스마트 가공 라인 #1',
    site: '제1공장 A동',
    floor: { width: 44, depth: 28 },
    connections: [
      { id: 'plc1', name: 'PLC 게이트웨이', kind: 'websocket', url: 'ws://localhost:8090/plc', enabled: false, intervalMs: 200, device: 'PLC (Modbus TCP / MC / S7 via Gateway)' },
      { id: 'labview', name: 'LabVIEW DAQ', kind: 'websocket', url: 'ws://localhost:8091/labview', enabled: false, intervalMs: 200, device: 'LabVIEW (WebSocket / Web Service)' },
    ],
    tags,
    equipment,
    kpis: [
      { id: 'k1', label: '생산 수량', tag: 'CV01.count', unit: 'ea', decimals: 0 },
      { id: 'k2', label: 'OEE', tag: 'LINE.oee', unit: '%', decimals: 1 },
      { id: 'k3', label: '사이클 타임', tag: 'LINE.cycle', unit: 's', decimals: 1 },
      { id: 'k4', label: '전력', tag: 'LINE.power', unit: 'kW', decimals: 1 },
    ],
  };
}
