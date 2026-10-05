import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { M } from '../materials';
import { dynamicCanvas, labelTexture } from '../textures';
import { bool, num, roleValue } from '../../store/useTwin';
import type { ModelProps } from './types';

/** 수직형 머시닝센터 — 슬라이딩 도어, 스핀들 헤드, 조작반 HMI 화면 */
export function Cnc({ eq }: ModelProps) {
  const color = String(eq.params.color ?? '#e5e7eb');
  const W = 2.4, D = 1.9, H = 2.25;
  const cover = M.paint(color, 0.38);
  const band = M.paint('#374151', 0.5);
  const accent = M.paint('#0ea5e9', 0.4);

  const doors = useRef<(THREE.Group | null)[]>([]);
  const head = useRef<THREE.Group>(null);
  const tool = useRef<THREE.Mesh>(null);
  const table = useRef<THREE.Group>(null);
  const doorPos = useRef(0);
  const spin = useRef(0);
  const screen = useMemo(() => dynamicCanvas(320, 200), []);
  const screenMat = useMemo(() => new THREE.MeshStandardMaterial({ map: screen.tex, emissive: '#ffffff', emissiveMap: screen.tex, emissiveIntensity: 0.9, toneMapped: false }), [screen]);
  const logo = useMemo(() => labelTexture(`${eq.id}  VMC-850`, { bg: '#374151', fg: '#f1f5f9', w: 512, h: 64 }), [eq.id]);
  const acc = useRef(1);
  const workLight = useMemo(() => M.emissive('#e0f2fe', 1.5), []);

  useEffect(() => () => { screen.tex.dispose(); screenMat.dispose(); }, [screen, screenMat]);

  useFrame(({ clock }, dt) => {
    const run = bool(roleValue(eq, 'run'), true);
    const fault = bool(roleValue(eq, 'fault'));
    const doorOpen = bool(roleValue(eq, 'door'));
    const rpm = run && !fault && !doorOpen ? num(roleValue(eq, 'spindle'), 8000) : 0;
    const prog = num(roleValue(eq, 'progress'));
    doorPos.current += ((doorOpen ? 1 : 0) - doorPos.current) * Math.min(1, dt * 2.5);
    if (doors.current[0]) doors.current[0].position.x = -0.67 - doorPos.current * 0.5;
    if (doors.current[1]) doors.current[1].position.x = 0.03 + doorPos.current * 0.5;
    spin.current += (rpm - spin.current) * Math.min(1, dt * 2);
    if (tool.current) tool.current.rotation.y += spin.current * dt * 0.004;
    const t = clock.elapsedTime;
    const active = spin.current > 100;
    if (head.current) head.current.position.y = 1.55 + (active ? Math.sin(t * 0.9) * 0.06 - 0.08 : 0.1);
    if (table.current && active) {
      table.current.position.x = Math.sin(t * 0.6) * 0.25;
      table.current.position.z = Math.cos(t * 0.45) * 0.1;
    }

    // 조작반 화면 (2Hz 갱신)
    acc.current += dt;
    if (acc.current > 0.5) {
      acc.current = 0;
      const g = screen.ctx;
      g.fillStyle = '#0b1220';
      g.fillRect(0, 0, 320, 200);
      g.fillStyle = fault ? '#7f1d1d' : run ? '#065f46' : '#713f12';
      g.fillRect(0, 0, 320, 34);
      g.fillStyle = '#f8fafc';
      g.font = 'bold 18px monospace';
      g.fillText(`${eq.id}  ${fault ? 'ALARM' : run ? (doorOpen ? 'DOOR' : 'AUTO') : 'STOP'}`, 10, 24);
      g.font = '15px monospace';
      g.fillStyle = '#94a3b8';
      g.fillText('O1024  N0350  G01 X-42.5', 10, 60);
      g.fillStyle = '#e2e8f0';
      g.fillText(`S ${Math.round(spin.current).toString().padStart(5)} rpm`, 10, 88);
      g.fillText(`F  ${(1200 * (active ? 1 : 0)).toString().padStart(4)} mm/min`, 10, 112);
      g.fillStyle = '#1e293b';
      g.fillRect(10, 140, 300, 22);
      g.fillStyle = '#38bdf8';
      g.fillRect(10, 140, 3 * Math.max(0, Math.min(100, prog)), 22);
      g.fillStyle = '#f8fafc';
      g.fillText(`${prog.toFixed(1)} %`, 130, 157);
      g.fillStyle = '#64748b';
      g.fillText(new Date().toLocaleTimeString('ko-KR'), 10, 190);
      screen.tex.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* 베이스 & 하부 밴드 */}
      <RoundedBox args={[W, 0.35, D]} radius={0.03} position={[0, 0.175, 0]} material={band} castShadow receiveShadow />
      {/* 측면/후면 커버 */}
      <RoundedBox args={[0.08, H - 0.35, D]} radius={0.02} position={[-W / 2 + 0.04, 0.35 + (H - 0.35) / 2, 0]} material={cover} castShadow receiveShadow />
      <RoundedBox args={[0.08, H - 0.35, D]} radius={0.02} position={[W / 2 - 0.04, 0.35 + (H - 0.35) / 2, 0]} material={cover} castShadow receiveShadow />
      <mesh position={[0, 0.35 + (H - 0.35) / 2, -D / 2 + 0.04]} material={cover} castShadow receiveShadow>
        <boxGeometry args={[W - 0.1, H - 0.35, 0.08]} />
      </mesh>
      <RoundedBox args={[W, 0.12, D]} radius={0.03} position={[0, H - 0.06, 0]} material={cover} castShadow />
      {/* 전면 고정 패널 + 액센트 */}
      <mesh position={[W / 2 - 0.42, 0.35 + (H - 0.47) / 2, D / 2 - 0.04]} material={cover} castShadow>
        <boxGeometry args={[0.76, H - 0.47, 0.06]} />
      </mesh>
      <mesh position={[0, H - 0.2, D / 2 - 0.02]} material={accent}>
        <boxGeometry args={[W - 0.1, 0.06, 0.04]} />
      </mesh>
      <mesh position={[0, H - 0.08, D / 2 + 0.002]} userData={{ keepMaterial: true }}>
        <planeGeometry args={[1.4, 0.12]} />
        <meshStandardMaterial map={logo} roughness={0.5} />
      </mesh>

      {/* 가공실 내부 */}
      <mesh position={[0, 0.36, 0]} material={M.darkSteel()} receiveShadow>
        <boxGeometry args={[W - 0.2, 0.02, D - 0.2]} />
      </mesh>
      {/* 컬럼 */}
      <mesh position={[0, 1.2, -0.6]} material={M.castIron('#52525b')} castShadow>
        <boxGeometry args={[0.6, 1.7, 0.4]} />
      </mesh>
      {/* 테이블 + 바이스 + 공작물 */}
      <group ref={table} position={[0, 0.72, 0.15]}>
        <mesh material={M.castIron('#52525b')} castShadow receiveShadow>
          <boxGeometry args={[1.2, 0.12, 0.6]} />
        </mesh>
        {[-0.2, -0.07, 0.07, 0.2].map((z) => (
          <mesh key={z} position={[0, 0.061, z]} material={M.darkSteel()}>
            <boxGeometry args={[1.2, 0.004, 0.02]} />
          </mesh>
        ))}
        <mesh position={[0, 0.12, 0]} material={M.darkSteel()} castShadow>
          <boxGeometry args={[0.3, 0.12, 0.2]} />
        </mesh>
        <mesh position={[0, 0.21, 0]} material={M.aluminum()} castShadow>
          <boxGeometry args={[0.18, 0.08, 0.14]} />
        </mesh>
      </group>
      {/* 스핀들 헤드 */}
      <group ref={head} position={[0, 1.55, -0.1]}>
        <mesh material={M.castIron('#52525b')} castShadow>
          <boxGeometry args={[0.4, 0.5, 0.55]} />
        </mesh>
        <mesh position={[0, 0.4, -0.05]} material={M.paint('#1f2937')} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 0.3, 24]} />
        </mesh>
        <mesh position={[0, -0.32, 0.15]} material={M.chrome()}>
          <cylinderGeometry args={[0.07, 0.09, 0.14, 24]} />
        </mesh>
        <mesh ref={tool} position={[0, -0.47, 0.15]} material={M.chrome()} castShadow>
          <cylinderGeometry args={[0.012, 0.02, 0.18, 8]} />
        </mesh>
      </group>
      {/* 작업등 */}
      <mesh position={[-0.6, H - 0.2, 0.2]} material={workLight}>
        <boxGeometry args={[0.5, 0.02, 0.05]} />
      </mesh>

      {/* 양개 슬라이딩 도어 (창) */}
      {[0, 1].map((i) => (
        <group key={i} ref={(g) => { doors.current[i] = g; }} position={[i ? 0.03 : -0.67, 0.35, D / 2 + (i ? 0.035 : 0.01)]}>
          <mesh position={[0, (H - 0.47) / 2, 0]} material={cover} castShadow>
            <boxGeometry args={[0.74, H - 0.47, 0.03]} />
          </mesh>
          <mesh position={[0, (H - 0.47) / 2 + 0.12, 0.017]} material={M.glass('#cbd5e1')} userData={{ keepMaterial: true }}>
            <planeGeometry args={[0.5, 0.8]} />
          </mesh>
          <mesh position={[i ? -0.32 : 0.32, (H - 0.47) / 2, 0.035]} material={M.chrome()} castShadow>
            <boxGeometry args={[0.025, 0.4, 0.03]} />
          </mesh>
        </group>
      ))}
      <mesh position={[-1.1, 0.35 + (H - 0.47) / 2, D / 2 - 0.04]} material={cover}>
        <boxGeometry args={[0.12, H - 0.47, 0.06]} />
      </mesh>

      {/* 조작반 (팬던트) */}
      <group position={[W / 2 + 0.05, 1.45, D / 2 - 0.1]} rotation={[0, -0.5, 0]}>
        <mesh position={[-0.05, 0.1, -0.1]} rotation={[0, 0, Math.PI / 2]} material={M.chrome()}>
          <cylinderGeometry args={[0.025, 0.025, 0.15, 10]} />
        </mesh>
        <RoundedBox args={[0.42, 0.62, 0.08]} radius={0.02} position={[0.18, 0, 0]} material={M.paint('#334155')} castShadow />
        <mesh position={[0.18, 0.1, 0.041]} material={screenMat} userData={{ keepMaterial: true }}>
          <planeGeometry args={[0.34, 0.21]} />
        </mesh>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} position={[0.04 + (i % 6) * 0.055, -0.1 - Math.floor(i / 6) * 0.05, 0.045]} material={M.plastic(i === 11 ? '#16a34a' : '#cbd5e1')}>
            <boxGeometry args={[0.04, 0.03, 0.01]} />
          </mesh>
        ))}
        <mesh position={[0.32, -0.23, 0.05]} rotation={[Math.PI / 2, 0, 0]} material={M.plastic('#dc2626')}>
          <cylinderGeometry args={[0.025, 0.02, 0.02, 20]} />
        </mesh>
      </group>

      {/* 칩 컨베이어 + 절삭유 탱크 */}
      <mesh position={[W / 2 + 0.3, 0.35, -0.2]} rotation={[0, 0, -0.5]} material={M.paint('#475569')} castShadow>
        <boxGeometry args={[0.9, 0.18, 0.38]} />
      </mesh>
      <mesh position={[W / 2 + 0.55, 0.92, -0.2]} material={M.paint('#94a3b8')} castShadow>
        <boxGeometry args={[0.35, 0.35, 0.4]} />
      </mesh>
      <RoundedBox args={[0.7, 0.45, 0.6]} radius={0.02} position={[-W / 2 - 0.4, 0.225, -0.4]} material={M.paint('#475569')} castShadow />
    </group>
  );
}
