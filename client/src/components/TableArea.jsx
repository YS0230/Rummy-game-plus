import React, { useLayoutEffect, useRef } from 'react';
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

function TableSet({ set, myTurn, placedSet, flagged, onDoubleClick }) {
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
      data-flip-id={set.id}
      className={`table-set ${valid ? '' : 'invalid'} ${drop.isOver ? 'set-over' : ''} ${
        flagged ? 'invalid-flash' : ''
      }`}
      onDoubleClick={() => onDoubleClick(set.id)}
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

/** FLIP:桌面佈局變動時,牌組從舊位置平滑滑到新位置,消除重排的跳躍感 */
function useFlipSets(table) {
  const areaRef = useRef(null);
  const prevRects = useRef(new Map());
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const base = area.getBoundingClientRect();
    const rects = new Map();
    for (const el of area.querySelectorAll('[data-flip-id]')) {
      const r = el.getBoundingClientRect();
      // 相對捲動內容的座標,避免捲動位移被誤算成移動
      rects.set(el.dataset.flipId, {
        el,
        left: r.left - base.left,
        top: r.top - base.top + area.scrollTop,
      });
    }
    for (const [id, cur] of rects) {
      const prev = prevRects.current.get(id);
      if (!prev) continue;
      const dx = prev.left - cur.left;
      const dy = prev.top - cur.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        cur.el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: 220, easing: 'ease-out' }
        );
      }
    }
    prevRects.current = rects;
  }, [table]);
  return areaRef;
}

export default function TableArea({ myTurn, placedSet, onSetDoubleClick }) {
  const { game, invalidSetIds } = useStore();
  const newSet = useDroppable({ id: 'newset', data: { type: 'newset' }, disabled: !myTurn });
  const areaRef = useFlipSets(game.table);

  return (
    <div className="table-area" ref={areaRef}>
      {game.table.map((s) => (
        <TableSet
          key={s.id}
          set={s}
          myTurn={myTurn}
          placedSet={placedSet}
          flagged={invalidSetIds.includes(s.id)}
          onDoubleClick={onSetDoubleClick}
        />
      ))}
      <div
        ref={newSet.setNodeRef}
        data-flip-id="__newset"
        className={`new-set-zone ${newSet.isOver ? 'set-over' : ''} ${myTurn ? '' : 'disabled'}`}
      >
        + 拖曳到這裡建立新牌組
      </div>
    </div>
  );
}
