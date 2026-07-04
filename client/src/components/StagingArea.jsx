import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useStore } from '../store.js';
import { isValidSet } from '../../../shared/validator.js';
import Tile from './Tile.jsx';

function StagedTile({ tile, setId, onDoubleClick }) {
  const drag = useDraggable({
    id: `stg-${tile.id}`,
    data: { tileId: tile.id, from: 'staging', setId, tile },
  });
  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      style={{ opacity: drag.isDragging ? 0.3 : 1, touchAction: 'none' }}
      onDoubleClick={() => onDoubleClick(tile.id)}
    >
      <Tile tile={tile} />
    </div>
  );
}

function StagedSet({ set, tiles, myTurn, onSubmit, onTileDoubleClick }) {
  const drop = useDroppable({
    id: `stgset-${set.id}`,
    data: { type: 'staging', setId: set.id },
  });
  const valid = isValidSet(tiles);
  return (
    <div
      ref={drop.setNodeRef}
      className={[
        'staging-set',
        valid ? 'valid' : '',
        drop.isOver ? 'over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {tiles.map((t) => (
        <StagedTile key={t.id} tile={t} setId={set.id} onDoubleClick={onTileDoubleClick} />
      ))}
      {myTurn && (
        <button
          className="small primary staging-send"
          disabled={!valid}
          title={valid ? '把這組牌放上桌面' : '還不是合法牌組'}
          onClick={() => onSubmit(set)}
        >
          送出
        </button>
      )}
    </div>
  );
}

/**
 * 牌組暫放區:非自己回合也能先用手牌預組牌組(純本地),
 * 輪到自己時可按「送出」把整組放上桌面。
 */
export default function StagingArea({ myTurn, onSubmitSet }) {
  const { staging, hand, unstageTile } = useStore();
  const drop = useDroppable({ id: 'stg-new', data: { type: 'stagingnew' } });
  const tileById = new Map(hand.map((t) => [t.id, t]));

  return (
    <div className="staging-wrap">
      <span className="staging-label" title="非自己回合也可先組牌,輪到你時再決定是否送出">
        🧩 暫放區
      </span>
      {staging.map((s) => {
        const tiles = s.tileIds.map((id) => tileById.get(id)).filter(Boolean);
        if (tiles.length === 0) return null;
        return (
          <StagedSet
            key={s.id}
            set={s}
            tiles={tiles}
            myTurn={myTurn}
            onSubmit={onSubmitSet}
            onTileDoubleClick={unstageTile}
          />
        );
      })}
      <div ref={drop.setNodeRef} className={`staging-new ${drop.isOver ? 'over' : ''}`}>
        + 拖手牌到這裡預組新牌組
      </div>
    </div>
  );
}
