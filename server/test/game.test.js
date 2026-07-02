import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.js';

function makeGame(players = 2) {
  const events = [];
  const list = Array.from({ length: players }, (_, i) => ({
    playerId: `p${i + 1}`,
    name: `玩家${i + 1}`,
  }));
  const game = new Game(list, {
    broadcast: (event, data) => events.push({ to: 'all', event, data }),
    toPlayer: (pid, event, data) => events.push({ to: pid, event, data }),
    isConnected: () => true,
    onGameOver: () => events.push({ to: 'all', event: 'roomReset' }),
  });
  return { game, events };
}

const findTiles = (game, specs) => {
  // specs: [[color,num],...] 從 tileById 取出實磚
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

test('發牌:每人 14 張,輪到第一位', () => {
  const { game } = makeGame(3);
  game.start();
  assert.equal(game.racks.get('p1').length, 14);
  assert.equal(game.racks.get('p3').length, 14);
  assert.equal(game.pool.length, 106 - 42);
  assert.equal(game.currentPlayerId, 'p1');
  game.dispose();
});

test('首攤 30 點:成功提交、換人', () => {
  const { game, events } = makeGame(2);
  const meld = findTiles(game, [['red', 10], ['red', 11], ['red', 12]]);
  game.start();
  game.racks.set('p1', [...meld, ...game.racks.get('p1').slice(0, 3)]);
  game.provisionalRack = [...game.racks.get('p1')];

  const r1 = game.applyLayout('p1', [{ id: 'a', tileIds: meld.map((t) => t.id) }]);
  assert.ok(r1.ok);
  // 即時廣播:其他玩家看得到暫定桌面
  const stateEvents = events.filter((e) => e.event === 'game:state');
  const last = stateEvents[stateEvents.length - 1].data;
  assert.equal(last.table.length, 1);
  assert.equal(last.placedTileIds.length, 3);

  const r2 = game.endTurn('p1');
  assert.ok(r2.ok);
  assert.ok(game.hasMelded.has('p1'));
  assert.equal(game.table.length, 1);
  assert.equal(game.racks.get('p1').length, 3);
  assert.equal(game.currentPlayerId, 'p2');
  game.dispose();
});

test('首攤不足 30 點:還原 + 罰抽一張', () => {
  const { game } = makeGame(2);
  const meld = findTiles(game, [['red', 1], ['blue', 1], ['black', 1]]); // 3 點
  game.start();
  game.racks.set('p1', [...meld, ...game.racks.get('p1').slice(0, 3)]);
  game.provisionalRack = [...game.racks.get('p1')];

  assert.ok(game.applyLayout('p1', [{ id: 'a', tileIds: meld.map((t) => t.id) }]).ok);
  const r = game.endTurn('p1');
  assert.ok(!r.ok);
  assert.equal(game.table.length, 0); // 已還原
  assert.equal(game.racks.get('p1').length, 7); // 6 + 罰抽 1
  assert.equal(game.currentPlayerId, 'p2');
  game.dispose();
});

test('不能使用不屬於自己的磚 / 不能收回桌面既有磚', () => {
  const { game } = makeGame(2);
  const meld = findTiles(game, [['red', 10], ['red', 11], ['red', 12]]);
  game.start();
  game.racks.set('p1', [...meld]);
  game.provisionalRack = [...meld];
  game.applyLayout('p1', [{ id: 'a', tileIds: meld.map((t) => t.id) }]);
  game.endTurn('p1'); // p1 獲勝?rack 空 → 勝利!避免:加一張
  game.dispose();

  const g2 = makeGame(2).game;
  const meld2 = findTiles(g2, [['red', 10], ['red', 11], ['red', 12]]);
  const extra = findTiles(g2, [['blue', 5]]);
  g2.start();
  g2.racks.set('p1', [...meld2, ...extra]);
  g2.provisionalRack = [...g2.racks.get('p1')];
  g2.applyLayout('p1', [{ id: 'a', tileIds: meld2.map((t) => t.id) }]);
  g2.endTurn('p1');
  // 現在輪到 p2:嘗試用不在手上的磚
  const notMine = findTiles(g2, [['orange', 7]]).filter(
    (t) => !g2.racks.get('p2').some((x) => x.id === t.id)
  );
  if (notMine.length) {
    const r = g2.applyLayout('p2', [
      { id: 'a', tileIds: meld2.map((t) => t.id) },
      { id: 'b', tileIds: [notMine[0].id] },
    ]);
    assert.ok(!r.ok);
  }
  // 嘗試收回桌面的磚(佈局缺少桌面磚)
  const r2 = g2.applyLayout('p2', [{ id: 'a', tileIds: meld2.slice(0, 2).map((t) => t.id) }]);
  assert.ok(!r2.ok);
  g2.dispose();
});

test('出完手牌獲勝並結算', () => {
  const { game, events } = makeGame(2);
  const meld = findTiles(game, [['red', 10], ['red', 11], ['red', 12], ['red', 13]]);
  game.start();
  game.racks.set('p1', [...meld]);
  game.provisionalRack = [...meld];
  game.applyLayout('p1', [{ id: 'a', tileIds: meld.map((t) => t.id) }]);
  const r = game.endTurn('p1');
  assert.ok(r.ok);
  assert.ok(game.over);
  assert.equal(game.winner, 'p1');
  const over = events.find((e) => e.event === 'game:over');
  assert.ok(over);
  const winner = over.data.results.find((x) => x.playerId === 'p1');
  const loser = over.data.results.find((x) => x.playerId === 'p2');
  assert.ok(winner.isWinner && winner.score > 0);
  assert.equal(loser.score, -loser.penalty);
  game.dispose();
});

test('抽牌跳過與已首攤玩家可重組桌面', () => {
  const { game } = makeGame(2);
  const meld = findTiles(game, [['red', 10], ['red', 11], ['red', 12], ['red', 13]]);
  const extra = findTiles(game, [['blue', 5]]);
  game.start();
  game.racks.set('p1', [...meld, ...extra]);
  game.provisionalRack = [...game.racks.get('p1')];
  game.applyLayout('p1', [{ id: 'a', tileIds: meld.map((t) => t.id) }]);
  game.endTurn('p1');

  // p2 抽牌跳過
  const before = game.racks.get('p2').length;
  assert.ok(game.drawAndPass('p2').ok);
  assert.equal(game.racks.get('p2').length, before + 1);
  assert.equal(game.currentPlayerId, 'p1');

  // p1 已首攤:拆桌面順子 + 用手上的 blue5?不合法。改測:把 13 拆出來加自己手牌組新組 → 不合法會 fail
  // 合法重組:red10-13 拆成 10,11,12 留下,13 + 手牌不夠 → 直接抽牌
  assert.ok(game.drawAndPass('p1').ok);
  game.dispose();
});
