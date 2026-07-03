import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useStore } from '../store.js';
import Tile from './Tile.jsx';

function RackTile({ tile, index, drawn }) {
  const drag = useDraggable({
    id: `hand-${tile.id}`,
    data: { tileId: tile.id, from: 'hand', tile },
  });
  const drop = useDroppable({
    id: `handpos-${index}`,
    data: { type: 'handpos', index },
  });
  return (
    <div ref={drop.setNodeRef} className={`slot ${drop.isOver ? 'slot-over' : ''}`}>
      <div
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        style={{ opacity: drag.isDragging ? 0.3 : 1, touchAction: 'none' }}
      >
        <Tile tile={tile} drawn={drawn} />
      </div>
    </div>
  );
}

export default function Rack({ myTurn }) {
  const { hand, sortHand, drewTile } = useStore();
  const drop = useDroppable({ id: 'rack', data: { type: 'rack' } });

  return (
    <div className={`rack-wrap ${myTurn ? 'my-turn' : ''}`}>
      <div className="rack-tools">
        <span className="muted">手牌 {hand.length} 張</span>
        {myTurn && <span className="turn-tag">🎯 你的回合</span>}
        <button className="small" onClick={() => sortHand('color')}>
          依色排序
        </button>
        <button className="small" onClick={() => sortHand('num')}>
          依數字排序
        </button>
      </div>
      <div ref={drop.setNodeRef} className={`rack ${drop.isOver ? 'rack-over' : ''}`}>
        {hand.map((t, i) => (
          <RackTile key={t.id} tile={t} index={i} drawn={drewTile?.id === t.id} />
        ))}
        {hand.length === 0 && <span className="muted">沒有手牌</span>}
      </div>
    </div>
  );
}
