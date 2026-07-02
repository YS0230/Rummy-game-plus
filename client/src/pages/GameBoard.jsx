import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useStore } from '../store.js';
import { req } from '../socket.js';
import Tile from '../components/Tile.jsx';
import Rack from '../components/Rack.jsx';
import TableArea from '../components/TableArea.jsx';
import PlayerBar from '../components/PlayerBar.jsx';
import TurnControls from '../components/TurnControls.jsx';
import Chat from '../components/Chat.jsx';
import ResultModal from '../components/ResultModal.jsx';

export default function GameBoard() {
  const { game, hand, playerId, moveHandTile, showToast } = useStore();
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
        <TableArea myTurn={myTurn} placedSet={placedSet} />
        <TurnControls myTurn={myTurn} />
        <Rack myTurn={myTurn} />
        <Chat />
        <ResultModal />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTile && <Tile tile={activeTile} dragging />}
      </DragOverlay>
    </DndContext>
  );
}
