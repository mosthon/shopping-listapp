import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { M } from '../materials';
import { BoltCircle, HazardFrame } from '../parts';
import { cardboardTexture, labelTexture } from '../textures';
import { bool, num, roleValue } from '../../store/useTwin';
import type { ModelProps } from './types';

const D2R = Math.PI / 180;

/** 6축 다관절 로봇 — J1(선회) J2(하완) J3(상완) J4(손목회전) J5(손목굽힘) J6(플랜지) */
export function Robot({ eq }: ModelProps) {
  const R = Number(eq.params.reach ?? 1.4);
  const k = R / 1.4;
  const color = String(eq.params.color ?? '#f59e0b');
  const body = M.paint(color, 0.35);
  const dark = M.paint('#374151', 0.5);

  const j = useRef<(THREE.Group | null)[]>([]);
  const fingers = useRef<(THREE.Group | null)[]>([]);
  const payload = useRef<THREE.Mesh>(null);
  const cur = useRef([0, 0, 0, 0, 0, 0, 0]);
  const boxMat = useMemo(() => new THREE.MeshStandardMaterial({ map: cardboardTexture(), roughness: 0.9 }), []);
  const nameTex = useMemo(() => labelTexture(eq.id, { bg: color, fg: '#111827', w: 256, h: 96 }), [eq.id, color]);

  const a2 = 0.62 * k; // 하완 길이
  const a3 = 0.66 * k; // 상완 길이

  useFrame((_, dt) => {
    const target = [
      num(roleValue(eq, 'j1')), num(roleValue(eq, 'j2')), num(roleValue(eq, 'j3')),
      num(roleValue(eq, 'j4')), num(roleValue(eq, 'j5')), num(roleValue(eq, 'j6')),
      bool(roleValue(eq, 'gripper')) ? 1 : 0,
    ];
    const a = Math.min(1, dt * 8);
    for (let i = 0; i < 7; i++) cur.current[i] += (target[i] - cur.current[i]) * a;
    const c = cur.current;
    const J = j.current;
    if (J[0]) J[0].rotation.y = c[0] * D2R;
    if (J[1]) J[1].rotation.z = -c[1] * D2R;
    if (J[2]) J[2].rotation.z = -c[2] * D2R;
    if (J[3]) J[3].rotation.x = c[3] * D2R;
    if (J[4]) J[4].rotation.z = -c[4] * D2R;
    if (J[5]) J[5].rotation.x = c[5] * D2R;
    const gap = 0.055 * k - c[6] * 0.03 * k;
    if (fingers.current[0]) fingers.current[0].position.z = gap;
    if (fingers.current[1]) fingers.current[1].position.z = -gap;
    if (payload.current) payload.current.visible = c[6] > 0.6;
  });

  return (
    <group>
      <HazardFrame w={R * 2} d={R * 2} />
      {/* 베이스 */}
      <mesh position={[0, 0.015, 0]} material={M.darkSteel()} castShadow receiveShadow>
        <boxGeometry args={[0.5 * k, 0.03, 0.5 * k]} />
      </mesh>
      <BoltCircle r={0.2 * k} count={8} size={0.014} y={0.03} />
      <mesh position={[0, 0.03 + 0.11 * k, 0]} material={dark} castShadow>
        <cylinderGeometry args={[0.2 * k, 0.23 * k, 0.22 * k, 40]} />
      </mesh>

      {/* J1 선회 */}
      <group ref={(g) => { j.current[0] = g; }} position={[0, 0.03 + 0.22 * k, 0]}>
        <mesh position={[0, 0.05 * k, 0]} material={body} castShadow>
          <cylinderGeometry args={[0.21 * k, 0.21 * k, 0.1 * k, 40]} />
        </mesh>
        <RoundedBox args={[0.34 * k, 0.3 * k, 0.36 * k]} radius={0.05 * k} smoothness={3} position={[0.06 * k, 0.24 * k, 0]} material={body} castShadow />
        {/* J1 모터 */}
        <mesh position={[-0.16 * k, 0.2 * k, 0]} material={dark} castShadow>
          <cylinderGeometry args={[0.06 * k, 0.06 * k, 0.24 * k, 24]} />
        </mesh>
        <mesh position={[-0.16 * k, 0.33 * k, 0]} material={M.darkSteel()}>
          <cylinderGeometry args={[0.04 * k, 0.06 * k, 0.03 * k, 24]} />
        </mesh>
        <mesh position={[0.06 * k, 0.24 * k, 0.181 * k]} userData={{ keepMaterial: true }}>
          <planeGeometry args={[0.2 * k, 0.075 * k]} />
          <meshStandardMaterial map={nameTex} roughness={0.4} />
        </mesh>

        {/* J2 하완 */}
        <group ref={(g) => { j.current[1] = g; }} position={[0.08 * k, 0.36 * k, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={body} castShadow>
            <cylinderGeometry args={[0.13 * k, 0.13 * k, 0.34 * k, 36]} />
          </mesh>
          <mesh position={[0, 0, 0.21 * k]} rotation={[Math.PI / 2, 0, 0]} material={dark} castShadow>
            <cylinderGeometry args={[0.08 * k, 0.08 * k, 0.12 * k, 28]} />
          </mesh>
          <RoundedBox args={[0.18 * k, a2, 0.2 * k]} radius={0.04 * k} smoothness={3} position={[0, a2 / 2, 0.02 * k]} material={body} castShadow />
          {/* 케이블 */}
          <mesh position={[-0.11 * k, a2 / 2, -0.06 * k]} material={M.rubber()} castShadow>
            <cylinderGeometry args={[0.022 * k, 0.022 * k, a2 * 0.9, 12]} />
          </mesh>

          {/* J3 상완 */}
          <group ref={(g) => { j.current[2] = g; }} position={[0, a2, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={body} castShadow>
              <cylinderGeometry args={[0.11 * k, 0.11 * k, 0.3 * k, 36]} />
            </mesh>
            <RoundedBox args={[0.3 * k, 0.22 * k, 0.24 * k]} radius={0.05 * k} smoothness={3} position={[0.02 * k, 0.1 * k, 0]} material={body} castShadow />
            <mesh position={[-0.17 * k, 0.12 * k, 0]} rotation={[0, 0, Math.PI / 2]} material={dark} castShadow>
              <cylinderGeometry args={[0.065 * k, 0.065 * k, 0.16 * k, 24]} />
            </mesh>
            <mesh position={[0.25 * k, 0.12 * k, 0]} rotation={[0, 0, Math.PI / 2]} material={body} castShadow>
              <cylinderGeometry args={[0.085 * k, 0.1 * k, 0.24 * k, 32]} />
            </mesh>

            {/* J4 손목 회전 */}
            <group ref={(g) => { j.current[3] = g; }} position={[0.37 * k, 0.12 * k, 0]}>
              <mesh position={[(a3 - 0.37 * k) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={body} castShadow>
                <cylinderGeometry args={[0.065 * k, 0.08 * k, a3 - 0.37 * k, 32]} />
              </mesh>

              {/* J5 손목 굽힘 */}
              <group ref={(g) => { j.current[4] = g; }} position={[a3 - 0.37 * k + 0.02 * k, 0, 0]}>
                {[-1, 1].map((s) => (
                  <mesh key={s} position={[0, 0, s * 0.055 * k]} rotation={[Math.PI / 2, 0, 0]} material={body} castShadow>
                    <cylinderGeometry args={[0.06 * k, 0.06 * k, 0.03 * k, 28]} />
                  </mesh>
                ))}
                <mesh rotation={[Math.PI / 2, 0, 0]} material={dark} castShadow>
                  <cylinderGeometry args={[0.05 * k, 0.05 * k, 0.09 * k, 28]} />
                </mesh>

                {/* J6 플랜지 + 그리퍼 */}
                <group ref={(g) => { j.current[5] = g; }} position={[0.08 * k, 0, 0]}>
                  <mesh rotation={[0, 0, Math.PI / 2]} material={M.darkSteel()} castShadow>
                    <cylinderGeometry args={[0.045 * k, 0.045 * k, 0.03 * k, 28]} />
                  </mesh>
                  <mesh position={[0.04 * k, 0, 0]} material={M.aluminum()} castShadow>
                    <boxGeometry args={[0.05 * k, 0.08 * k, 0.16 * k]} />
                  </mesh>
                  {[0, 1].map((i) => (
                    <group key={i} ref={(g) => { fingers.current[i] = g; }} position={[0.1 * k, 0, (i ? -1 : 1) * 0.05 * k]}>
                      <mesh material={M.darkSteel()} castShadow>
                        <boxGeometry args={[0.09 * k, 0.04 * k, 0.014 * k]} />
                      </mesh>
                    </group>
                  ))}
                  <mesh ref={payload} position={[0.13 * k, 0, 0]} material={boxMat} castShadow>
                    <boxGeometry args={[0.1 * k, 0.12 * k, 0.09 * k]} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
