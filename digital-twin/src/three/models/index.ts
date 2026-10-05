import type { ComponentType } from 'react';
import type { EquipmentType } from '../../types';
import type { ModelProps } from './types';
import { Conveyor } from './Conveyor';
import { Robot } from './Robot';
import { Tank } from './Tank';
import { Pump } from './Pump';
import { Valve } from './Valve';
import { StackLight } from './StackLight';
import { Cnc } from './Cnc';
import { Cabinet } from './Cabinet';
import { Agv } from './Agv';
import { Pipe } from './Pipe';
import { Imported } from './Imported';

export const MODELS: Record<EquipmentType, ComponentType<ModelProps>> = {
  conveyor: Conveyor,
  robot: Robot,
  tank: Tank,
  pump: Pump,
  valve: Valve,
  stacklight: StackLight,
  cnc: Cnc,
  cabinet: Cabinet,
  agv: Agv,
  pipe: Pipe,
  imported: Imported,
};

/** 3D 라벨 표시 높이 (m) */
export function labelHeight(type: EquipmentType, p: Record<string, unknown>): number {
  switch (type) {
    case 'conveyor': return Number(p.height ?? 0.85) + 0.6;
    case 'robot': return 1.9 * (Number(p.reach ?? 1.4) / 1.4);
    case 'tank': return Number(p.height ?? 2.4) + Number(p.radius ?? 0.9) * 1.2 + 1.6;
    case 'pump': return 1.7 * Number(p.size ?? 1);
    case 'valve': return 0.8 * Number(p.size ?? 1);
    case 'stacklight': return Number(p.height ?? 1.1) + 0.7;
    case 'cnc': return 2.7;
    case 'cabinet': return 2.6;
    case 'agv': return 1.0;
    case 'pipe': return 0.6;
    default: return 2;
  }
}
