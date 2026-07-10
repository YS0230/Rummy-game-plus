import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/rooms/RoomManager.js';

test('同房重名自動補 #隨機數字', () => {
  const rm = new RoomManager();
  const room = rm.createRoom(
    { playerId: 'p1', name: '憤怒的馬鈴薯', socketId: 's1' },
    { maxPlayers: 4 }
  );
  const p2 = rm.addPlayer(room, { playerId: 'p2', name: '憤怒的馬鈴薯', socketId: 's2' });
  const p3 = rm.addPlayer(room, { playerId: 'p3', name: '憤怒的馬鈴薯', socketId: 's3' });

  assert.equal(room.players[0].name, '憤怒的馬鈴薯');
  assert.match(p2.name, /^憤怒的馬鈴薯#\d{3,4}$/);
  assert.match(p3.name, /^憤怒的馬鈴薯#\d{3,4}$/);
  assert.notEqual(p2.name, p3.name);
  // 不重名者不受影響
  const p4 = rm.addPlayer(room, { playerId: 'p4', name: '微醺的北極熊', socketId: 's4' });
  assert.equal(p4.name, '微醺的北極熊');
});

test('addBot:預設欄位正確,滿員/遊戲中不可加入', () => {
  const rm = new RoomManager();
  const room = rm.createRoom({ playerId: 'p1', name: '房主', socketId: 's1' }, { maxPlayers: 2 });
  const bot = rm.addBot(room);
  assert.ok(bot.playerId.startsWith('bot-'));
  assert.ok(bot.isBot && bot.ready && bot.connected);
  assert.equal(bot.botLevel, 'hard');
  assert.equal(bot.socketId, null);
  assert.ok(!rm.playerRoom.has(bot.playerId), 'bot 不進 playerRoom 對照表');

  assert.throws(() => rm.addBot(room), /房間已滿/);
  room.status = 'playing';
  room.players.pop();
  assert.throws(() => rm.addBot(room), /遊戲進行中/);
});

test('removeBot:只能移除電腦玩家,且限等待中', () => {
  const rm = new RoomManager();
  const room = rm.createRoom({ playerId: 'p1', name: '房主', socketId: 's1' }, { maxPlayers: 4 });
  const bot = rm.addBot(room);
  assert.throws(() => rm.removeBot(room, 'p1'), /找不到/);
  room.status = 'playing';
  assert.throws(() => rm.removeBot(room, bot.playerId), /遊戲進行中/);
  room.status = 'waiting';
  assert.equal(rm.removeBot(room, bot.playerId).playerId, bot.playerId);
  assert.equal(room.players.length, 1);
});

test('房主離開:繼任跳過 bot;只剩 bot 時銷毀房間', () => {
  const rm = new RoomManager();
  const room = rm.createRoom({ playerId: 'p1', name: '房主', socketId: 's1' }, { maxPlayers: 4 });
  rm.addBot(room);
  const p2 = rm.addPlayer(room, { playerId: 'p2', name: '真人', socketId: 's2' });
  rm.removePlayer(room, 'p1');
  assert.equal(room.hostId, 'p2', '繼任者為真人而非排在前面的 bot');
  assert.ok(p2.ready);

  rm.removePlayer(room, 'p2');
  assert.ok(!rm.rooms.has(room.id), '只剩 bot 的房間直接銷毀');
});

test('全真人斷線時仍會排程銷毀(bot 恆連線不影響判定)', () => {
  const rm = new RoomManager();
  const room = rm.createRoom({ playerId: 'p1', name: '房主', socketId: 's1' }, { maxPlayers: 4 });
  rm.addBot(room);
  room.players.find((p) => p.playerId === 'p1').connected = false;
  rm.scheduleDestroyIfAbandoned(room, () => {});
  assert.ok(room.destroyTimer, '有排程銷毀計時器');
  rm.cancelDestroy(room);
  rm.destroyRoom(room);
});

test('publicRoom 帶出 isBot 與 botLevel', () => {
  const rm = new RoomManager();
  const room = rm.createRoom({ playerId: 'p1', name: '房主', socketId: 's1' }, { maxPlayers: 4 });
  rm.addBot(room);
  const pub = rm.publicRoom(room);
  assert.equal(pub.players[0].isBot, false);
  assert.equal(pub.players[1].isBot, true);
  assert.equal(pub.players[1].botLevel, 'hard');
});
