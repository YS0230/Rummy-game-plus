import { customAlphabet } from 'nanoid';

const roomId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);
const roomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

const EMPTY_DESTROY_MS = 5 * 60 * 1000; // 全員斷線 5 分鐘銷毀
const MAX_CHAT = 100;

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> room
    this.playerRoom = new Map(); // playerId -> roomId
  }

  createRoom({ playerId, name, socketId }, { roomName, maxPlayers, isPrivate }) {
    const room = {
      id: roomId(),
      code: roomCode(),
      name: (roomName || `${name} 的房間`).slice(0, 30),
      hostId: playerId,
      maxPlayers: Math.min(4, Math.max(2, Number(maxPlayers) || 4)),
      isPrivate: !!isPrivate,
      status: 'waiting',
      players: [],
      game: null,
      chat: [],
      destroyTimer: null,
    };
    this.rooms.set(room.id, room);
    this.addPlayer(room, { playerId, name, socketId });
    return room;
  }

  addPlayer(room, { playerId, name, socketId }) {
    if (room.status !== 'waiting') throw new Error('遊戲進行中,無法加入');
    if (room.players.length >= room.maxPlayers) throw new Error('房間已滿');
    if (room.players.some((p) => p.playerId === playerId)) throw new Error('已在房間內');
    const player = {
      playerId,
      name: this.uniqueName(room, (name || '玩家').slice(0, 16)),
      socketId,
      connected: true,
      ready: playerId === room.hostId,
    };
    room.players.push(player);
    this.playerRoom.set(playerId, room.id);
    this.cancelDestroy(room);
    return player;
  }

  /** 同房間重名時自動補上 #隨機數字(例:憤怒的馬鈴薯#812) */
  uniqueName(room, base) {
    const taken = new Set(room.players.map((p) => p.name));
    if (!taken.has(base)) return base;
    for (let i = 0; i < 50; i++) {
      const candidate = `${base}#${Math.floor(100 + Math.random() * 900)}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${base}#${Date.now() % 10000}`;
  }

  findByCode(code) {
    for (const room of this.rooms.values()) {
      if (room.code === code.toUpperCase()) return room;
    }
    return null;
  }

  roomOf(playerId) {
    const id = this.playerRoom.get(playerId);
    return id ? this.rooms.get(id) ?? null : null;
  }

  /** 玩家離開(明確離開或等待室斷線移除) */
  removePlayer(room, playerId) {
    const idx = room.players.findIndex((p) => p.playerId === playerId);
    if (idx === -1) return;
    room.players.splice(idx, 1);
    this.playerRoom.delete(playerId);
    if (room.game && !room.game.over) room.game.removePlayer(playerId);
    if (room.players.length === 0) {
      this.destroyRoom(room);
      return;
    }
    if (room.hostId === playerId) {
      room.hostId = room.players[0].playerId;
      room.players[0].ready = true;
    }
  }

  destroyRoom(room) {
    if (room.game) room.game.dispose();
    this.cancelDestroy(room);
    for (const p of room.players) this.playerRoom.delete(p.playerId);
    this.rooms.delete(room.id);
  }

  /** 全員斷線時排程銷毀 */
  scheduleDestroyIfAbandoned(room, onDestroy) {
    if (room.players.some((p) => p.connected)) return;
    this.cancelDestroy(room);
    room.destroyTimer = setTimeout(() => {
      if (!room.players.some((p) => p.connected)) {
        this.destroyRoom(room);
        onDestroy();
      }
    }, EMPTY_DESTROY_MS);
  }

  cancelDestroy(room) {
    if (room.destroyTimer) {
      clearTimeout(room.destroyTimer);
      room.destroyTimer = null;
    }
  }

  addChat(room, message) {
    room.chat.push(message);
    if (room.chat.length > MAX_CHAT) room.chat.shift();
  }

  lobbyList() {
    return [...this.rooms.values()]
      .filter((r) => !r.isPrivate)
      .map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        playerCount: r.players.length,
        maxPlayers: r.maxPlayers,
      }));
  }

  publicRoom(room) {
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      isPrivate: room.isPrivate,
      status: room.status,
      players: room.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        connected: p.connected,
        ready: p.ready,
      })),
    };
  }
}
