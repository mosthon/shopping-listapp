import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { M } from '../materials';
import { bool, computeStatus, useTwin } from '../../store/useTwin';
import type { ModelProps } from './types';

const COLORS = { red: '#ff2a2a', yellow: '#ffb000', green: '#16ff5a' } as const;
type Lamp = keyof typeof COLORS;

/** 3단 타워 램프. 태그 미연결 시 같은 그룹 설비 상태(알람>정지>운전)를 표시 */
export function StackLight({ eq }: ModelProps) {
  const H = Number(eq.params.height ?? 1.1);
  const mats = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(COLORS) as Lamp[]).map((k) => [
          k,
          new THREE.MeshPhysicalMaterial({
            color: COLORS[k], emissive: COLORS[k], emissiveIntensity: 0, roughness: 0.25, transmission: 0.2,
            transparent: true, opacity: 0.92, toneMapped: false,
          }),
        ]),
      ) as Record<Lamp, THREE.MeshPhysicalMaterial>,
    [],
  );
  const lights = useRef<Record<Lamp, THREE.PointLight | null>>({ red: null, yellow: null, green: null });
  const acc = useRef(0);
  const state = useRef<Record<Lamp, boolean>>({ red: false, yellow: false, green: false });

  useFrame(({ clock }, dt) => {
    acc.current += dt;
    if (acc.current > 0.2) {
      acc.current = 0;
      const s = useTwin.getState();
      const b = eq.bindings;
      if (b.red || b.yellow || b.green) {
        state.current = {
          red: bool(s.values[b.red ?? '']),
          yellow: bool(s.values[b.yellow ?? '']),
          green: bool(s.values[b.green ?? '']),
        };
      } else {
        const peers = s.plant.equipment.filter((e) => e.id !== eq.id && e.type !== 'stacklight' && (!eq.group || e.group === eq.group));
        const st = peers.map((p) => computeStatus(p, s));
        const alarm = st.includes('alarm');
        const warn = st.includes('warning') || st.includes('idle');
        const offline = st.length > 0 && st.every((x) => x === 'offline');
        state.current = { red: alarm, yellow: !alarm && (warn || offline), green: !alarm && !warn && !offline };
      }
    }
    const blink = Math.sin(clock.elapsedTime * 8) > 0;
    (Object.keys(COLORS) as Lamp[]).forEach((k) => {
      const on = state.current[k] && (k !== 'red' || blink);
      const target = on ? 4 : 0.02;
      mats[k].emissiveIntensity += (target - mats[k].emissiveIntensity) * Math.min(1, dt * 20);
      const l = lights.current[k];
      if (l) l.intensity = on ? 1.2 : 0;
    });
  });

  const seg = 0.11;
  const top = H;
  return (
    <group>
      <mesh position={[0, 0.01, 0]} material={M.darkSteel()} castShadow receiveShadow>
        <cylinderGeometry args={[0.09, 0.1, 0.02, 24]} />
      </mesh>
      <mesh position={[0, top / 2, 0]} material={M.chrome()} castShadow>
        <cylinderGeometry args={[0.016, 0.016, top, 12]} />
      </mesh>
      <mesh position={[0, top + 0.02, 0]} material={M.plastic('#1f2937')} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.04, 24]} />
      </mesh>
      {(['green', 'yellow', 'red'] as Lamp[]).map((k, i) => (
        <group key={k} position={[0, top + 0.04 + seg / 2 + i * (seg + 0.006), 0]}>
          <mesh material={mats[k]} userData={{ keepMaterial: true }} castShadow>
            <cylinderGeometry args={[0.04, 0.04, seg, 28]} />
          </mesh>
          <mesh position={[0, seg / 2 + 0.003, 0]} material={M.plastic('#d1d5db')}>
            <cylinderGeometry args={[0.041, 0.041, 0.006, 28]} />
          </mesh>
          <pointLight ref={(l) => { lights.current[k] = l; }} color={COLORS[k]} intensity={0} distance={2.5} decay={2} />
        </group>
      ))}
      <mesh position={[0, top + 0.07 + 3 * (seg + 0.006), 0]} material={M.plastic('#1f2937')}>
        <cylinderGeometry args={[0.03, 0.042, 0.03, 24]} />
      </mesh>
    </group>
  );
}
