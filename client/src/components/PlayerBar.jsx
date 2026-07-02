import React from 'react';
import { useStore } from '../store.js';

export default function PlayerBar() {
  const { game, playerId, room } = useStore();
  return (
    <div className="player-bar">
      <div className="player-bar-left">
        <span className="room-tag">{room?.name}</span>
        <span className="muted">牌堆 {game.poolCount}</span>
      </div>
      <div className="player-bar-players">
        {game.players.map((p) => (
          <div
            key={p.playerId}
            className={[
              'pb-player',
              p.playerId === game.current ? 'current' : '',
              p.connected ? '' : 'offline',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="pb-name">
              {p.name}
              {p.playerId === playerId && '(你)'}
            </span>
            <span className="pb-count">{p.rackCount} 張</span>
            {p.hasMelded && <span className="pb-meld" title="已首攤">✓</span>}
            {!p.connected && <span className="pb-off">斷線</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
