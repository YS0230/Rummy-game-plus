import { create } from 'zustand';
import { socket, myPlayerId } from './socket.js';
import { sounds } from './sounds.js';
import { isValidSet } from '../../shared/validator.js';

const COLOR_NAMES = { red: '紅', blue: '藍', orange: '橘', black: '黑' };
export const tileLabel = (t) => (t.isJoker ? '鬼牌 ☺' : `${COLOR_NAMES[t.color]}色 ${t.num}`);

/** 排序後掃描相鄰手牌,找出可組成合法牌組的區段(貪婪取最長) */
function findHintGroups(tiles) {
  const groups = [];
  let i = 0;
  while (i < tiles.length) {
    let best = 0;
    const maxLen = Math.min(tiles.length - i, 13);
    for (let len = 3; len <= maxLen; len++) {
      if (isValidSet(tiles.slice(i, i + len))) best = len;
    }
    if (best > 0) {
      groups.push(tiles.slice(i, i + best).map((t) => t.id));
      i += best;
    } else {
      i++;
    }
  }
  return groups;
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
  invalidSetIds: [], // 出牌驗證失敗的牌組(紅色閃爍提醒)
  hintGroups: [], // 排序後偵測到的可組牌組([[tileId]],綠色閃爍提示)
  staging: [], // 牌組暫放區 [{ id, tileIds }],純本地狀態
  chatOpen: window.matchMedia('(min-width: 901px)').matches, // 聊天室展開
  chatSeen: 0, // 已讀訊息數(未讀徽章用)
  chatPops: [], // 聊天室收合時浮出的訊息氣泡
  aiUnlocked: localStorage.getItem('rummy-ai-unlocked') === '1', // 隱藏功能:AI 代出牌(連點房名 5 次切換)
  aiAuto: false, // AI 自動模式:輪到自己就自動代打

  flagInvalidSets: (ids) => {
    set({ invalidSetIds: ids });
    setTimeout(() => {
      if (get().invalidSetIds === ids) set({ invalidSetIds: [] });
    }, 4000);
  },
  turnFlash: false, // 輪到自己的提示橫幅

  setName: (name) => set({ name }),

  setChatOpen: (open) =>
    set(
      open
        ? { chatOpen: true, chatSeen: get().chat.length, chatPops: [] }
        : { chatOpen: false }
    ),

  /** 聊天室收合時,浮出訊息氣泡(最多同時 3 則),3.5 秒後自動消失 */
  pushChatPop: (msg) => {
    const id = `${Date.now()}-${Math.random()}`;
    set({ chatPops: [...get().chatPops, { id, name: msg.name, text: msg.text }].slice(-3) });
    setTimeout(() => {
      set({ chatPops: get().chatPops.filter((p) => p.id !== id) });
    }, 3500);
  },

  /** 切換 AI 代出牌顯示;隱藏時一併關閉自動模式。回傳新狀態 */
  toggleAiUnlocked: () => {
    const on = !get().aiUnlocked;
    localStorage.setItem('rummy-ai-unlocked', on ? '1' : '0');
    set(on ? { aiUnlocked: true } : { aiUnlocked: false, aiAuto: false });
    return on;
  },
  setAiAuto: (aiAuto) => set({ aiAuto }),

  showToast: (text, kind = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    }, 4000);
  },

  /** 合併手牌:保留既有本地順序,新磚附加在後;暫放區同步剔除已離手的磚 */
  mergeHand: (serverHand) => {
    const incoming = new Map(serverHand.map((t) => [t.id, t]));
    const kept = get().hand.filter((t) => incoming.has(t.id));
    const keptIds = new Set(kept.map((t) => t.id));
    const added = serverHand.filter((t) => !keptIds.has(t.id));
    const staging = get()
      .staging.map((s) => ({ ...s, tileIds: s.tileIds.filter((id) => incoming.has(id)) }))
      .filter((s) => s.tileIds.length > 0);
    set({ hand: [...kept, ...added], staging });
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
    // 排序提示(建房時啟用):偵測相鄰可組牌組,以牌組為單位閃爍
    if (get().room?.sortHint) {
      const stagedIds = new Set(get().staging.flatMap((s) => s.tileIds));
      const groups = findHintGroups(hand.filter((t) => !stagedIds.has(t.id)));
      set({ hintGroups: groups });
      if (groups.length > 0) {
        setTimeout(() => {
          if (get().hintGroups === groups) set({ hintGroups: [] });
        }, 4000);
      }
    }
  },

  /** 移動手牌:插到 beforeTileId 之前;beforeTileId 為 null 時排到最後 */
  moveHandTile: (tileId, beforeTileId = null) => {
    const hand = [...get().hand];
    const from = hand.findIndex((t) => t.id === tileId);
    if (from === -1) return;
    const [tile] = hand.splice(from, 1);
    const to = beforeTileId ? hand.findIndex((t) => t.id === beforeTileId) : -1;
    if (to === -1) hand.push(tile);
    else hand.splice(to, 0, tile);
    set({ hand });
  },

  // ---------- 牌組暫放區(本地) ----------

  /** 把手牌放進暫放區:setId 為 null 時開新組 */
  stageTile: (tileId, setId = null) => {
    if (!get().hand.some((t) => t.id === tileId)) return;
    const staging = get()
      .staging.map((s) => ({ ...s, tileIds: s.tileIds.filter((id) => id !== tileId) }))
      .filter((s) => s.tileIds.length > 0);
    const target = setId && staging.find((s) => s.id === setId);
    if (target) target.tileIds = [...target.tileIds, tileId];
    else staging.push({ id: `stg-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`, tileIds: [tileId] });
    set({ staging });
  },

  /** 從暫放區收回手牌 */
  unstageTile: (tileId) => {
    const staging = get()
      .staging.map((s) => ({ ...s, tileIds: s.tileIds.filter((id) => id !== tileId) }))
      .filter((s) => s.tileIds.length > 0);
    set({ staging });
  },

  clearStagingSet: (setId) => set({ staging: get().staging.filter((s) => s.id !== setId) }),
}));

