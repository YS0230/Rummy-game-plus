// Rummikub 出牌求解器(前後端共用,純函式)。
// 非最優解但保證正確:回傳結果必通過 Game.applyLayout 守恆檢查與 endTurn 驗證
// (含首攤 >= 30 點規則);算不出可出的牌時回傳 null,由呼叫端抽牌。
import {
  isValidSet,
  setScore,
  validateTable,
  analyzeRun,
  COLORS,
  INITIAL_MELD_MIN,
} from './validator.js';

const kindKey = (t) => `${t.color}-${t.num}`;

/** 把手牌歸約成 kind(色+號)-> 實體磚池,鬼牌另列 */
function buildPools(tiles) {
  const kinds = new Map(); // key -> [tile, tile](同色同號最多 2 張)
  const jokers = [];
  for (const t of tiles) {
    if (t.isJoker) jokers.push(t);
    else {
      if (!kinds.has(kindKey(t))) kinds.set(kindKey(t), []);
      kinds.get(kindKey(t)).push(t);
    }
  }
  return { kinds, jokers };
}

/** 枚舉所有可由手牌組成的候選牌組(以 kind 表示,去重) */
function enumerateCandidates(kinds, jokerCount) {
  const out = [];
  const dedupe = new Set();
  const push = (needKeys, jokerNeed) => {
    const sorted = [...needKeys].sort();
    const key = `${sorted.join(',')}|${jokerNeed}`;
    if (dedupe.has(key)) return;
    dedupe.add(key);
    // 分數用與伺服器完全相同的 setScore(以代表磚計算)
    const pseudo = sorted.map((k) => {
      const [color, num] = [k.slice(0, k.lastIndexOf('-')), Number(k.slice(k.lastIndexOf('-') + 1))];
      return { color, num, isJoker: false };
    });
    for (let i = 0; i < jokerNeed; i++) pseudo.push({ isJoker: true, num: 0, color: 'red' });
    if (!isValidSet(pseudo)) return;
    out.push({ needs: sorted, jokerNeed, score: setScore(pseudo), size: sorted.length + jokerNeed });
  };

  // 群組:同號異色 3-4 張,鬼牌可補
  for (let num = 1; num <= 13; num++) {
    const present = COLORS.filter((c) => kinds.has(`${c}-${num}`));
    const n = present.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const pick = present.filter((_, i) => mask & (1 << i));
      for (let j = 0; j <= jokerCount; j++) {
        const total = pick.length + j;
        if (total >= 3 && total <= 4) push(pick.map((c) => `${c}-${num}`), j);
      }
    }
  }
  // 順子:同色連號 >= 3 張,鬼牌補洞或接頭尾(視窗內缺格以鬼牌計)
  for (const color of COLORS) {
    const has = new Set();
    for (let v = 1; v <= 13; v++) if (kinds.has(`${color}-${v}`)) has.add(v);
    for (let s = 1; s <= 11; s++) {
      for (let e = s + 2; e <= 13; e++) {
        const needKeys = [];
        let missing = 0;
        for (let v = s; v <= e; v++) {
          if (has.has(v)) needKeys.push(`${color}-${v}`);
          else missing++;
        }
        if (missing > jokerCount) continue;
        if (needKeys.length === 0) continue;
        push(needKeys, missing);
      }
    }
  }
  // 無鬼牌優先、高分優先:DFS 先走高價值分支,時間截斷時保底品質較好
  out.sort((a, b) => a.jokerNeed - b.jokerNeed || b.score - a.score);
  return out;
}

/**
 * 只用手牌找「互斥牌組」的最佳組合(最大化用牌數,同數比分數)。
 * minScore > 0(首攤)時只接受總分達標的解。
 * 回傳 { melds: [[tile]], score, tilesUsed } 或 null。
 */
