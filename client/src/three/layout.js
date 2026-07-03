// 3D 佈局純函式:把 game.table 與 hand 映射成世界座標(模擬原本 CSS flex-wrap)
import { isValidRun, isValidSet, sortRunForDisplay } from '../../../shared/validator.js';

// 牌尺寸(世界單位)
export const TILE_W = 0.8;
export const TILE_H = 1.12;
export const TILE_T = 0.2;

// 桌面
export const TABLE_W = 14; // 毛氈總寬
export const TABLE_D = 11.6; // 毛氈總深
const TABLE_USABLE_W = 11.6; // 牌組排版可用寬度
const TILE_GAP = 0.08; // 組內牌距
const SET_PAD = 0.16; // 組底板留邊
const SET_GAP = 0.55; // 組間距
const ROW_PITCH = TILE_H + 2 * SET_PAD + 0.42;
const MIN_ROW_PITCH = TILE_H + 2 * SET_PAD + 0.14; // 壓縮列距下限(牌組深度+小縫)
const TABLE_Z0 = -4.6; // 第一列中心 z
const TABLE_MAX_Z = 4.0; // 最後一列中心 z 上限(牌架已移出桌面,可用到毛氈前緣)
const MIN_TABLE_SCALE = 0.6; // 牌組過多時整體縮小的下限

export const NEWSET_ID = '__newset__';
export const NEWSET_W = 2.6;
export const NEWSET_D = 1.3;

// 牌架(單一斜板,多排沿斜面往上堆)
export const RACK_LEAN = 0.9; // 後仰角(rad,自直立起算)
export const RACK_COLS = 11; // 預設每排格數(直向螢幕用較少,見 rackParams)
export const RACK_SLOT_X = 0.86;
export const RACK_ROW_PITCH = 1.18; // 排距(沿斜面)
export const RACK_FOOT_Z = 7.95; // 牌底邊落點 z(底座在木框 6.35 之外,斜板上緣不越過毛氈邊 5.8)
export const RACK_SHELF_Y = 0.12; // 架面高度

/**
 * 牌架尺寸(cols=基本每排格數;cx=架中心 x,桌機左移避開聊天室)。
 * 固定最多 2 排:手牌超過 2 排容量時先加寬欄數(最多 +3 欄),
 * 再超過就壓縮牌距讓牌微重疊,牌架高度永遠不變(避免長高擋住桌面)。
 */
export function rackParams(baseCols = RACK_COLS, cx = -0.8, handCount = 0) {
  const maxCols = baseCols + 3;
  const cols = Math.max(baseCols, Math.ceil(handCount / 2));
  if (cols <= maxCols) {
    const w = (cols - 1) * RACK_SLOT_X + TILE_W + 0.8;
    return { cols, cx, w, slotX: RACK_SLOT_X, x0: cx - w / 2 + 0.4 + TILE_W / 2 };
  }
  const w = (maxCols - 1) * RACK_SLOT_X + TILE_W + 0.8;
  const slotX = ((maxCols - 1) * RACK_SLOT_X) / (cols - 1);
  return { cols, cx, w, slotX, x0: cx - w / 2 + 0.4 + TILE_W / 2 };
}

// 牌堆(抽牌飛入起點)
export const DECK_POS = [-6.2, TILE_T / 2, -2.4];

export const TABLE_TILE_ROT = [-Math.PI / 2, 0, 0]; // 平躺面朝上
export const RACK_TILE_ROT = [-RACK_LEAN, 0, 0]; // 斜立面朝相機

/** 手牌第 index 格的世界座標(排數沿斜面往上疊) */
export function rackSlotTransform(index, rack = rackParams()) {
  const row = Math.floor(index / rack.cols);
  const col = index % rack.cols;
  const along = TILE_H / 2 + row * RACK_ROW_PITCH; // 沿斜面距底邊的距離
  const x = rack.x0 + col * (rack.slotX ?? RACK_SLOT_X);
  const y = RACK_SHELF_Y + along * Math.cos(RACK_LEAN);
  const z = RACK_FOOT_Z - along * Math.sin(RACK_LEAN);
  return { pos: [x, y, z], rot: RACK_TILE_ROT, zone: 'rack' };
}

/**
 * 計算全部牌與牌組底板的位置。
 * 回傳 { tiles: Map<tileId, {pos, rot, zone}>, sets: Map<setId, {x, z, w, d, valid}> }
 * sets 內含 NEWSET_ID 佔位(建新組提示板/放下判定用)。
 */
