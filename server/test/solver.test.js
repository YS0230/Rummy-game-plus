import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, searchRackMelds, layoutSteps } from '../../shared/solver.js';
import { validateTable, setScore } from '../../shared/validator.js';
import { createTiles, shuffle } from '../src/game/tiles.js';
import { Game } from '../src/game/Game.js';

// ---------- 測試用磚工具 ----------

const ALL = createTiles();
const tileById = new Map(ALL.map((t) => [t.id, t]));
const pick = (color, num, copy = 0) =>
  ALL.find((t) => !t.isJoker && t.color === color && t.num === num && t.id.endsWith(`-${copy}`));
const joker = (i = 0) => ALL.find((t) => t.id === `joker-${i}`);
const tilesOf = (set) => set.tileIds.map((id) => tileById.get(id));

/** 驗證 solve 結果:整桌合法、守恆、placed 來自手牌;回傳新增(非桌面)的牌組 */
function verifyResult(result, { rack, table, hasMelded }) {
  assert.ok(result.placedTileIds.length > 0);
  const sets = result.sets.map((s) => ({ id: s.id, tiles: tilesOf(s) }));
  assert.ok(validateTable(sets), '整桌每組皆合法');
  const seen = new Set();
  for (const s of sets) for (const t of s.tiles) {
    assert.ok(!seen.has(t.id), '無重複磚');
    seen.add(t.id);
  }
  const tableIds = new Set(table.flatMap((s) => s.tiles.map((t) => t.id)));
  for (const id of tableIds) assert.ok(seen.has(id), '桌面既有磚不得收回');
  const rackIds = new Set(rack.map((t) => t.id));
  for (const id of result.placedTileIds) assert.ok(rackIds.has(id), '新出的磚皆來自手牌');
  if (!hasMelded) {
    // 首攤:桌面牌組原封不動、新牌組全為手牌且合計 >= 30
    const snapSigs = new Set(table.map((s) => s.tiles.map((t) => t.id).sort().join(',')));
    let score = 0;
    for (const s of sets) {
      const sig = s.tiles.map((t) => t.id).sort().join(',');
      if (snapSigs.has(sig)) {
        snapSigs.delete(sig);
        continue;
      }
      assert.ok(s.tiles.every((t) => rackIds.has(t.id)), '首攤新組不可混桌面磚');
      score += setScore(s.tiles);
    }
    assert.equal(snapSigs.size, 0, '首攤不可重組桌面牌組');
    assert.ok(score >= 30, `首攤合計 ${score} >= 30`);
  }
  return sets;
}

// ---------- searchRackMelds ----------

test('searchRackMelds:找出手牌內的順子與群組', () => {
  const rack = [
    pick('red', 10), pick('red', 11), pick('red', 12),
    pick('blue', 5), pick('orange', 5), pick('black', 5),
    pick('blue', 2),
  ];
  const r = searchRackMelds(rack);
  assert.ok(r);
  assert.equal(r.tilesUsed, 6);
  assert.equal(r.melds.length, 2);
  assert.equal(r.score, 10 + 11 + 12 + 15);
});

test('searchRackMelds:同色同號兩張可分屬不同牌組', () => {
  const rack = [
    pick('red', 5, 0), pick('red', 5, 1),
    pick('blue', 5), pick('orange', 5),
    pick('red', 6), pick('red', 7),
  ];
  const r = searchRackMelds(rack);
  assert.ok(r);
  assert.equal(r.tilesUsed, 6); // group 5,5,5 + run 5,6,7
});

test('searchRackMelds:湊不出任何組合回傳 null', () => {
  const rack = [pick('red', 1), pick('blue', 3), pick('orange', 9), pick('black', 12)];
  assert.equal(searchRackMelds(rack), null);
});

// ---------- solve:首攤 ----------

test('首攤:>=30 點成功,不足 30 回 null', () => {
  const good = [pick('red', 10), pick('red', 11), pick('red', 12), pick('blue', 2), pick('orange', 9)];
  const r = solve({ rack: good, table: [], hasMelded: false });
  assert.ok(r);
  assert.ok(r.score >= 30);
  verifyResult(r, { rack: good, table: [], hasMelded: false });

  const low = [pick('red', 1), pick('blue', 1), pick('black', 1), pick('orange', 5), pick('blue', 9)];
  assert.equal(solve({ rack: low, table: [], hasMelded: false }), null);
});

