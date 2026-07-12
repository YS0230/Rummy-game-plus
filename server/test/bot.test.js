import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game.js';
import { BotDriver, BOT_SPEEDS, DEFAULT_BOT_SPEED } from '../src/game/BotDriver.js';

test('出牌速度:檔位決定思考延遲與步距,短回合仍受總時長上限保護', () => {
  const fakeGame = { turnSeconds: 60 };
  const mk = (speed) =>
    new BotDriver(fakeGame, () => 'hard', { botSpeedOf: () => speed });

  assert.equal(mk('slow').speedOf('b').delayMs, BOT_SPEEDS.slow.delayMs);
  assert.equal(mk(null).speedOf('b'), BOT_SPEEDS[DEFAULT_BOT_SPEED], '未指定 → 預設慢');
  assert.equal(mk('bogus').speedOf('b'), BOT_SPEEDS[DEFAULT_BOT_SPEED]);

  // 60 秒回合、5 張:各檔位吃到各自的 maxStepMs
  assert.equal(mk('fast').stepMsFor('b', 5), BOT_SPEEDS.fast.maxStepMs);
  assert.equal(mk('normal').stepMsFor('b', 5), BOT_SPEEDS.normal.maxStepMs);
  assert.equal(mk('slow').stepMsFor('b', 5), BOT_SPEEDS.slow.maxStepMs);

  // 15 秒短回合 + 慢速 + 20 張:思考 + 放置不得超過回合的 70%
  const shortGame = { turnSeconds: 15 };
  const slow = new BotDriver(shortGame, () => 'hard', { botSpeedOf: () => 'slow' });
  const step = slow.stepMsFor('b', 20);
  assert.ok(
    BOT_SPEEDS.slow.delayMs + step * 20 <= 15000 * 0.7,
    `總時長超標:${BOT_SPEEDS.slow.delayMs + step * 20}`
  );
});

/** 建一局遊戲並掛上 BotDriver(delayMs/stepMs:0 → 每步以 setTimeout(0) 觸發) */
function makeBotGame(botLevels, players = ['p1', 'bot1']) {
  const events = [];
  const list = players.map((pid) => ({ playerId: pid, name: pid }));
  let driver;
  const game = new Game(list, {
    broadcast: (event, data) => events.push({ to: 'all', event, data }),
    toPlayer: (pid, event, data) => events.push({ to: pid, event, data }),
    isConnected: () => true,
    onTurn: (pid) => driver?.onTurn(pid),
    onGameOver: () => events.push({ to: 'all', event: 'roomReset' }),
  });
  driver = new BotDriver(game, (pid) => botLevels[pid] ?? null, { delayMs: 0, stepMs: 0 });
  return { game, driver, events };
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

const tick = () => new Promise((r) => setTimeout(r, 0));
// 逐張出牌是 setTimeout 串鏈,等待直到條件成立
const until = async (fn, max = 500) => {
  for (let i = 0; i < max && !fn(); i++) await tick();
};

test('bot 首攤:手牌有 30 點組合 → 自動出牌並換人', async () => {
  const { game, driver } = makeBotGame({ p1: 'hard' }, ['p1', 'p2']);
  const meld = findTiles(game, [['red', 10], ['red', 11], ['red', 12]]);
  const junk = findTiles(game, [['blue', 2], ['orange', 6]]);
  game.start(); // p1(bot) 回合,onTurn 已排程
  game.racks.set('p1', [...meld, ...junk]);
  game.provisionalRack = [...game.racks.get('p1')];
  await until(() => game.currentPlayerId === 'p2');
  assert.ok(game.hasMelded.has('p1'), 'bot 完成首攤');
  assert.equal(game.table.length, 1);
  assert.equal(game.racks.get('p1').length, 2);
  assert.equal(game.currentPlayerId, 'p2');
  driver.dispose();
  game.dispose();
});

test('bot 無牌可出:自動抽牌跳過', async () => {
  const { game, driver } = makeBotGame({ p1: 'hard' }, ['p1', 'p2']);
  const junk = findTiles(game, [['red', 1], ['blue', 4], ['orange', 8], ['black', 12]]);
  game.start();
  game.racks.set('p1', [...junk]);
  game.provisionalRack = [...junk];
  await until(() => game.currentPlayerId === 'p2');
  assert.equal(game.racks.get('p1').length, junk.length + 1, '罰抽一張');
  assert.ok(!game.hasMelded.has('p1'));
  assert.equal(game.currentPlayerId, 'p2');
  driver.dispose();
  game.dispose();
});

test('easy bot:已首攤但只剩延伸牌 → 抽牌;hard bot 會延伸桌面', async () => {
  for (const [level, expectPlaced] of [['easy', false], ['hard', true]]) {
    const { game, driver } = makeBotGame({ p2: level }, ['p1', 'p2']);
    const meld = findTiles(game, [['red', 10], ['red', 11], ['red', 12]]);
    const botRack = findTiles(game, [['red', 13], ['blue', 2], ['orange', 6]]);
    game.start(); // p1(真人)回合
    game.racks.set('p1', [...meld, ...game.racks.get('p1').slice(0, 2)]);
    game.provisionalRack = [...game.racks.get('p1')];
    game.applyLayout('p1', [{ id: 'a', tileIds: meld.map((t) => t.id) }]);
    game.racks.set('p2', [...botRack]);
    game.hasMelded.add('p2');
    assert.ok(game.endTurn('p1').ok); // 換 p2(bot),onTurn 排程
    await until(() => game.currentPlayerId === 'p1');
    if (expectPlaced) {
      assert.equal(game.racks.get('p2').length, 2, `${level}:red13 延伸到桌面`);
      assert.equal(game.table[0].tiles.length, 4);
    } else {
      assert.equal(game.racks.get('p2').length, 4, `${level}:無現成組合,抽牌`);
      assert.equal(game.table[0].tiles.length, 3, `${level}:桌面不動`);
    }
    assert.equal(game.currentPlayerId, 'p1');
    driver.dispose();
    game.dispose();
  }
});

test('兩個 bot 對戰:整局自動跑完,無錯誤且遊戲有進展', async () => {
  const { game, driver, events } = makeBotGame({ b1: 'hard', b2: 'easy' }, ['b1', 'b2']);
  game.start();
  for (let i = 0; i < 2000 && !game.over; i++) await tick();
  // 不強制要求分勝負(理論上可能牌堆抽光僵持),但至少要有大量回合進展
  const turnResults = events.filter((e) => e.event === 'game:turnResult');
  assert.ok(turnResults.length >= 30, `雙 bot 跑了 ${turnResults.length} 個回合動作`);
  driver.dispose();
  game.dispose();
});

test('game over 後 onTurn 不再動作', async () => {
  const { game, driver } = makeBotGame({ p1: 'hard' }, ['p1', 'p2']);
  game.start();
  game.dispose(); // over = true
  driver.onTurn('p1');
  await tick();
  assert.equal(game.table.length, 0);
  driver.dispose();
});
