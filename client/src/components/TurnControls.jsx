import React from 'react';
import { useStore } from '../store.js';
import { req } from '../socket.js';
import { sounds } from '../sounds.js';

export default function TurnControls({ myTurn }) {
  const { game, showToast, flagInvalidSets } = useStore();

  const placedCount = game.placedTileIds?.length ?? 0;

  const act = async (event, payload) => {
    const res = await req(event, payload);
    if (!res.ok && res.error) {
      showToast(res.error, 'warn');
      sounds.error();
      if (res.invalidSetIds?.length) flagInvalidSets(res.invalidSetIds);
    }
  };

  if (!myTurn) return null;

  return (
    <div className="turn-controls">
      <div className="turn-buttons">
        <button className="primary" disabled={placedCount === 0} onClick={() => act('game:endTurn')}>
          出牌{placedCount > 0 ? `(${placedCount} 張)` : ''}
        </button>
        <button onClick={() => act('game:draw')}>抽牌並跳過</button>
        <button className="small" disabled={placedCount === 0} onClick={() => act('game:reset')}>
          還原
        </button>
      </div>
    </div>
  );
}
