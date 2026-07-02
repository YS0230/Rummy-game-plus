import { COLORS } from '../../../shared/validator.js';

/** 產生 106 張磚:1-13 × 4 色 × 2 副 + 2 鬼牌 */
export function createTiles() {
  const tiles = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const color of COLORS) {
      for (let num = 1; num <= 13; num++) {
        tiles.push({ id: `${color}-${num}-${copy}`, color, num, isJoker: false });
      }
    }
  }
  tiles.push({ id: 'joker-0', color: 'red', num: 0, isJoker: true });
  tiles.push({ id: 'joker-1', color: 'black', num: 0, isJoker: true });
  return tiles;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
