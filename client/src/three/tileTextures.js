// 3D 用程序化貼圖與共用材質(全域快取,53 種牌面 + 毛氈/木紋)
import * as THREE from 'three';

export const TILE_COLORS = {
  red: '#d64541',
  blue: '#2e6db4',
  orange: '#e8930c',
  black: '#2b2b2b',
  joker: '#b0338f',
};

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- 牌面(數字/鬼牌) ----------

const faceMaterials = new Map();

function makeFaceTexture(colorKey, num) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 358;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#fdf9ec');
  g.addColorStop(1, '#eee6cf');
  ctx.fillStyle = g;
  roundRectPath(ctx, 0, 0, 256, 358, 30);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 100, 60, 0.28)';
  ctx.lineWidth = 4;
  roundRectPath(ctx, 3, 3, 250, 352, 27);
  ctx.stroke();

  const color = TILE_COLORS[colorKey];
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (colorKey === 'joker') {
    ctx.font = '900 170px "Segoe UI", "Microsoft JhengHei", sans-serif';
    ctx.fillText('☺', 128, 138);
  } else {
    ctx.font = '900 148px "Segoe UI", "Microsoft JhengHei", sans-serif';
    ctx.fillText(String(num), 128, 132);
  }
  // 底部小徽記圓環
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(128, 286, 27, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  return canvasTexture(c);
}

/** 取得該牌的牌面材質(同種牌共用) */
export function faceMaterial(tile) {
  const key = tile.isJoker ? 'joker' : `${tile.color}-${tile.num}`;
  let m = faceMaterials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: makeFaceTexture(tile.isJoker ? 'joker' : tile.color, tile.num),
      transparent: true,
      roughness: 0.35,
    });
    faceMaterials.set(key, m);
  }
  return m;
}

// ---------- 牌身(象牙白,全牌共用) ----------

let _bodyMaterial = null;
export function tileBodyMaterial() {
  if (!_bodyMaterial) {
    _bodyMaterial = new THREE.MeshStandardMaterial({ color: '#f3ecd8', roughness: 0.4 });
  }
  return _bodyMaterial;
}

// ---------- 毛氈 ----------

let _feltTexture = null;
export function feltTexture() {
  if (_feltTexture) return _feltTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1d6b47';
  ctx.fillRect(0, 0, 512, 512);
  // 噪點模擬絨布
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }
  _feltTexture = canvasTexture(c);
  _feltTexture.wrapS = _feltTexture.wrapT = THREE.RepeatWrapping;
  _feltTexture.repeat.set(3, 3);
  return _feltTexture;
}

// ---------- 木紋 ----------

let _woodTexture = null;
export function woodTexture() {
  if (_woodTexture) return _woodTexture;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#835633');
  g.addColorStop(0.5, '#7a4f2b');
  g.addColorStop(1, '#6d4423');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  // 橫向木紋條
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * 256;
    ctx.strokeStyle = `rgba(40, 22, 8, ${0.08 + Math.random() * 0.12})`;
    ctx.lineWidth = 1 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 64) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 4 + (Math.random() - 0.5) * 5);
    }
    ctx.stroke();
  }
  _woodTexture = canvasTexture(c);
  _woodTexture.wrapS = _woodTexture.wrapT = THREE.RepeatWrapping;
  return _woodTexture;
}

let _woodMaterial = null;
export function woodMaterial() {
  if (!_woodMaterial) {
    _woodMaterial = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.65 });
  }
  return _woodMaterial;
}

// ---------- 「建立新牌組」提示板 ----------

let _newSetTexture = null;
export function newSetTexture() {
  if (_newSetTexture) return _newSetTexture;
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 320;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 6;
  ctx.setLineDash([22, 14]);
  roundRectPath(ctx, 8, 8, 624, 304, 28);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 44px "Segoe UI", "Microsoft JhengHei", sans-serif';
  ctx.fillText('＋ 拖曳到這裡建立新牌組', 320, 160);
  _newSetTexture = canvasTexture(c);
  return _newSetTexture;
}