export function searchRackMelds(tiles, { minScore = 0, timeBudgetMs = 50 } = {}) {
  const { kinds, jokers } = buildPools(tiles);
  if (kinds.size === 0 && jokers.length === 0) return null;
  const candidates = enumerateCandidates(kinds, jokers.length);
  if (candidates.length === 0) return null;

  const kindList = [...kinds.keys()];
  const kindIndex = new Map(kindList.map((k, i) => [k, i]));
  const kindNum = kindList.map((k) => Number(k.slice(k.lastIndexOf('-') + 1)));
  const counts = kindList.map((k) => kinds.get(k).length);
  // 每個候選改存 kind 索引,並建立 kind -> 候選 的反查表
  const cands = candidates.map((c) => ({ ...c, needIdx: c.needs.map((k) => kindIndex.get(k)) }));
  const candByKind = kindList.map(() => []);
  for (const c of cands) for (const i of c.needIdx) candByKind[i].push(c);

  let jokersLeft = jokers.length;
  let potential = counts.reduce((s, c, i) => s + c * kindNum[i], 0) + jokersLeft * 13;
  let used = 0;
  let score = 0;
  const chosen = [];
  let bestUsed = 0;
  let bestScore = minScore > 0 ? -1 : 0;
  let bestChosen = [];
  const seen = new Map();
  const deadline = Date.now() + timeBudgetMs;
  let nodes = 0;
  let stopped = false;

  const feasible = (c) =>
    c.jokerNeed <= jokersLeft && c.needIdx.every((i) => counts[i] > 0);

  const apply = (c) => {
    for (const i of c.needIdx) {
      counts[i]--;
      potential -= kindNum[i];
    }
    jokersLeft -= c.jokerNeed;
    potential -= c.jokerNeed * 13;
    used += c.size;
    score += c.score;
    chosen.push(c);
  };
  const undo = (c) => {
    for (const i of c.needIdx) {
      counts[i]++;
      potential += kindNum[i];
    }
    jokersLeft += c.jokerNeed;
    potential += c.jokerNeed * 13;
    used -= c.size;
    score -= c.score;
    chosen.pop();
  };

  const dfs = () => {
    if (stopped) return;
    nodes++;
    if ((nodes & 255) === 0 && Date.now() > deadline) {
      stopped = true;
      return;
    }
    if (score >= minScore && (used > bestUsed || (used === bestUsed && score > bestScore))) {
      bestUsed = used;
      bestScore = score;
      bestChosen = chosen.slice();
    }
    if (score + potential < minScore) return; // 首攤剪枝:剩牌全用也不夠 30
    const key = `${counts.join(',')}|${jokersLeft}|${used}`;
    const prev = seen.get(key);
    if (prev !== undefined && prev >= score) return;
    seen.set(key, score);

    let ki = -1;
    let feas = null;
    for (let i = 0; i < kindList.length; i++) {
      if (counts[i] === 0) continue;
      const f = candByKind[i].filter(feasible);
      if (f.length > 0) {
        ki = i;
        feas = f;
        break;
      }
    }
    if (ki === -1) return;
    for (const c of feas) {
      apply(c);
      dfs();
      undo(c);
      if (stopped) return;
    }
    // 跳過此 kind(留在手牌)
    const savedCount = counts[ki];
    counts[ki] = 0;
    potential -= savedCount * kindNum[ki];
    dfs();
    counts[ki] = savedCount;
    potential += savedCount * kindNum[ki];
  };
  dfs();

  if (bestUsed === 0 || bestChosen.length === 0) return null;
  if (minScore > 0 && bestScore < minScore) return null;

  // 由 kind 池取實體磚組成牌組
  const pools = new Map([...kinds].map(([k, arr]) => [k, [...arr]]));
  const jokerPool = [...jokers];
  const melds = bestChosen.map((c) => {
    const tilesOut = c.needs.map((k) => pools.get(k).pop());
    for (let i = 0; i < c.jokerNeed; i++) tilesOut.push(jokerPool.pop());
    return tilesOut;
  });
  return { melds, score: bestScore, tilesUsed: bestUsed };
}

const removeById = (arr, ids) => {
  const set = ids instanceof Set ? ids : new Set(ids);
  return arr.filter((t) => !set.has(t.id));
};