test('首攤:桌面既有牌組原樣帶回,不動用桌面磚', () => {
  const table = [{ id: 't1', tiles: [pick('black', 7), pick('blue', 7), pick('orange', 7)] }];
  const rack = [pick('red', 10), pick('red', 11), pick('red', 12), pick('red', 13), pick('blue', 3)];
  const r = solve({ rack, table, hasMelded: false });
  assert.ok(r);
  const passthrough = r.sets.find((s) => s.id === 't1');
  assert.ok(passthrough, '桌面牌組保留原 id');
  assert.deepEqual([...passthrough.tileIds].sort(), table[0].tiles.map((t) => t.id).sort());
  verifyResult(r, { rack, table, hasMelded: false });
});

test('首攤:鬼牌補順子/群組達 30 點', () => {
  const runRack = [pick('red', 10), joker(0), pick('red', 12), pick('blue', 4)];
  const r1 = solve({ rack: runRack, table: [], hasMelded: false });
  assert.ok(r1);
  verifyResult(r1, { rack: runRack, table: [], hasMelded: false });

  const groupRack = [pick('black', 13), pick('blue', 13), joker(1), pick('orange', 2)];
  const r2 = solve({ rack: groupRack, table: [], hasMelded: false });
  assert.ok(r2);
  verifyResult(r2, { rack: groupRack, table: [], hasMelded: false });
});

// ---------- solve:已首攤 ----------

test('已首攤:手牌單張延伸桌面順子', () => {
  const table = [{ id: 't1', tiles: [pick('red', 10), pick('red', 11), pick('red', 12)] }];
  const rack = [pick('red', 13), pick('blue', 2), pick('orange', 6)];
  const r = solve({ rack, table, hasMelded: true });
  assert.ok(r);
  assert.deepEqual(r.placedTileIds, [pick('red', 13).id]);
  verifyResult(r, { rack, table, hasMelded: true });
});

test('easy:只出手牌現成組合,不延伸桌面', () => {
  const table = [{ id: 't1', tiles: [pick('red', 10), pick('red', 11), pick('red', 12)] }];
  const rack = [pick('red', 13), pick('blue', 2), pick('orange', 6)];
  assert.equal(solve({ rack, table, hasMelded: true }, { level: 'easy' }), null);

  const rack2 = [...rack, pick('blue', 6), pick('black', 6)];
  const r = solve({ rack: rack2, table, hasMelded: true }, { level: 'easy' });
  assert.ok(r, 'easy 手牌內有群組 6,6,6 可出');
  assert.equal(r.placedTileIds.length, 3);
  const passthrough = r.sets.find((s) => s.id === 't1');
  assert.equal(passthrough.tileIds.length, 3, 'easy 不動桌面牌組');
  verifyResult(r, { rack: rack2, table, hasMelded: true });
});

test('已首攤:切割插入桌面長順子', () => {
  const table = [{
    id: 't1',
    tiles: [pick('red', 5), pick('red', 6), pick('red', 7, 0), pick('red', 8), pick('red', 9), pick('red', 10)],
  }];
  const rack = [pick('red', 7, 1), pick('blue', 2), pick('orange', 11)];
  const r = solve({ rack, table, hasMelded: true });
  assert.ok(r);
  assert.deepEqual(r.placedTileIds, [pick('red', 7, 1).id]);
  const sets = verifyResult(r, { rack, table, hasMelded: true });
  assert.equal(sets.length, 2, '順子被拆成兩段');
});

test('已首攤:從 4 張群組借牌湊手牌 pair', () => {
  const table = [{
    id: 't1',
    tiles: [pick('red', 9), pick('blue', 9), pick('orange', 9), pick('black', 9)],
  }];
  const rack = [pick('red', 7), pick('red', 8), pick('blue', 3)];
  const r = solve({ rack, table, hasMelded: true });
  assert.ok(r);
  assert.equal(r.placedTileIds.length, 2, '出掉 red7+red8');
  const sets = verifyResult(r, { rack, table, hasMelded: true });
  assert.equal(sets.length, 2, '借出 red9 後拆成群組 3 張 + 順子 7,8,9');
});