export function bindSocket() {
  const s = useStore.setState;
  const g = useStore.getState;

  socket.on('connect', () => s({ connected: true }));
  socket.on('disconnect', () => s({ connected: false }));

  socket.on('lobby:list', (lobby) => s({ lobby }));

  socket.on('state:full', ({ room, game, hand, chat }) => {
    s({ room, game, chat: chat ?? [], chatSeen: (chat ?? []).length });
    g().mergeHand(hand ?? []);
  });

  socket.on('room:update', (room) => {
    s({ room });
    // 回到等待室(結束/新局):清掉上一局的暫放區與提示(磚 id 跨局相同,不能沿用)
    if (room.status === 'waiting') s({ staging: [], hintGroups: [] });
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
      sounds.yourTurn();
      setTimeout(() => s({ turnFlash: false }), 2500);
    }
  });
  socket.on('game:hand', (hand) => g().mergeHand(hand));

  socket.on('game:drew', (tile) => {
    sounds.draw();
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
    if (r.ok && !r.drew) sounds.play(); // 有人出牌成功(含自己),全房都聽得到
    else if (!r.ok && r.playerId === g().playerId) sounds.error(); // 自己被超時跳過
  });

  socket.on('game:over', ({ winnerId, results }) => {
    s({ results });
    if (winnerId === g().playerId) sounds.win();
    else sounds.lose();
  });

  socket.on('chat:message', (msg) => {
    s({ chat: [...g().chat, msg].slice(-100) });
    // 聊天室收合時,別人的發言浮出氣泡+提示音(系統訊息與自己的訊息不提示)
    if (!msg.system && msg.playerId !== g().playerId && !g().chatOpen) {
      g().pushChatPop(msg);
      sounds.chat();
    }
  });
}
