import React from 'react';

export default function Tile({ tile, placed, dragging, drawn, hint = null }) {
  const cls = [
    'tile',
    `tile-${tile.isJoker ? 'joker' : tile.color}`,
    placed ? 'tile-placed' : '',
    dragging ? 'tile-dragging' : '',
    drawn ? 'tile-drawn' : '',
    hint != null ? `tile-hint tile-hint-${hint % 2}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <span className="tile-num">{tile.isJoker ? '☺' : tile.num}</span>
    </div>
  );
}
