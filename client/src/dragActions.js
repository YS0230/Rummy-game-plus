// 拖放語意層(自 GameBoard onDragEnd 抽出的純語意,2D dnd-kit 與 3D raycasting 共用)
// 輸入形狀與 dnd-kit 相同:{ tileId, from: 'hand'|setId, target: { type, setId?, index? } }
import { useStore } from './store.js';
import { req } from './socket.js';

export function currentLayout(game) {
  return game.table.map((s) => ({ id: s.id, tileIds: s.tiles.map((t) => t.id) }));
}

export async function sendLayout(sets) {
  const res = await req('game:layout', { sets: sets.filter((s) => s.tileIds.length > 0) });
  if (!res.ok && res.error) useStore.getState().showToast(res.error, 'warn');
}

export function applyDrop({ tileId, from, target }) {
  const { game, hand, playerId, moveHandTile, showToast } = useStore.getState();
  if (!game || !tileId || !target) return;
  const myTurn = game.current === playerId && !game.over;
  const placedSet = new Set(game.placedTileIds ?? []);

  // 手牌內排序(任何時候可做)
  if (from === 'hand' && (target.type === 'handpos' || target.type === 'rack')) {
    moveHandTile(tileId, target.type === 'handpos' ? target.index : hand.length);
    return;
  }

  if (!myTurn) return;
  const layout = currentLayout(game);
  const removeFromSets = () => {
    for (const s of layout) s.tileIds = s.tileIds.filter((id) => id !== tileId);
  };

  if (target.type === 'set' || target.type === 'newset') {
    if (from !== 'hand') {
      if (from === target.setId) return; // 同組不動
      removeFromSets();
    }
    if (target.type === 'set') {
      layout.find((s) => s.id === target.setId)?.tileIds.push(tileId);
    } else {
      layout.push({ id: `n-${Date.now().toString(36)}`, tileIds: [tileId] });
    }
    sendLayout(layout);
    return;
  }

  // 從桌面收回本回合放的磚
  if ((target.type === 'rack' || target.type === 'handpos') && from !== 'hand') {
    if (!placedSet.has(tileId)) {
      showToast('只能收回本回合放上的磚', 'warn');
      return;
    }
    removeFromSets();
    sendLayout(layout);
  }
}