test('已首攤:手牌實體磚換出桌面順子中的鬼牌,鬼牌接回桌面', () => {
  // 桌面 red10 J red12,手上有 red11 → 換出鬼牌,鬼牌接回順子頭尾
  const table = [{ id: 't1', tiles: [pick('red', 10), joker(0), pick('red', 12)] }];
  const rack = [pick('red', 11), pick('blue', 2)];
  const r = solve({ rack, table, hasMelded: true });
  assert.ok(r, '鬼牌牌組可被重組');
  assert.deepEqual(r.placedTileIds, [pick('red', 11).id]);
  const sets = verifyResult(r, { rack, table, hasMelded: true });
  const jokerStillOnTable = sets.some((s) => s.tiles.some((t) => t.isJoker));
  assert.ok(jokerStillOnTable, '鬼牌不得收回手牌');
});

test('已首攤:換出的鬼牌與手牌兩張組成新牌組', () => {
  const table = [{ id: 't1', tiles: [pick('red', 10), joker(0), pick('red', 12)] }];
  const rack = [pick('red', 11), pick('blue', 5), pick('orange', 5)];
  const r = solve({ rack, table, hasMelded: true });
  assert.ok(r);
  assert.equal(r.placedTileIds.length, 3, 'red11 + 鬼牌群組用掉 blue5/orange5');
  const sets = verifyResult(r, { rack, table, hasMelded: true });
  assert.equal(sets.length, 2, '多出一組鬼牌新牌組');
});

test('已首攤:鬼牌換出後無處可放則不換', () => {
  // 4 張群組含鬼牌:換出後群組已滿、無其他牌組可接 → 不可換
  const table = [{
    id: 't1',
    tiles: [pick('red', 9), pick('blue', 9), pick('orange', 9), joker(0)],
  }];
  const rack = [pick('black', 9), pick('blue', 2)];
  assert.equal(solve({ rack, table, hasMelded: true }), null);
});

test('已首攤:無牌可出回傳 null', () => {
  const table = [{ id: 't1', tiles: [pick('red', 10), pick('red', 11), pick('red', 12)] }];
  const rack = [pick('blue', 2), pick('orange', 6), pick('black', 4)];
  assert.equal(solve({ rack, table, hasMelded: true }), null);
});

// ---------- solve:精確解(B&B 全桌重組) ----------

test('精確解:三條順子全桌重組成群組(啟發式無解的局面)', () => {
  // 桌面 r/b/o 10-12 三條順子,手上 k10,k11:唯一解是重組成
  // [r10 b10 o10 k10][r11 b11 o11 k11][r12 b12 o12],出掉兩張
  const table = [
    { id: 't1', tiles: [pick('red', 10), pick('red', 11), pick('red', 12)] },
    { id: 't2', tiles: [pick('blue', 10), pick('blue', 11), pick('blue', 12)] },
    { id: 't3', tiles: [pick('orange', 10), pick('orange', 11), pick('orange', 12)] },
  ];
  const rack = [pick('black', 10), pick('black', 11), pick('blue', 2)];
  const r = solve({ rack, table, hasMelded: true });
  assert.ok(r, '需全桌重組才有解');
  assert.equal(r.placedTileIds.length, 2, '出掉 black10 + black11');
  verifyResult(r, { rack, table, hasMelded: true });
});

test('精確解:重組含鬼牌的桌面,鬼牌仍留在桌面', () => {
  const table = [
    { id: 't1', tiles: [pick('red', 10), pick('red', 11), pick('red', 12)] },
    { id: 't2', tiles: [pick('blue', 10), pick('blue', 11), pick('blue', 12)] },
    { id: 't3', tiles: [pick('orange', 10), joker(0), pick('orange', 12)] },
  ];
  const rack = [pick('black', 10), pick('black', 11)];
  const r = solve({ rack, table, hasMelded: true });
  assert.ok(r, '鬼牌可在重組中改當群組成員');
  assert.equal(r.placedTileIds.length, 2);
  const sets = verifyResult(r, { rack, table, hasMelded: true });
  assert.ok(sets.some((s) => s.tiles.some((t) => t.isJoker)), '鬼牌不得收回手牌');
});

