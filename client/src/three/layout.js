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
const TABLE_Z0 = -4.0; // 第一列中心 z

export const NEWSET_ID = '__newset__';
export const NEWSET_W = 2.6;
export const NEWSET_D = 1.3;

// 牌架(單一斜板,多排沿斜面往上堆)
export const RACK_LEAN = 0.9; // 後仰角(rad,自直立起算)
export const RACK_COLS = 11; // 預設每排格數(直向螢幕用較少,見 rackParams)
export const RACK_SLOT_X = 0.86;
export const RACK_ROW_PITCH = 1.18; // 排距(沿斜面)
export const RACK_FOOT_Z = 4.94; // 牌底邊落點 z
export const RACK_SHELF_Y = 0.12; // 架面高度

/** 牌架尺寸(cols=每排格數;cx=架中心 x,桌機左移避開聊天室) */
export function rackParams(cols = RACK_COLS, cx = -0.8) {
  const w = (cols - 1) * RACK_SLOT_X + TILE_W + 0.8;
  return { cols, cx, w, x0: cx - w / 2 + 0.4 + TILE_W / 2 };
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
  const x = rack.x0 + col * RACK_SLOT_X;
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
  const rack = rackParams(opts.rackCols, opts.rackCx);
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

  const rows = [];
  let row = [];
  let rowW = 0;
  for (const e of entries) {
    const need = rowW === 0 ? e.w : rowW + SET_GAP + e.w;
    if (rowW > 0 && need > usableW) {
      rows.push({ items: row, w: rowW });
      row = [e];
      rowW = e.w;
    } else {
      row.push(e);
      rowW = need;
    }
  }
  if (row.length) rows.push({ items: row, w: rowW });

  rows.forEach((r, ri) => {
    let x = -r.w / 2;
    const z = TABLE_Z0 + ri * ROW_PITCH;
    for (const e of r.items) {
      sets.set(e.id, {
        x: x + e.w / 2,
        z,
        w: e.w,
        d: e.id === NEWSET_ID ? NEWSET_D : TILE_H + SET_PAD * 2,
        valid: e.valid,
      });
      e.ordered.forEach((t, i) => {
        tiles.set(t.id, {
          pos: [x + SET_PAD + TILE_W / 2 + i * (TILE_W + TILE_GAP), TILE_T / 2, z],
          rot: TABLE_TILE_ROT,
          zone: 'table',
          setId: e.id,
        });
      });
      x += e.w + SET_GAP;
    }
  });

  // --- 牌架 ---
  (hand ?? []).forEach((t, i) => {
    tiles.set(t.id, rackSlotTransform(i, rack));
  });

  return { tiles, sets, rack };
}

// ---------- 放下判定(以地面 y=0 的命中點為準) ----------

export const RACK_ZONE_Z = 3.15; // 超過此 z 視為牌架區
const RACK_ROW_SPLIT_Z = 4.05; // 前後排分界

/**
 * 依地面命中點回傳拖放目標,形狀與 dnd-kit droppable data 相同:
 * { type:'handpos', index } | { type:'set', setId } | { type:'newset' }
 */
export function hitTarget(p, layout, handLength) {
  const rack = layout.rack ?? rackParams();
  if (p.z > RACK_ZONE_Z) {
    const row = p.z < RACK_ROW_SPLIT_Z ? 1 : 0;
    const col = Math.max(0, Math.min(rack.cols - 1, Math.round((p.x - rack.x0) / RACK_SLOT_X)));
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
