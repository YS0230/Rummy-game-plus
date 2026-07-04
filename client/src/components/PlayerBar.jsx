import React from 'react';
import { useStore } from '../store.js';
import { req } from '../socket.js';
import RulesHelp from './RulesHelp.jsx';

export default function PlayerBar() {
  const { game, playerId, room, chat, chatOpen, chatSeen, setChatOpen } = useStore();
  const unread = Math.max(0, chat.length - chatSeen);

  const leaveGame = async () => {
    if (!window.confirm('確定要離開遊戲嗎?這將視為棄局,無法回來。')) return;
    await req('room:leave');
    useStore.setState({ room: null, chat: [], game: null, hand: [], results: null, staging: [] });
  };

  return (
    <div className="player-bar">
      <div className="player-bar-left">
        <span className="room-tag">{room?.name}</span>
        <span className="muted">牌堆 {game.poolCount}</span>
        <RulesHelp />
        {!chatOpen && (
          <button className="small chat-bar-btn" onClick={() => setChatOpen(true)}>
            💬
            {unread > 0 && <span className="chat-badge">{unread > 99 ? '99+' : unread}</span>}
          </button>
        )}
        <button className="small danger" onClick={leaveGame}>
          🚪
        </button>
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