test('精確解:未被重組的桌面牌組沿用原 id', () => {
  const table = [
    { id: 't0', tiles: [pick('black', 5), pick('black', 6), pick('black', 7)] },
    { id: 't1', tiles: [pick('red', 10), pick('red', 11), pick('red', 12)] },
    { id: 't2', tiles: [pick('blue', 10), pick('blue', 11), pick('blue', 12)] },
    { id: 't3', tiles: [pick('orange', 10), pick('orange', 11), pick('orange', 12)] },
  ];
  const rack = [pick('black', 10), pick('black', 11)];
  const r = solve({ rack, table, hasMelded: true });
  assert.ok(r);
  assert.equal(r.placedTileIds.length, 2);
  const kept = r.sets.find((s) => s.id === 't0');
  assert.ok(kept, '沒動到的 k5-7 保留原 id');
  assert.deepEqual([...kept.tileIds].sort(), table[0].tiles.map((t) => t.id).sort());
  verifyResult(r, { rack, table, hasMelded: true });
});

test('精確解:時間預算極小時不丟例外,結果仍合法或 null', () => {
  const table = [
    { id: 't1', tiles: [pick('red', 10), pick('red', 11), pick('red', 12)] },
    { id: 't2', tiles: [pick('blue', 10), pick('blue', 11), pick('blue', 12)] },
    { id: 't3', tiles: [pick('orange', 10), pick('orange', 11), pick('orange', 12)] },
  ];
  const rack = [pick('black', 10), pick('black', 11), pick('blue', 2)];
  const r = solve({ rack, table, hasMelded: true }, { timeBudgetMs: 0 });
  if (r) verifyResult(r, { rack, table, hasMelded: true });
});

// ---------- 端到端:solve 結果必過 Game.applyLayout + endTurn ----------

function makeGame(players = 2) {
  const list = Array.from({ length: players }, (_, i) => ({ playerId: `p${i + 1}`, name: `玩家${i + 1}` }));
  return new Game(list, {
    broadcast: () => {},
    toPlayer: () => {},
    isConnected: () => true,
    onGameOver: () => {},
  });
}

const findTiles = (game, specs) => {
  const used = new Set();
  return specs.map(([color, num]) => {
    for (const t of game.tileById.values()) {
      if (!t.isJoker && t.color === color && t.num === num && !used.has(t.id)) {
        used.add(t.id);
        return t;
      }
    }
    throw new Error('tile not found');
  });
};

test('端到端:首攤 solve 結果通過 endTurn', () => {
  const game = makeGame(2);
  game.start();
  const rack = findTiles(game, [['red', 10], ['red', 11], ['red', 12], ['blue', 2], ['orange', 9]]);
  game.racks.set('p1', rack);
  game.provisionalRack = [...rack];

  const r = solve({ rack, table: game.table, hasMelded: false });
  assert.ok(r);
  assert.ok(game.applyLayout('p1', r.sets).ok);
  assert.ok(game.endTurn('p1').ok);
  assert.ok(game.hasMelded.has('p1'));
  assert.equal(game.currentPlayerId, 'p2');
  game.dispose();
});

test('端到端:已首攤 solve(hard) 延伸桌面通過 endTurn', () => {
  const game = makeGame(2);
  game.start();
  // p1 先首攤,桌面留下 red10-12
  const meld = findTiles(game, [['red', 10], ['red', 11], ['red', 12]]);
  game.racks.set('p1', [...meld, ...game.racks.get('p1').slice(0, 3)]);
  game.provisionalRack = [...game.racks.get('p1')];
  game.applyLayout('p1', [{ id: 'a', tileIds: meld.map((t) => t.id) }]);
  assert.ok(game.endTurn('p1').ok);

  // p2 視為已首攤,手上 red13 + 雜牌 → hard 延伸桌面
  game.hasMelded.add('p2');
  const rack = findTiles(game, [['red', 13], ['blue', 2], ['orange', 6]]);
  game.racks.set('p2', rack);
  game.provisionalRack = [...rack];

  const r = solve({ rack, table: game.table, hasMelded: true });
  assert.ok(r);
  assert.ok(game.applyLayout('p2', r.sets).ok);
  assert.ok(game.endTurn('p2').ok);
  assert.equal(game.racks.get('p2').length, 2);
  game.dispose();
});

