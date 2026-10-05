import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { M } from '../materials';
import { dynamicCanvas, labelTexture } from '../textures';
import { bool, num, roleValue, useTwin } from '../../store/useTwin';
import type { ModelProps } from './types';

/** 제어반 (PLC / LabVIEW PC) — 도어 HMI 화면에 연결 상태 표시 */
export function Cabinet({ eq }: ModelProps) {
  const bays = Math.max(1, Math.round(Number(eq.params.bays ?? 2)));
  const color = String(eq.params.color ?? '#cbd5e1');
  const bw = 0.8, H = 2.0, D = 0.6, plinth = 0.1;
  const W = bays * bw;
  const body = M.paint(color, 0.45);
  const screen = useMemo(() => dynamicCanvas(320, 220), []);
  const screenMat = useMemo(() => new THREE.MeshStandardMaterial({ map: screen.tex, emissive: '#ffffff', emissiveMap: screen.tex, emissiveIntensity: 0.9, toneMapped: false }), [screen]);
  const powerMat = useMemo(() => M.emissive('#22c55e', 0), []);
  const commMat = useMemo(() => M.emissive('#38bdf8', 0), []);
  const faultMat = useMemo(() => M.emissive('#ef4444', 0), []);
  const plate = useMemo(() => labelTexture(`${eq.id}  CONTROL PANEL`, { bg: '#f8fafc', fg: '#0f172a', w: 512, h: 64 }), [eq.id]);
  const acc = useRef(1);

  useEffect(() => () => { screen.tex.dispose(); screenMat.dispose(); }, [screen, screenMat]);

  useFrame(({ clock }, dt) => {
    const power = bool(roleValue(eq, 'power'), true);
    const comm = bool(roleValue(eq, 'comm'), true);
    powerMat.emissiveIntensity = power ? 3 : 0.05;
    commMat.emissiveIntensity = comm ? (Math.sin(clock.elapsedTime * 10) > 0 ? 3 : 0.6) : 0.05;
    const s = useTwin.getState();
    const anyAlarm = s.alarms.some((a) => a.active && !a.ackedAt);
    faultMat.emissiveIntensity = anyAlarm ? (Math.sin(clock.elapsedTime * 6) > 0 ? 3 : 0.1) : 0.05;

    acc.current += dt;
    if (acc.current < 0.5) return;
    acc.current = 0;
    const g = screen.ctx;
    g.fillStyle = '#0b1220';
    g.fillRect(0, 0, 320, 220);
    g.fillStyle = '#1e293b';
    g.fillRect(0, 0, 320, 30);
    g.fillStyle = '#f8fafc';
    g.font = 'bold 16px monospace';
    g.fillText(`${eq.id} SYSTEM`, 10, 21);
    g.font = '14px monospace';
    let y = 54;
    const conns = s.plant.connections;
    g.fillStyle = s.simulation ? '#facc15' : '#64748b';
    g.fillText(`SIM    ${s.simulation ? 'ON' : 'OFF'}`, 10, y);
    y += 22;
    for (const c of conns) {
      const st = s.conn[c.id]?.state ?? 'disconnected';
      g.fillStyle = st === 'connected' ? '#4ade80' : c.enabled ? '#f87171' : '#64748b';
      g.fillText(`${c.id.toUpperCase().padEnd(7)}${c.enabled ? st.toUpperCase() : 'DISABLED'}`, 10, y);
      y += 22;
    }
    const cpu = num(roleValue(eq, 'cpu'));
    g.fillStyle = '#94a3b8';
    g.fillText(`CPU ${cpu.toFixed(0)}%`, 10, 190);
    g.fillStyle = '#1e293b';
    g.fillRect(100, 178, 200, 14);
    g.fillStyle = cpu > 85 ? '#ef4444' : '#38bdf8';
    g.fillRect(100, 178, 2 * Math.min(100, cpu), 14);
    const act = s.alarms.filter((a) => a.active).length;
    g.fillStyle = act ? '#f87171' : '#4ade80';
    g.fillText(`ALARM ${act}`, 220, 21);
    screen.tex.needsUpdate = true;
  });

  return (
    <group>
      {/* 받침대 */}
      <mesh position={[0, plinth / 2, 0]} material={M.paint('#1f2937', 0.7)} castShadow receiveShadow>
        <boxGeometry args={[W, plinth, D]} />
      </mesh>
      {/* 본체 */}
      <mesh position={[0, plinth + H / 2, -0.02]} material={body} castShadow receiveShadow>
        <boxGeometry args={[W, H, D - 0.04]} />
      </mesh>
      <mesh position={[0, plinth + H + 0.02, 0]} material={body} castShadow>
        <boxGeometry args={[W + 0.02, 0.04, D + 0.02]} />
      </mesh>
      {/* 도어 */}
      {Array.from({ length: bays }, (_, i) => {
        const x = -W / 2 + bw / 2 + i * bw;
        return (
          <group key={i} position={[x, plinth, D / 2 - 0.02]}>
            <RoundedBox args={[bw - 0.012, H - 0.01, 0.025]} radius={0.008} smoothness={2} position={[0, H / 2, 0]} material={body} castShadow />
            {/* 손잡이 */}
            <mesh position={[bw / 2 - 0.07, H / 2, 0.025]} material={M.darkSteel()}>
              <boxGeometry args={[0.03, 0.18, 0.03]} />
            </mesh>
            {/* 환기 그릴 */}
            {i !== 0 &&
              [0.35, H - 0.35].map((gy) => (
                <group key={gy} position={[0, gy, 0.014]}>
                  <mesh material={M.plastic('#94a3b8')}>
                    <boxGeometry args={[0.26, 0.26, 0.01]} />
                  </mesh>
                  {Array.from({ length: 7 }, (_, k) => (
                    <mesh key={k} position={[0, -0.1 + k * 0.033, 0.006]} material={M.plastic('#475569')}>
                      <boxGeometry args={[0.22, 0.008, 0.004]} />
                    </mesh>
                  ))}
                </group>
              ))}
            {i === 0 && (
              <group>
                {/* HMI 터치패널 */}
                <RoundedBox args={[0.4, 0.3, 0.03]} radius={0.01} position={[0, 1.35, 0.02]} material={M.plastic('#111827')} />
                <mesh position={[0, 1.35, 0.036]} material={screenMat} userData={{ keepMaterial: true }}>
                  <planeGeometry args={[0.36, 0.25]} />
                </mesh>
                {/* 파일럿 램프 */}
                {[powerMat, commMat, faultMat].map((m, k) => (
                  <group key={k} position={[-0.12 + k * 0.12, 1.05, 0.02]}>
                    <mesh rotation={[Math.PI / 2, 0, 0]} material={M.chrome()}>
                      <cylinderGeometry args={[0.024, 0.024, 0.012, 20]} />
                    </mesh>
                    <mesh position={[0, 0, 0.01]} material={m} userData={{ keepMaterial: true }}>
                      <sphereGeometry args={[0.018, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    </mesh>
                  </group>
                ))}
                {/* 비상정지 */}
                <mesh position={[0, 0.88, 0.03]} rotation={[Math.PI / 2, 0, 0]} material={M.plastic('#facc15')}>
                  <cylinderGeometry args={[0.05, 0.05, 0.01, 24]} />
                </mesh>
                <mesh position={[0, 0.88, 0.05]} rotation={[Math.PI / 2, 0, 0]} material={M.plastic('#dc2626')}>
                  <cylinderGeometry args={[0.032, 0.026, 0.03, 24]} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
      {/* 명판 */}
      <mesh position={[0, plinth + H - 0.08, D / 2 + 0.01]} userData={{ keepMaterial: true }}>
        <planeGeometry args={[Math.min(W - 0.1, 1.2), 0.08]} />
        <meshStandardMaterial map={plate} roughness={0.5} />
      </mesh>
      {/* 상부 케이블 트레이 */}
      <group position={[0, plinth + H + 0.6, 0]}>
        <mesh position={[0, -0.28, 0]} material={M.darkSteel()}>
          <boxGeometry args={[0.2, 0.56, 0.1]} />
        </mesh>
        <mesh position={[W / 2 + 1.5, 0, 0]} material={M.aluminum()} castShadow>
          <boxGeometry args={[W + 3, 0.06, 0.3]} />
        </mesh>
      </group>
    </group>
  );
}
