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

const MIN_TABLE_SCALE = 0.5; // 低於此縮放牌太小難點按,改回捲動

/**
 * 自動縮放 + FLIP。
 * 縮放:牌組總高超出桌面時,內層以 CSS zoom 縮小,牌變小、每列自動塞更多組,
 * 全部牌組免捲動可見。用 zoom 而非 transform: scale——zoom 參與版面計算,
 * scrollHeight 會跟著變小(transform 縮小後 Chrome 仍以未縮放版面算捲動範圍,會留白)。
 * 顯示高度隨 zoom 縮小單調遞減,可二分搜尋最大可用值。
 * FLIP:佈局變動時牌組從舊位置平滑滑到新位置;translate 在 zoom 內會被放大,座標須除以 zoom。
 */
function useFitAndFlip(table) {
  const areaRef = useRef(null);
  const innerRef = useRef(null);
  const scaleRef = useRef(1);
  const prevRects = useRef(new Map());

  useLayoutEffect(() => {
    const area = areaRef.current;
    const inner = innerRef.current;
    if (!area || !inner) return;
    const apply = (s) => {
      inner.style.zoom = s === 1 ? '' : String(s);
    };
    // getBoundingClientRect 回傳實際像素(含 zoom),offsetHeight 在 zoom 下單位不可靠
    const shownH = () => inner.getBoundingClientRect().height;
    const fit = () => {
      const cs = getComputedStyle(area);
      const availH =
        area.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      apply(1);
      if (shownH() <= availH) {
        scaleRef.current = 1;
        return;
      }
      let lo = MIN_TABLE_SCALE;
      let hi = 1;
      let best = MIN_TABLE_SCALE;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        apply(mid);
        if (shownH() <= availH) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      apply(best);
      scaleRef.current = best;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(area);
    return () => ro.disconnect();
  }, [table]);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    // 基準取內層自身的 rect,捲動時基準跟著位移,不需再補 scrollTop
    const base = inner.getBoundingClientRect();
    const scale = scaleRef.current;
    const rects = new Map();
    for (const el of inner.querySelectorAll('[data-flip-id]')) {
      const r = el.getBoundingClientRect();
      rects.set(el.dataset.flipId, {
        el,
        left: (r.left - base.left) / scale,
        top: (r.top - base.top) / scale,
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

  return { areaRef, innerRef };
}

export default function TableArea({ myTurn, placedSet, onSetDoubleClick }) {
  const { game, invalidSetIds } = useStore();
  const newSet = useDroppable({ id: 'newset', data: { type: 'newset' }, disabled: !myTurn });
  const { areaRef, innerRef } = useFitAndFlip(game.table);

  return (
    <div className="table-area" ref={areaRef}>
      <div className="table-scale" ref={innerRef}>
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
    </div>
  );
}
