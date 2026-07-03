import React, { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { req } from '../socket.js';

export default function TurnControls({ myTurn }) {
  const { game, showToast, flagInvalidSets } = useStore();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const remain = game.turnDeadline ? Math.max(0, Math.ceil((game.turnDeadline - now) / 1000)) : 0;
  const pct = game.turnDeadline ? Math.max(0, Math.min(100, (remain / 60) * 100)) : 0;
  const placedCount = game.placedTileIds?.length ?? 0;
  const currentName = game.players.find((p) => p.playerId === game.current)?.name;

  const act = async (event, payload) => {
    const res = await req(event, payload);
    if (!res.ok && res.error) {
      showToast(res.error, 'warn');
      if (res.invalidSetIds?.length) flagInvalidSets(res.invalidSetIds);
    }
  };

  return (
    <div className="turn-controls">
      <div className="timer">
        <div className="timer-bar" style={{ width: `${pct}%` }} />
        <span className="timer-text">
          {myTurn ? `你的回合 ${remain}s` : `等待 ${currentName ?? ''} 出牌 ${remain}s`}
        </span>
      </div>
      {myTurn && (
        <div className="turn-buttons">
          <button className="primary" disabled={placedCount === 0} onClick={() => act('game:endTurn')}>
            出牌{placedCount > 0 ? `(${placedCount} 張)` : ''}
          </button>
          <button onClick={() => act('game:draw')}>抽牌並跳過</button>
          <button className="small" disabled={placedCount === 0} onClick={() => act('game:reset')}>
            還原
          </button>
        </div>
      )}
    </div>
  );
}