/** Pass 2:把剩餘手牌逐張接到任何牌組(桌面或本回合新組)上,直到無變化 */
function extendSets(sets, rackLeft) {
  let changed = true;
  while (changed) {
    changed = false;
    // 非鬼牌優先,避免鬼牌被浪費在可用普通磚的位置
    const ordered = [...rackLeft.filter((t) => !t.isJoker), ...rackLeft.filter((t) => t.isJoker)];
    for (const t of ordered) {
      for (const s of sets) {
        if (isValidSet([...s.tiles, t])) {
          s.tiles.push(t);
          rackLeft = removeById(rackLeft, [t.id]);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return rackLeft;
}

/** 純順子(無鬼牌)回傳排序後的磚,否則 null */
function pureRun(tiles) {
  if (tiles.some((t) => t.isJoker)) return null;
  if (!analyzeRun(tiles)) return null;
  return [...tiles].sort((a, b) => a.num - b.num);
}

/** Pass 3a:手牌 t 切入桌面純順子中段,拆成兩段各 >= 3 */
function trySplitInsert(sets, rackLeft, idGen) {
  for (const t of rackLeft) {
    if (t.isJoker) continue;
    for (const s of sets) {
      const run = pureRun(s.tiles);
      if (!run || run[0].color !== t.color) continue;
      const a = run[0].num;
      const b = run[run.length - 1].num;
      if (t.num - a < 2 || b - t.num < 2) continue;
      const left = [...run.filter((x) => x.num < t.num), t];
      const right = run.filter((x) => x.num >= t.num);
      if (!isValidSet(left) || !isValidSet(right)) continue;
      s.tiles = left;
      sets.push({ id: idGen(), tiles: right });
      return removeById(rackLeft, [t.id]);
    }
  }
  return null;
}

/** Pass 3b:手牌差一張的 pair,從桌面 4 張群組或長順子頭尾借一張湊成新組 */
function tryBorrowForPair(sets, rackLeft, idGen) {
  const nonJokers = rackLeft.filter((t) => !t.isJoker);
  const wants = []; // { a, b, num, color }
  for (let i = 0; i < nonJokers.length; i++) {
    for (let j = i + 1; j < nonJokers.length; j++) {
      const x = nonJokers[i];
      const y = nonJokers[j];
      if (x.num === y.num && x.color !== y.color) {
        for (const c of COLORS) {
          if (c !== x.color && c !== y.color) wants.push({ a: x, b: y, num: x.num, color: c });
        }
      } else if (x.color === y.color) {
        const [lo, hi] = x.num < y.num ? [x, y] : [y, x];
        if (hi.num - lo.num === 1) {
          if (lo.num - 1 >= 1) wants.push({ a: x, b: y, num: lo.num - 1, color: x.color });
          if (hi.num + 1 <= 13) wants.push({ a: x, b: y, num: hi.num + 1, color: x.color });
        } else if (hi.num - lo.num === 2) {
          wants.push({ a: x, b: y, num: lo.num + 1, color: x.color });
        }
      }
    }
  }
  for (const w of wants) {
    for (const s of sets) {
      if (s.tiles.some((t) => t.isJoker)) continue; // 不動用含鬼牌的牌組
      let donorIdx = -1;
      if (s.tiles.length === 4 && s.tiles.every((t) => t.num === s.tiles[0].num)) {
        donorIdx = s.tiles.findIndex((t) => t.num === w.num && t.color === w.color);
      } else {
        const run = pureRun(s.tiles);
        if (run && run.length >= 4 && run[0].color === w.color) {
          const head = run[0];
          const tail = run[run.length - 1];
          if (head.num === w.num) donorIdx = s.tiles.findIndex((t) => t.id === head.id);
          else if (tail.num === w.num) donorIdx = s.tiles.findIndex((t) => t.id === tail.id);
        }
      }
      if (donorIdx === -1) continue;
      const donor = s.tiles[donorIdx];
      const remaining = s.tiles.filter((_, i) => i !== donorIdx);
      const newSet = [w.a, w.b, donor];
      if (!isValidSet(remaining) || !isValidSet(newSet)) continue;
      s.tiles = remaining;
      sets.push({ id: idGen(), tiles: newSet });
      return removeById(rackLeft, [w.a.id, w.b.id]);
    }
  }
  return null;
}

/** 最終自檢:整桌合法 + 守恆(桌面原磚全在、新增磚皆來自手牌、無重複)。回傳 placedIds 或 null */
function selfCheck(sets, originalTable, rack) {
  if (!validateTable(sets)) return null;
  const seen = new Set();
  for (const s of sets) {
    for (const t of s.tiles) {
      if (seen.has(t.id)) return null;
      seen.add(t.id);
    }
  }
  const tableIds = new Set();
  for (const s of originalTable) for (const t of s.tiles) tableIds.add(t.id);
  for (const id of tableIds) if (!seen.has(id)) return null;
  const rackIds = new Set(rack.map((t) => t.id));
  const placed = [];
  for (const id of seen) {
    if (tableIds.has(id)) continue;
    if (!rackIds.has(id)) return null;
    placed.push(id);
  }
  return placed.length > 0 ? placed : null;
}

const toLayout = (sets) => sets.map((s) => ({ id: s.id, tileIds: s.tiles.map((t) => t.id) }));
const cloneSets = (sets) => sets.map((s) => ({ id: s.id, tiles: [...s.tiles] }));

/**
 * 把 solve 的最終佈局拆成「逐張放置」的步驟,供 AI 出牌動畫用。
 * 第一步先呈現桌面重排(尚未放新牌),之後每步多放一張,最後一步即完整佈局;
 * 每一步都是可直接餵 game:layout 的合法佈局(守恆:桌面既有磚全在)。
 */
export function layoutSteps(finalSets, placedTileIds) {
  const placed = new Set(placedTileIds);
  let cur = finalSets
    .map((s) => ({ id: s.id, tileIds: s.tileIds.filter((id) => !placed.has(id)) }))
    .filter((s) => s.tileIds.length > 0);
  const steps = [cur];
  for (const s of finalSets) {
    for (const id of s.tileIds) {
      if (!placed.has(id)) continue;
      cur = cur.map((x) => ({ id: x.id, tileIds: [...x.tileIds] }));
      const target = cur.find((x) => x.id === s.id);
      if (target) target.tileIds.push(id);
      else cur.push({ id: s.id, tileIds: [id] });
      steps.push(cur);
    }
  }
  return steps;
}

/**
 * 求一手可出的牌。
 * 輸入 { rack, table, hasMelded }:回合開始時的手牌、桌面([{id,tiles}])、是否已首攤。
 * options: { level: 'easy'|'hard', timeBudgetMs, maxRearrange }
 * 回傳 { sets: [{id,tileIds}](可直接餵 game:layout,含桌面全部既有磚), placedTileIds, score } 或 null。
 */
export function solve({ rack, table = [], hasMelded = false }, options = {}) {
  const { level = 'hard', timeBudgetMs = 50, maxRearrange = 8 } = options;
  // 新牌組 id 必須避開桌面既有 id(前次 AI 出牌留下的 ai-* 會原樣帶回,
  // 重複 id 會讓前端「以 id 找牌組」的拖曳邏輯錯亂)
  const taken = new Set(table.map((s) => s.id));
  let nextId = 0;
  const idGen = () => {
    let id;
    do id = `ai-${Math.random().toString(36).slice(2, 6)}-${nextId++}`;
    while (taken.has(id));
    taken.add(id);
    return id;
  };

  // 首攤:只用手牌湊 >= 30 點,桌面原樣帶回(endTurn 首攤簽名檢查要求不動桌面)
  if (!hasMelded) {
    const r = searchRackMelds(rack, { minScore: INITIAL_MELD_MIN, timeBudgetMs });
    if (!r) return null;
    const sets = [...cloneSets(table), ...r.melds.map((tiles) => ({ id: idGen(), tiles }))];
    const placed = selfCheck(sets, table, rack);
    if (!placed) return null;
    return { sets: toLayout(sets), placedTileIds: placed, score: r.score };
  }

  // 已首攤
  let work = cloneSets(table);
  let rackLeft = [...rack];
  let score = 0;

  // Pass 1:手牌內現成組合
  const r1 = searchRackMelds(rackLeft, { minScore: 0, timeBudgetMs });
  if (r1) {
    for (const tiles of r1.melds) work.push({ id: idGen(), tiles });
    rackLeft = removeById(rackLeft, r1.melds.flat().map((t) => t.id));
    score = r1.score;
  }
  if (level === 'easy') {
    const placed = selfCheck(work, table, rack);
    if (!placed) return null;
    return { sets: toLayout(work), placedTileIds: placed, score };
  }

  // Pass 2:延伸既有牌組
  rackLeft = extendSets(work, rackLeft);
  const checkpoint = { sets: cloneSets(work) };

  // Pass 3:有限重排(切入 / 借牌),每次成功後回跑 Pass 2
  for (let i = 0; i < maxRearrange; i++) {
    const afterSplit = trySplitInsert(work, rackLeft, idGen);
    const after = afterSplit ?? tryBorrowForPair(work, rackLeft, idGen);
    if (!after) break;
    rackLeft = extendSets(work, after);
  }

  // 自檢失敗就降級回 Pass 1+2 的結果,結構性保證產出必過 endTurn
  let placed = selfCheck(work, table, rack);
  if (!placed) {
    work = checkpoint.sets;
    placed = selfCheck(work, table, rack);
  }
  if (!placed) return null;
  return { sets: toLayout(work), placedTileIds: placed, score };
}
