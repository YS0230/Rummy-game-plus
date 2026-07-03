import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useStore } from '../store.js';
import { isValidSet, sortRunForDisplay, isValidRun } from '../../../shared/validator.js';
import Tile from './Tile.jsx';

function TableTile({ tile, setId, myTurn, placed }) {
  const drag = useDraggable({
    id: `table-${tile.id}`,
    data: { tileId: tile.id, from: setId, tile },
    disabled: !myTurn,
  });
  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      style={{ opacity: drag.isDragging ? 0.3 : 1, touchAction: 'none' }}
    >
      <Tile tile={tile} placed={placed} />
    </div>
  );
}

function TableSet({ set, myTurn, placedSet, flagged }) {
  const drop = useDroppable({
    id: `set-${set.id}`,
    data: { type: 'set', setId: set.id },
    disabled: !myTurn,
  });
  const valid = isValidSet(set.tiles);
  const tiles = isValidRun(set.tiles) ? sortRunForDisplay(set.tiles) : set.tiles;
  return (
    <div
      ref={drop.setNodeRef}
      className={`table-set ${valid ? '' : 'invalid'} ${drop.isOver ? 'set-over' : ''} ${
        flagged ? 'invalid-flash' : ''
      }`}
    >
      {tiles.map((t) => (
        <TableTile
          key={t.id}
          tile={t}
          setId={set.id}
          myTurn={myTurn}
          placed={placedSet.has(t.id)}
        />
      ))}
    </div>
  );
}

export default function TableArea({ myTurn, placedSet }) {
  const { game, invalidSetIds } = useStore();
  const newSet = useDroppable({ id: 'newset', data: { type: 'newset' }, disabled: !myTurn });

  return (
    <div className="table-area">
      {game.table.map((s) => (
        <TableSet
          key={s.id}
          set={s}
          myTurn={myTurn}
          placedSet={placedSet}
          flagged={invalidSetIds.includes(s.id)}
        />
      ))}
      <div
        ref={newSet.setNodeRef}
        className={`new-set-zone ${newSet.isOver ? 'set-over' : ''} ${myTurn ? '' : 'disabled'}`}
      >
        + 拖曳到這裡建立新牌組
      </div>
    </div>
  );
}
