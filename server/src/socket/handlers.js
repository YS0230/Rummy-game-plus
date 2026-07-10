import { Game } from '../game/Game.js';
import { BotDriver } from '../game/BotDriver.js';

export function registerHandlers(io, rooms) {
  const broadcastLobby = () => io.emit('lobby:list', rooms.lobbyList());

  const broadcastRoom = (room) => {
    io.to(room.id).emit('room:update', rooms.publicRoom(room));
    broadcastLobby();
  };

  const systemChat = (room, text) => {
    const msg = { system: true, text, ts: Date.now() };
    rooms.addChat(room, msg);
    io.to(room.id).emit('chat:message', msg);
  };

  const gameCallbacks = (room) => ({
    broadcast: (event, data) => io.to(room.id).emit(event, data),
    toPlayer: (playerId, event, data) => {
      const p = room.players.find((x) => x.playerId === playerId);
      if (p?.connected && p.socketId) io.to(p.socketId).emit(event, data);
    },
    isConnected: (playerId) =>
      !!room.players.find((x) => x.playerId === playerId)?.connected,
    onTurn: (playerId) => room.botDriver?.onTurn(playerId),
    onGameOver: () => {
      room.status = 'waiting';
      // 電腦玩家恆為已準備,可直接再開一局
      for (const p of room.players) p.ready = p.playerId === room.hostId || !!p.isBot;
      room.botDriver?.dispose();
      room.botDriver = null;
      broadcastRoom(room);
    },
  });

  /** 傳給單一 socket 完整狀態(加入/重連用) */
  const sendFullState = (socket, room, playerId) => {
    socket.emit('state:full', {
      room: rooms.publicRoom(room),
      game: room.game && room.status === 'playing' ? room.game.publicState() : null,
      hand: room.game && room.status === 'playing' ? room.game.handOf(playerId) : [],
      chat: room.chat,
    });
  };

  io.on('connection', (socket) => {
    const { playerId, name } = socket.handshake.auth || {};
    if (!playerId) {
      socket.disconnect(true);
      return;
    }
    socket.data.playerId = playerId;
    socket.data.name = (name || '玩家').slice(0, 16);

    // 斷線重連:找回原房間
    const existing = rooms.roomOf(playerId);
    if (existing) {
      const player = existing.players.find((p) => p.playerId === playerId);
      if (player) {
        player.socketId = socket.id;
        player.connected = true;
        rooms.cancelDestroy(existing);
        socket.join(existing.id);
        sendFullState(socket, existing, playerId);
        systemChat(existing, `${player.name} 重新連線`);
        broadcastRoom(existing);
        if (existing.game && existing.status === 'playing') {
          existing.game.broadcastState();
        }
      }
    }

    socket.emit('lobby:list', rooms.lobbyList());

    const withRoom = (fn) => (payload, ack) => {
      try {
        const room = rooms.roomOf(playerId);
        if (!room) return ack?.({ ok: false, error: '不在任何房間' });
        fn(room, payload ?? {}, ack);
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    };

    // ---------- 大廳 ----------
    socket.on('lobby:create', (payload, ack) => {
      try {
        if (rooms.roomOf(playerId)) throw new Error('已在其他房間');
        if (payload?.playerName) socket.data.name = String(payload.playerName).slice(0, 16);
        const room = rooms.createRoom(
          { playerId, name: socket.data.name, socketId: socket.id },
          payload ?? {}
        );
        socket.join(room.id);
        systemChat(room, `${socket.data.name} 建立了房間`);
        sendFullState(socket, room, playerId);
        broadcastLobby();
        ack?.({ ok: true, roomId: room.id });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    const joinRoom = (room, payload, ack) => {
      if (rooms.roomOf(playerId)) throw new Error('已在其他房間');
      if (payload?.playerName) socket.data.name = String(payload.playerName).slice(0, 16);
      const player = rooms.addPlayer(room, {
        playerId,
        name: socket.data.name,
        socketId: socket.id,
      });
      socket.data.name = player.name; // 重名補號後,聊天等處用同一名字
      socket.join(room.id);
      systemChat(room, `${player.name} 加入房間`);
      sendFullState(socket, room, playerId);
      broadcastRoom(room);
      ack?.({ ok: true, roomId: room.id });
    };

    socket.on('lobby:join', (payload, ack) => {
      try {
        const room = rooms.rooms.get(payload?.roomId);
        if (!room) throw new Error('房間不存在');
        joinRoom(room, payload, ack);
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on('lobby:joinByCode', (payload, ack) => {
      try {
        const room = rooms.findByCode(String(payload?.code || ''));
        if (!room) throw new Error('找不到此代碼的房間');
        joinRoom(room, payload, ack);
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on('lobby:refresh', () => socket.emit('lobby:list', rooms.lobbyList()));

    // ---------- 等待室 ----------
    socket.on(
      'room:ready',
      withRoom((room, payload, ack) => {
        const p = room.players.find((x) => x.playerId === playerId);
        if (p && room.status === 'waiting' && playerId !== room.hostId) {
          p.ready = !!payload.ready;
          broadcastRoom(room);
        }
        ack?.({ ok: true });
      })
    );

    socket.on(
      'room:start',
      withRoom((room, payload, ack) => {
        if (playerId !== room.hostId) throw new Error('只有房主可以開始');
        if (room.status !== 'waiting') throw new Error('遊戲已在進行');
        if (room.players.length < 2) throw new Error('至少需要 2 位玩家');
        if (!room.players.every((p) => p.ready && p.connected))
          throw new Error('所有玩家須準備且在線');
        room.status = 'playing';
        room.game = new Game(
          room.players.map((p) => ({ playerId: p.playerId, name: p.name })),
          gameCallbacks(room),
          { turnSeconds: room.turnSeconds }
        );
        const bots = room.players.filter((p) => p.isBot);
        if (bots.length > 0) {
          const levels = new Map(bots.map((p) => [p.playerId, p.botLevel]));
          room.botDriver = new BotDriver(room.game, (pid) => levels.get(pid) ?? null);
        }
        systemChat(room, '遊戲開始!');
        broadcastRoom(room);
        room.game.start();
        ack?.({ ok: true });
      })
    );

    socket.on(
      'room:addBot',
      withRoom((room, payload, ack) => {
        if (playerId !== room.hostId) throw new Error('只有房主可以加入電腦玩家');
        const bot = rooms.addBot(room);
        systemChat(room, `${bot.name} 加入房間`);
        broadcastRoom(room);
        ack?.({ ok: true });
      })
    );

    socket.on(
      'room:removeBot',
      withRoom((room, payload, ack) => {
        if (playerId !== room.hostId) throw new Error('只有房主可以移除電腦玩家');
        const bot = rooms.removeBot(room, String(payload.playerId || ''));
        systemChat(room, `${bot.name} 已被移除`);
        broadcastRoom(room);
        ack?.({ ok: true });
      })
    );

    socket.on(
      'room:leave',
      withRoom((room, payload, ack) => {
        const p = room.players.find((x) => x.playerId === playerId);
        socket.leave(room.id);
        rooms.removePlayer(room, playerId);
        if (rooms.rooms.has(room.id)) {
          systemChat(room, `${p?.name ?? '玩家'} 離開房間`);
          broadcastRoom(room);
          if (room.game && room.status === 'playing') room.game.broadcastState();
        } else {
          broadcastLobby();
        }
        ack?.({ ok: true });
      })
    );

    // ---------- 遊戲 ----------
    const gameAction = (fn) =>
      withRoom((room, payload, ack) => {
        if (!room.game || room.status !== 'playing')
          return ack?.({ ok: false, error: '遊戲未進行' });
        ack?.(fn(room.game, payload));
      });

    socket.on('game:layout', gameAction((game, p) => game.applyLayout(playerId, p.sets)));
    socket.on('game:reset', gameAction((game) => game.resetLayout(playerId)));
    socket.on('game:draw', gameAction((game) => game.drawAndPass(playerId)));
    socket.on('game:endTurn', gameAction((game) => game.endTurn(playerId)));

    // ---------- 聊天 ----------
    socket.on(
      'chat:send',
      withRoom((room, payload, ack) => {
        const text = String(payload.text || '').trim().slice(0, 300);
        if (!text) return ack?.({ ok: false });
        const msg = { playerId, name: socket.data.name, text, ts: Date.now() };
        rooms.addChat(room, msg);
        io.to(room.id).emit('chat:message', msg);
        ack?.({ ok: true });
      })
    );

    // ---------- 斷線 ----------
    socket.on('disconnect', () => {
      const room = rooms.roomOf(playerId);
      if (!room) return;
      const p = room.players.find((x) => x.playerId === playerId);
      if (!p || p.socketId !== socket.id) return; // 已被新連線取代
      p.connected = false;
      if (room.status === 'waiting') {
        // 等待室斷線:60 秒未回來就移除
        setTimeout(() => {
          const r = rooms.roomOf(playerId);
          if (r === room && !p.connected && room.status === 'waiting') {
            rooms.removePlayer(room, playerId);
            if (rooms.rooms.has(room.id)) {
              systemChat(room, `${p.name} 離開房間`);
              broadcastRoom(room);
            }
            broadcastLobby();
          }
        }, 60 * 1000);
      }
      systemChat(room, `${p.name} 斷線了`);
      broadcastRoom(room);
      if (room.game && room.status === 'playing') room.game.broadcastState();
      rooms.scheduleDestroyIfAbandoned(room, broadcastLobby);
    });
  });
}
