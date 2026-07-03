import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useStore, tileLabel } from '../store.js';
import { req } from '../socket.js';
import { isValidRun, sortRunForDisplay } from '../../../shared/validator.js';
import Tile from '../components/Tile.jsx';
import Rack from '../components/Rack.jsx';
import TableArea from '../components/TableArea.jsx';
import PlayerBar from '../components/PlayerBar.jsx';
import TurnControls from '../components/TurnControls.jsx';
import Chat from '../components/Chat.jsx';
import ResultModal from '../components/ResultModal.jsx';

export default function GameBoard() {
  const { game, hand, playerId, moveHandTile, showToast, turnFlash, drewOverlay } = useStore();
  const [activeTile, setActiveTile] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  );

  if (!game) return <div className="loading">載入遊戲中…</div>;

  const myTurn = game.current === playerId && !game.over;
  const placedSet = new Set(game.placedTileIds ?? []);

  const currentLayout = () =>
    game.table.map((s) => ({ id: s.id, tileIds: s.tiles.map((t) => t.id) }));

  const sendLayout = async (sets) => {
    const res = await req('game:layout', { sets: sets.filter((s) => s.tileIds.length > 0) });
    if (!res.ok && res.error) showToast(res.error, 'warn');
  };

  // 雙擊手牌:自動排到「建立新牌組」區
  const playTileToNewSet = (tileId) => {
    if (!myTurn) return;
    const layout = currentLayout();
    layout.push({ id: `n-${Date.now().toString(36)}`, tileIds: [tileId] });
    sendLayout(layout);
  };

  // 雙擊桌面牌組:收回這回合放進該組的牌
  const recallSet = (setId) => {
    if (!myTurn) return;
    const layout = currentLayout();
    const ls = layout.find((s) => s.id === setId);
    if (!ls) return;
    const kept = ls.tileIds.filter((id) => !placedSet.has(id));
    if (kept.length === ls.tileIds.length) {
      showToast('這個牌組沒有本回合放上的牌');
      return;
    }
    ls.tileIds = kept;
    sendLayout(layout);
  };

  const onDragStart = ({ active }) => setActiveTile(active.data.current?.tile ?? null);

  const onDragEnd = ({ active, over }) => {
    setActiveTile(null);
    if (!over) return;
    const { tileId, from } = active.data.current ?? {};
    const target = over.data.current ?? {};
    if (!tileId) return;

    // 手牌內排序(任何時候可做)
    if (from === 'hand' && (target.type === 'handpos' || target.type === 'rack')) {
      const toIndex = target.type === 'handpos' ? target.index : hand.length;
      moveHandTile(tileId, toIndex);
      return;
    }

    if (!myTurn) return;
    const layout = currentLayout();
    // 從來源牌組移除:若拉走的是中間的牌,以它為界拆成左右兩組
    const removeFromSets = () => {
      const src = game.table.find((s) => s.tiles.some((t) => t.id === tileId));
      const ls = src && layout.find((s) => s.id === src.id);
      if (!ls) return;
      // 依畫面顯示順序切割(順子顯示時已重排)
      const display = isValidRun(src.tiles) ? sortRunForDisplay(src.tiles) : src.tiles;
      const idx = display.findIndex((t) => t.id === tileId);
      const left = display.slice(0, idx).map((t) => t.id);
      const right = display.slice(idx + 1).map((t) => t.id);
      if (left.length && right.length) {
        ls.tileIds = left;
        layout.splice(layout.indexOf(ls) + 1, 0, {
          id: `n-${Date.now().toString(36)}r`,
          tileIds: right,
        });
      } else {
        ls.tileIds = left.length ? left : right;
      }
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
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveTile(null)}
    >
      <div className="game-page">
        <PlayerBar />
        <TableArea myTurn={myTurn} placedSet={placedSet} onSetDoubleClick={recallSet} />
        <TurnControls myTurn={myTurn} />
        <Rack myTurn={myTurn} onTileDoubleClick={playTileToNewSet} />
        <Chat />
        <ResultModal />
        {turnFlash && <div className="turn-banner">🎯 輪到你了!</div>}
        {drewOverlay && (
          <div className="drew-overlay">
            <div className="drew-card">
              <span className="drew-title">你抽到了</span>
              <div className="drew-tile">
                <Tile tile={drewOverlay} />
              </div>
              <span className="drew-label">{tileLabel(drewOverlay)}</span>
            </div>
          </div>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTile && <Tile tile={activeTile} dragging />}
      </DragOverlay>
    </DndContext>
  );
}
