import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useStore } from '../store.js';
import Tile from './Tile.jsx';

function RackTile({ tile, drawn, hint, onDoubleClick }) {
  const drag = useDraggable({
    id: `hand-${tile.id}`,
    data: { tileId: tile.id, from: 'hand', tile },
  });
  const drop = useDroppable({
    id: `handpos-${tile.id}`,
    data: { type: 'handpos', beforeTileId: tile.id },
  });
  return (
    <div ref={drop.setNodeRef} className={`slot ${drop.isOver ? 'slot-over' : ''}`}>
      <div
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        style={{ opacity: drag.isDragging ? 0.3 : 1, touchAction: 'none' }}
        onDoubleClick={() => onDoubleClick(tile.id)}
      >
        <Tile tile={tile} drawn={drawn} hint={hint} />
      </div>
    </div>
  );
}

export default function Rack({ myTurn, onTileDoubleClick }) {
  const { hand, sortHand, drewTile, staging, hintGroups } = useStore();
  const drop = useDroppable({ id: 'rack', data: { type: 'rack' } });

  const stagedIds = new Set(staging.flatMap((s) => s.tileIds));
  const shown = hand.filter((t) => !stagedIds.has(t.id));
  const hintIndex = new Map();
  hintGroups.forEach((ids, gi) => ids.forEach((id) => hintIndex.set(id, gi)));

  return (
    <div className={`rack-wrap ${myTurn ? 'my-turn' : ''}`}>
      <div className="rack-tools">
        <span className="muted">
          手牌 {hand.length} 張{stagedIds.size > 0 ? `(暫放 ${stagedIds.size})` : ''}
        </span>
        {myTurn && <span className="turn-tag">🎯 你的回合</span>}
        <button className="small" onClick={() => sortHand('color')}>
          789
        </button>
        <button className="small" onClick={() => sortHand('num')}>
          777
        </button>
      </div>
      <div ref={drop.setNodeRef} className={`rack ${drop.isOver ? 'rack-over' : ''}`}>
        {shown.map((t) => (
          <RackTile
            key={t.id}
            tile={t}
            drawn={drewTile?.id === t.id}
            hint={hintIndex.has(t.id) ? hintIndex.get(t.id) : null}
            onDoubleClick={onTileDoubleClick}
          />
        ))}
        {shown.length === 0 && <span className="muted">沒有手牌</span>}
      </div>
    </div>
  );
}
