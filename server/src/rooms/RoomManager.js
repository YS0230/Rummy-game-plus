import { customAlphabet } from 'nanoid';

const roomId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);
const roomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const botId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

const BOT_NAMES = ['電腦小磚', '電腦阿密', '電腦鬼牌', '電腦拉米'];

const EMPTY_DESTROY_MS = 5 * 60 * 1000; // 全員斷線 5 分鐘銷毀
const MAX_CHAT = 100;

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> room
    this.playerRoom = new Map(); // playerId -> roomId
  }

  createRoom({ playerId, name, socketId }, { roomName, maxPlayers, isPrivate, turnSeconds, sortHint }) {
    const room = {
      id: roomId(),
      code: roomCode(),
      name: (roomName || `${name} 的房間`).slice(0, 30),
      hostId: playerId,
      maxPlayers: Math.min(4, Math.max(2, Number(maxPlayers) || 4)),
      isPrivate: !!isPrivate,
      turnSeconds: Math.min(300, Math.max(15, Number(turnSeconds) || 60)),
      sortHint: !!sortHint,
      status: 'waiting',
      players: [],
      game: null,
      botDriver: null,
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

  /** 房主加入電腦玩家:恆為已準備、視為在線(無 socket) */
  addBot(room, level) {
    if (room.status !== 'waiting') throw new Error('遊戲進行中,無法加入');
    if (room.players.length >= room.maxPlayers) throw new Error('房間已滿');
    const base = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const bot = {
      playerId: `bot-${botId()}`,
      name: this.uniqueName(room, base),
      socketId: null,
      connected: true,
      ready: true,
      isBot: true,
      botLevel: level === 'hard' ? 'hard' : 'easy',
    };
    // 不寫入 playerRoom:那是給人類 socket 重連 roomOf 查詢用的
    room.players.push(bot);
    return bot;
  }

  removeBot(room, botPlayerId) {
    if (room.status !== 'waiting') throw new Error('遊戲進行中,無法移除');
    const idx = room.players.findIndex((p) => p.playerId === botPlayerId && p.isBot);
    if (idx === -1) throw new Error('找不到此電腦玩家');
    return room.players.splice(idx, 1)[0];
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
      // 房主只能由真人繼任;只剩電腦玩家時直接銷毀房間
      const nextHost = room.players.find((p) => !p.isBot);
      if (!nextHost) {
        this.destroyRoom(room);
        return;
      }
      room.hostId = nextHost.playerId;
      nextHost.ready = true;
    }
  }

  destroyRoom(room) {
    if (room.botDriver) {
      room.botDriver.dispose();
      room.botDriver = null;
    }
    if (room.game) room.game.dispose();
    this.cancelDestroy(room);
    for (const p of room.players) this.playerRoom.delete(p.playerId);
    this.rooms.delete(room.id);
  }

  /** 全員斷線時排程銷毀(電腦玩家恆為 connected,不列入判斷) */
  scheduleDestroyIfAbandoned(room, onDestroy) {
    const anyHuman = (r) => r.players.some((p) => p.connected && !p.isBot);
    if (anyHuman(room)) return;
    this.cancelDestroy(room);
    room.destroyTimer = setTimeout(() => {
      if (!anyHuman(room)) {
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
      turnSeconds: room.turnSeconds,
      sortHint: room.sortHint,
      status: room.status,
      players: room.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        connected: p.connected,
        ready: p.ready,
        isBot: !!p.isBot,
        botLevel: p.botLevel ?? null,
      })),
    };
  }
}
