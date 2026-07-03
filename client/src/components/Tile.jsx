import React from 'react';

export default function Tile({ tile, placed, dragging, drawn }) {
  const cls = [
    'tile',
    `tile-${tile.isJoker ? 'joker' : tile.color}`,
    placed ? 'tile-placed' : '',
    dragging ? 'tile-dragging' : '',
    drawn ? 'tile-drawn' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <span className="tile-num">{tile.isJoker ? '☺' : tile.num}</span>
    </div>
  );
}