test('回歸:連續兩次 solve,新牌組 id 不與桌面既有 id 重複', () => {
  // 第一次 AI 出牌後,桌面留下 ai-* id 的牌組;第二次 solve 的新組 id 不得撞名
  const rack1 = [pick('red', 10), pick('red', 11), pick('red', 12)];
  const r1 = solve({ rack: rack1, table: [], hasMelded: false });
  assert.ok(r1);
  const table = r1.sets.map((s) => ({ id: s.id, tiles: tilesOf(s) }));

  const rack2 = [pick('blue', 11), pick('orange', 11), pick('black', 11), pick('blue', 3)];
  const r2 = solve({ rack: rack2, table, hasMelded: true });
  assert.ok(r2);
  const ids = r2.sets.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `牌組 id 不重複: ${ids.join(', ')}`);
});

test('回歸:applyLayout 對重複的牌組 id 自動改名', () => {
  const game = makeGame(2);
  game.start();
  const a = findTiles(game, [['red', 10], ['red', 11], ['red', 12]]);
  const b = findTiles(game, [['blue', 5], ['orange', 5], ['black', 5]]);
  game.racks.set('p1', [...a, ...b]);
  game.provisionalRack = [...game.racks.get('p1')];
  const r = game.applyLayout('p1', [
    { id: 'dup', tileIds: a.map((t) => t.id) },
    { id: 'dup', tileIds: b.map((t) => t.id) },
  ]);
  assert.ok(r.ok);
  const ids = game.provisionalTable.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `暫定桌面 id 不重複: ${ids.join(', ')}`);
  game.dispose();
});

test('layoutSteps:逐張步驟每步皆過 applyLayout,最後一步可 endTurn', () => {
  const game = makeGame(2);
  game.start();
  // p1 先首攤留桌面
  const meld = findTiles(game, [['red', 10], ['red', 11], ['red', 12]]);
  game.racks.set('p1', [...meld, ...game.racks.get('p1').slice(0, 2)]);
  game.provisionalRack = [...game.racks.get('p1')];
  game.applyLayout('p1', [{ id: 'a', tileIds: meld.map((t) => t.id) }]);
  assert.ok(game.endTurn('p1').ok);

  // p2 已首攤:red13 延伸 + 手牌群組,拆成逐張步驟重播
  game.hasMelded.add('p2');
  const rack = findTiles(game, [['red', 13], ['blue', 7], ['orange', 7], ['black', 7]]);
  game.racks.set('p2', rack);
  game.provisionalRack = [...rack];
  const result = solve({ rack, table: game.table, hasMelded: true });
  assert.ok(result);
  const steps = layoutSteps(result.sets, result.placedTileIds);
  assert.equal(steps.length, result.placedTileIds.length + 1, '基底 + 每張一步');
  for (const sets of steps) {
    assert.ok(game.applyLayout('p2', sets).ok, '每一步都是合法佈局');
  }
  assert.ok(game.endTurn('p2').ok);
  assert.equal(game.racks.get('p2').length, 0);
  game.dispose();
});

// ---------- 模糊測試:隨機局面下結果永遠合法且不逾時 ----------

test('模糊測試:200 局隨機手牌/桌面,結果皆過驗證且 <250ms', () => {
  for (let iter = 0; iter < 200; iter++) {
    const deck = shuffle(createTiles());
    // 用另一份隨機牌組出合法桌面
    const tableSeed = deck.splice(0, 20);
    const seedMelds = searchRackMelds(tableSeed, { timeBudgetMs: 30 });
    const table = (seedMelds?.melds ?? []).map((tiles, i) => ({ id: `t${i}`, tiles }));
    const tableIdSet = new Set(table.flatMap((s) => s.tiles.map((t) => t.id)));
    const rack = deck.filter((t) => !tableIdSet.has(t.id)).slice(0, 14 + (iter % 7));

    for (const hasMelded of [false, true]) {
      const t0 = Date.now();
      // 壓低精確搜尋預算讓 200 局跑得完;anytime 特性下正確性不受預算影響
      const r = solve({ rack, table, hasMelded }, { timeBudgetMs: 50 });
      const elapsed = Date.now() - t0;
      assert.ok(elapsed < 250, `solve 耗時 ${elapsed}ms 超標 (iter=${iter})`);
      if (r) verifyResult(r, { rack, table, hasMelded });
    }
  }
});
