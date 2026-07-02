// Rummikub 牌組驗證與計分(前後端共用,純函式)
// 磚格式: { id, color: 'red'|'blue'|'orange'|'black', num: 1-13, isJoker: bool }

export const COLORS = ['red', 'blue', 'orange', 'black'];
export const JOKER_PENALTY = 30;
export const INITIAL_MELD_MIN = 30;
export const MIN_SET_SIZE = 3;

/** 驗證群組:同數字、不同色、3-4 張,鬼牌可補 */
export function isValidGroup(tiles) {
  if (tiles.length < 3 || tiles.length > 4) return false;
  const nonJokers = tiles.filter((t) => !t.isJoker);
  if (nonJokers.length === 0) return false;
  const num = nonJokers[0].num;
  if (!nonJokers.every((t) => t.num === num)) return false;
  const colors = new Set(nonJokers.map((t) => t.color));
  return colors.size === nonJokers.length; // 顏色不重複,鬼牌必有空色可補
}

/**
 * 驗證順子:同色、連號、>=3 張,鬼牌可補洞或接頭尾。
 * 回傳 null(不合法)或 { min, max, sum }(sum 取對玩家最有利的最大值)。
 */
export function analyzeRun(tiles) {
  if (tiles.length < MIN_SET_SIZE) return null;
  const nonJokers = tiles.filter((t) => !t.isJoker);
  const jokerCount = tiles.length - nonJokers.length;
  if (nonJokers.length === 0) return null;
  const color = nonJokers[0].color;
  if (!nonJokers.every((t) => t.color === color)) return null;
  const nums = nonJokers.map((t) => t.num).sort((a, b) => a - b);
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === nums[i - 1]) return null; // 同色同號不能在同一順子
  }
  const min = nums[0];
  const max = nums[nums.length - 1];
  let gaps = 0;
  for (let i = 1; i < nums.length; i++) gaps += nums[i] - nums[i - 1] - 1;
  let spare = jokerCount - gaps;
  if (spare < 0) return null;
  // 剩餘鬼牌需接在頭尾且不超出 1..13
  if (min - 1 + (13 - max) < spare) return null;
  // 對玩家最有利:剩餘鬼牌優先接高位
  const above = Math.min(spare, 13 - max);
  const below = spare - above;
  const start = min - below;
  const end = max + above;
  const sum = ((start + end) * (end - start + 1)) / 2;
  return { min: start, max: end, sum };
}

export function isValidRun(tiles) {
  return analyzeRun(tiles) !== null;
}

export function isValidSet(tiles) {
  return isValidGroup(tiles) || isValidRun(tiles);
}

/** 牌組點數(鬼牌以代表值計;取最大可能值) */
export function setScore(tiles) {
  if (isValidGroup(tiles)) {
    const num = tiles.find((t) => !t.isJoker).num;
    return num * tiles.length;
  }
  const run = analyzeRun(tiles);
  if (run) return run.sum;
  return 0;
}

/** 整桌是否合法(每組皆為合法群組或順子) */
export function validateTable(sets) {
  return sets.every((set) => set.tiles.length > 0 && isValidSet(set.tiles));
}

/** 手牌剩餘罰分(鬼牌 30) */
export function rackPenalty(tiles) {
  return tiles.reduce((s, t) => s + (t.isJoker ? JOKER_PENALTY : t.num), 0);
}

/** 順子顯示排序:非鬼牌照號碼排,鬼牌插入其代表位置 */
export function sortRunForDisplay(tiles) {
  const run = analyzeRun(tiles);
  if (!run) return tiles;
  const nonJokers = [...tiles.filter((t) => !t.isJoker)].sort((a, b) => a.num - b.num);
  const jokers = tiles.filter((t) => t.isJoker);
  const result = [];
  let ji = 0;
  for (let v = run.min; v <= run.max; v++) {
    const idx = nonJokers.findIndex((t) => t.num === v);
    if (idx >= 0) result.push(nonJokers.splice(idx, 1)[0]);
    else if (ji < jokers.length) result.push(jokers[ji++]);
  }
  while (ji < jokers.length) result.push(jokers[ji++]);
  return result;
}
