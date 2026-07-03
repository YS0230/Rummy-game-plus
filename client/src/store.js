import { create } from 'zustand';
import { socket, myPlayerId } from './socket.js';

const COLOR_NAMES = { red: '紅', blue: '藍', orange: '橘', black: '黑' };
export const tileLabel = (t) => (t.isJoker ? '鬼牌 ☺' : `${COLOR_NAMES[t.color]}色 ${t.num}`);

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    /* 瀏覽器未允許音效時忽略 */
  }
}

export const useStore = create((set, get) => ({
  playerId: myPlayerId,
  name: localStorage.getItem('rummy-name') || '',
  connected: false,
  lobby: [],
  room: null,
  chat: [],
  game: null, // 伺服器公開遊戲狀態
  hand: [], // 自己手牌(維持本地排序)
  results: null, // 結算
  toasts: [],
  drewTile: null, // 剛抽到的磚(牌架高亮用)
  drewOverlay: null, // 抽牌中央動畫
  turnFlash: false, // 輪到自己的提示橫幅

  setName: (name) => set({ name }),

  showToast: (text, kind = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    }, 4000);
  },

  /** 合併手牌:保留既有本地順序,新磚附加在後 */
  mergeHand: (serverHand) => {
    const incoming = new Map(serverHand.map((t) => [t.id, t]));
    const kept = get().hand.filter((t) => incoming.has(t.id));
    const keptIds = new Set(kept.map((t) => t.id));
    const added = serverHand.filter((t) => !keptIds.has(t.id));
    set({ hand: [...kept, ...added] });
  },

  sortHand: (mode) => {
    const hand = [...get().hand];
    const colorOrder = { red: 0, blue: 1, orange: 2, black: 3 };
    if (mode === 'color') {
      hand.sort(
        (a, b) =>
          a.isJoker - b.isJoker || colorOrder[a.color] - colorOrder[b.color] || a.num - b.num
      );
    } else {
      hand.sort(
        (a, b) =>
          a.isJoker - b.isJoker || a.num - b.num || colorOrder[a.color] - colorOrder[b.color]
      );
    }
    set({ hand });
  },

  moveHandTile: (tileId, toIndex) => {
    const hand = [...get().hand];
    const from = hand.findIndex((t) => t.id === tileId);
    if (from === -1) return;
    const [tile] = hand.splice(from, 1);
    hand.splice(toIndex > from ? toIndex - 1 : toIndex, 0, tile);
    set({ hand });
  },
}));

export function bindSocket() {
  const s = useStore.setState;
  const g = useStore.getState;

  socket.on('connect', () => s({ connected: true }));
  socket.on('disconnect', () => s({ connected: false }));

  socket.on('lobby:list', (lobby) => s({ lobby }));

  socket.on('state:full', ({ room, game, hand, chat }) => {
    s({ room, game, chat: chat ?? [] });
    g().mergeHand(hand ?? []);
  });

  socket.on('room:update', (room) => {
    s({ room });
    if (room.status === 'waiting' && !g().results) s({ game: null });
  });

  socket.on('game:state', (game) => {
    const prev = g().game;
    s({ game });
    if (
      !game.over &&
      game.current === g().playerId &&
      prev?.current !== game.current
    ) {
      s({ turnFlash: true });
      beep();
      setTimeout(() => s({ turnFlash: false }), 2500);
    }
  });
  socket.on('game:hand', (hand) => g().mergeHand(hand));

  socket.on('game:drew', (tile) => {
    s({ drewTile: tile, drewOverlay: tile });
    setTimeout(() => {
      if (g().drewOverlay?.id === tile.id) s({ drewOverlay: null });
    }, 2200);
    setTimeout(() => {
      if (g().drewTile?.id === tile.id) s({ drewTile: null });
    }, 6000);
  });

  socket.on('game:turnResult', (r) => {
    if (r.message) g().showToast(r.message, r.ok ? 'info' : 'warn');
  });

  socket.on('game:over', ({ results }) => s({ results }));

  socket.on('chat:message', (msg) => s({ chat: [...g().chat, msg].slice(-100) }));
}