export function computeLayout(table, hand, opts = {}) {
  const rack = rackParams(opts.rackCols, opts.rackCx, (hand ?? []).length);
  const usableW = opts.tableUsableW ?? TABLE_USABLE_W;
  const tiles = new Map();
  const sets = new Map();

  // --- 桌面:先算每組寬度,再 flex-wrap 分列、逐列置中 ---
  const entries = (table ?? []).map((s) => ({
    id: s.id,
    ordered: isValidRun(s.tiles) ? sortRunForDisplay(s.tiles) : s.tiles,
    w: s.tiles.length * TILE_W + (s.tiles.length - 1) * TILE_GAP + SET_PAD * 2,
    valid: isValidSet(s.tiles),
  }));
  entries.push({ id: NEWSET_ID, ordered: [], w: NEWSET_W, valid: true });

  // 依縮放比例 flex-wrap 分列(縮小模式時放寬可用寬度,毛氈還有餘裕)
  const wrap = (s) => {
    const limit = s < 1 ? usableW + 1.0 : usableW;
    const rows = [];
    let row = [];
    let rowW = 0;
    for (const e of entries) {
      const ew = e.w * s;
      const need = rowW === 0 ? ew : rowW + SET_GAP * s + ew;
      if (rowW > 0 && need > limit) {
        rows.push({ items: row, w: rowW });
        row = [e];
        rowW = ew;
      } else {
        row.push(e);
        rowW = need;
      }
    }
    if (row.length) rows.push({ items: row, w: rowW });
    return rows;
  };

  // 列數過多時不往牌架方向長:先壓縮列距,仍放不下就整體縮小重排(下限 0.7)
  let scale = 1;
  let rows = wrap(scale);
  let pitch = ROW_PITCH;
  for (;;) {
    if (TABLE_Z0 + (rows.length - 1) * ROW_PITCH * scale <= TABLE_MAX_Z) {
      pitch = ROW_PITCH * scale;
      break;
    }
    const needed = (TABLE_MAX_Z - TABLE_Z0) / (rows.length - 1);
    if (needed >= MIN_ROW_PITCH * scale) {
      pitch = needed;
      break;
    }
    if (scale <= MIN_TABLE_SCALE) {
      pitch = MIN_ROW_PITCH * scale; // 極端情況:接受最後一列略超線
      break;
    }
    scale = Math.max(MIN_TABLE_SCALE, scale - 0.05);
    rows = wrap(scale);
  }

  rows.forEach((r, ri) => {
    let x = -r.w / 2;
    const z = TABLE_Z0 + ri * pitch;
    for (const e of r.items) {
      const ew = e.w * scale;
      sets.set(e.id, {
        x: x + ew / 2,
        z,
        w: ew,
        d: (e.id === NEWSET_ID ? NEWSET_D : TILE_H + SET_PAD * 2) * scale,
        valid: e.valid,
      });
      e.ordered.forEach((t, i) => {
        tiles.set(t.id, {
          pos: [x + (SET_PAD + TILE_W / 2 + i * (TILE_W + TILE_GAP)) * scale, (TILE_T / 2) * scale, z],
          rot: TABLE_TILE_ROT,
          zone: 'table',
          setId: e.id,
          scale,
        });
      });
      x += ew + SET_GAP * scale;
    }
  });

  // --- 牌架 ---
  (hand ?? []).forEach((t, i) => {
    tiles.set(t.id, rackSlotTransform(i, rack));
  });

  return { tiles, sets, rack };
}

/**
 * 游標懸停的手牌 index(牌重疊時上浮用)。
 * p 需為游標射線與「牌架斜面(過牌中心)」的交點;不在任何牌上回傳 -1。
 */
export function rackHoverIndex(p, layout, handLength) {
  const rack = layout?.rack ?? rackParams();
  const cosL = Math.cos(RACK_LEAN);
  const sinL = Math.sin(RACK_LEAN);
  // 沿斜面距底邊的距離 → 排
  const along = (p.y - RACK_SHELF_Y) * cosL - (p.z - RACK_FOOT_Z) * sinL;
  const row = Math.round((along - TILE_H / 2) / RACK_ROW_PITCH);
  if (row < 0 || row > 1) return -1;
  if (Math.abs(along - (TILE_H / 2 + row * RACK_ROW_PITCH)) > TILE_H / 2) return -1;
  const slotX = rack.slotX ?? RACK_SLOT_X;
  const col = Math.round((p.x - rack.x0) / slotX);
  if (col < 0 || col >= rack.cols) return -1;
  if (Math.abs(p.x - (rack.x0 + col * slotX)) > Math.min(slotX, TILE_W) / 2 + 0.03) return -1;
  const idx = row * rack.cols + col;
  return idx < handLength ? idx : -1;
}

// ---------- 放下判定(以地面 y=0 的命中點為準) ----------

export const RACK_ZONE_Z = 5.4; // 超過此 z 視為牌架區
const RACK_ROW_SPLIT_Z = 6.6; // 前後排分界

/**
 * 依地面命中點回傳拖放目標,形狀與 dnd-kit droppable data 相同:
 * { type:'handpos', index } | { type:'set', setId } | { type:'newset' }
 */
export function hitTarget(p, layout, handLength) {
  const rack = layout.rack ?? rackParams();
  if (p.z > RACK_ZONE_Z) {
    const row = p.z < RACK_ROW_SPLIT_Z ? 1 : 0;
    const col = Math.max(0, Math.min(rack.cols - 1, Math.round((p.x - rack.x0) / (rack.slotX ?? RACK_SLOT_X))));
    return { type: 'handpos', index: Math.min(handLength, row * rack.cols + col) };
  }
  for (const [id, r] of layout.sets) {
    if (id === NEWSET_ID) continue;
    if (Math.abs(p.x - r.x) <= r.w / 2 + 0.25 && Math.abs(p.z - r.z) <= r.d / 2 + 0.25) {
      return { type: 'set', setId: id };
    }
  }
  return { type: 'newset' }; // 桌面空白處(含虛線提示板)一律建新組
}
