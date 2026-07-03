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
