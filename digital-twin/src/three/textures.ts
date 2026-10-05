import * as THREE from 'three';

// 절차적(Procedural) 텍스처 — 외부 에셋/네트워크 없이 실사 질감을 생성

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const cache = new Map<string, THREE.Texture>();
function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

function toTex(c: HTMLCanvasElement, srgb: boolean, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** 에폭시 코팅 콘크리트 바닥 (색상 + 거칠기) */
export function concreteTextures() {
  return cached('concrete', () => {
    const S = 1024;
    const [c, g] = canvas(S, S);
    const r = rand(7);
    g.fillStyle = '#8b8f94';
    g.fillRect(0, 0, S, S);
    // 미세 입자
    const img = g.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 18;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n + 1;
    }
    g.putImageData(img, 0, 0);
    // 얼룩
    for (let i = 0; i < 90; i++) {
      const x = r() * S, y = r() * S, rad = 20 + r() * 140;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const a = 0.03 + r() * 0.06;
      grd.addColorStop(0, r() > 0.5 ? `rgba(40,42,46,${a})` : `rgba(200,204,210,${a})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // 신축 줄눈 (4m 그리드 → 텍스처 한 장 = 4m)
    g.strokeStyle = 'rgba(40,40,44,0.55)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, S - 3, S - 3);
    // 타이어 자국
    g.strokeStyle = 'rgba(30,30,30,0.05)';
    g.lineWidth = 26;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      const y = r() * S;
      g.moveTo(0, y);
      g.bezierCurveTo(S * 0.3, y + (r() - 0.5) * 200, S * 0.6, y + (r() - 0.5) * 200, S, y + (r() - 0.5) * 80);
      g.stroke();
    }
    const map = toTex(c, true);

    const [rc, rg] = canvas(512, 512);
    const rr = rand(11);
    rg.fillStyle = '#7a7a7a';
    rg.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) {
      const x = rr() * 512, y = rr() * 512, rad = 8 + rr() * 60;
      const grd = rg.createRadialGradient(x, y, 0, x, y, rad);
      const v = Math.floor(70 + rr() * 120);
      grd.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      rg.fillStyle = grd;
      rg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const rough = toTex(rc, false);
    return Object.assign(map, { userData: { rough } });
  });
}

/** 헤어라인 브러시드 금속 (거칠기 맵) */
export function brushedTexture() {
  return cached('brushed', () => {
    const [c, g] = canvas(512, 512);
    const r = rand(3);
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      const y = r() * 512;
      const v = Math.floor(90 + r() * 90);
      g.strokeStyle = `rgba(${v},${v},${v},${0.15 + r() * 0.25})`;
      g.lineWidth = r() * 1.4;
      g.beginPath();
      const x = r() * 512;
      g.moveTo(x - 200, y);
      g.lineTo(x + 200 + r() * 200, y + (r() - 0.5) * 2);
      g.stroke();
    }
    return toTex(c, false, 2);
  });
}

/** 도장면의 미세한 오렌지필 / 오염 (거칠기 맵) */
export function paintRoughness() {
  return cached('paint', () => {
    const [c, g] = canvas(256, 256);
    const r = rand(5);
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 95 + r() * 40;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return toTex(c, false, 3);
  });
}

/** 컨베이어 벨트 (사선 그립 패턴) */
export function beltTexture(color: string) {
  return cached('belt' + color, () => {
    const [c, g] = canvas(256, 128);
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 3;
    for (let x = -128; x < 256 + 128; x += 12) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 40, 128);
      g.stroke();
    }
    const r = rand(9);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.15})`;
      g.fillRect(r() * 256, r() * 128, 2, 2);
    }
    const t = toTex(c, true);
    return t;
  });
}

/** 골판지 박스 */
export function cardboardTexture() {
  return cached('cardboard', () => {
    const [c, g] = canvas(256, 256);
    const grd = g.createLinearGradient(0, 0, 256, 256);
    grd.addColorStop(0, '#c49a62');
    grd.addColorStop(1, '#b3874f');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const r = rand(13);
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = `rgba(90,60,30,${r() * 0.12})`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1);
    }
    g.fillStyle = 'rgba(210,190,150,0.85)';
    g.fillRect(112, 0, 32, 256); // 테이프
    g.fillStyle = 'rgba(40,40,40,0.7)';
    g.font = 'bold 22px sans-serif';
    g.fillText('▲▲', 24, 52);
    g.font = '14px monospace';
    g.fillText('LOT 24-A', 160, 230);
    return toTex(c, true);
  });
}

/** 노랑/검정 안전 사선 */
export function hazardTexture() {
  return cached('hazard', () => {
    const [c, g] = canvas(128, 32);
    g.fillStyle = '#facc15';
    g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#111';
    for (let x = -32; x < 160; x += 32) {
      g.beginPath();
      g.moveTo(x, 32);
      g.lineTo(x + 16, 32);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 16, 0);
      g.fill();
    }
    return toTex(c, true);
  });
}

/** 샌드위치 패널 벽 (세로 리브) */
export function wallPanelTexture() {
  return cached('wall', () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#c9ced4';
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) {
      const grd = g.createLinearGradient(x, 0, x + 32, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0.12)');
      grd.addColorStop(0.15, 'rgba(255,255,255,0.12)');
      grd.addColorStop(0.5, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.06)');
      g.fillStyle = grd;
      g.fillRect(x, 0, 32, 256);
    }
    return toTex(c, true);
  });
}

/** 철망 펜스 알파맵 */
export function meshAlpha() {
  return cached('mesh', () => {
    const [c, g] = canvas(64, 64);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    for (let i = 0; i <= 64; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 64);
      g.moveTo(0, i);
      g.lineTo(64, i);
      g.stroke();
    }
    return toTex(c, false);
  });
}

/** 배관 유동 화살표 */
export function flowTexture() {
  return cached('flow', () => {
    const [c, g] = canvas(128, 32);
    g.clearRect(0, 0, 128, 32);
    g.fillStyle = '#ffffff';
    for (let x = 0; x < 128; x += 64) {
      g.beginPath();
      g.moveTo(x + 10, 6);
      g.lineTo(x + 34, 16);
      g.lineTo(x + 10, 26);
      g.lineTo(x + 18, 16);
      g.fill();
    }
    const t = toTex(c, false);
    return t;
  });
}

/** 텍스트 라벨 (명판 등) — 폰트 다운로드 없이 캔버스로 렌더 */
export function labelTexture(text: string, opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string } = {}) {
  const key = `label|${text}|${JSON.stringify(opts)}`;
  return cached(key, () => {
    const w = opts.w ?? 256, h = opts.h ?? 64;
    const [c, g] = canvas(w, h);
    g.fillStyle = opts.bg ?? '#1e293b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = opts.fg ?? '#f8fafc';
    g.font = opts.font ?? `bold ${Math.floor(h * 0.5)}px "Segoe UI", "Malgun Gothic", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1);
    const t = toTex(c, true);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** 갱신 가능한 캔버스 텍스처 (HMI 화면 등) */
export function dynamicCanvas(w: number, h: number) {
  const [c, g] = canvas(w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas: c, ctx: g, tex };
}
