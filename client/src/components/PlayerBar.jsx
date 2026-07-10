import React from 'react';
import { useStore } from '../store.js';
import { req } from '../socket.js';
import { useSecretTaps } from '../useSecretTaps.js';
import RulesHelp from './RulesHelp.jsx';
import BgmToggle from './BgmToggle.jsx';

export default function PlayerBar({ onFullscreen }) {
  const { game, playerId, room, chat, chatOpen, chatSeen, setChatOpen, showToast } = useStore();
  const unread = Math.max(0, chat.length - chatSeen);

  // 隱藏功能:2 秒內連點房間名稱 5 次,切換 AI 代出牌
  const onRoomTag = useSecretTaps(() => {
    const on = useStore.getState().toggleAiUnlocked();
    showToast(on ? 'AI 代出牌已開啟' : 'AI 代出牌已隱藏');
  });

  const leaveGame = async () => {
    if (!window.confirm('確定要離開遊戲嗎?這將視為棄局,無法回來。')) return;
    await req('room:leave');
    useStore.setState({ room: null, chat: [], game: null, hand: [], results: null, staging: [] });
  };

  return (
    <div className="player-bar">
      <div className="player-bar-left">
        <span className="room-tag" onClick={onRoomTag}>{room?.name}</span>
        <span className="muted">牌堆 {game.poolCount}</span>
        <RulesHelp />
        <BgmToggle />
        {!chatOpen && (
          <button className="small chat-bar-btn" onClick={() => setChatOpen(true)}>
            💬
            {unread > 0 && <span className="chat-badge">{unread > 99 ? '99+' : unread}</span>}
          </button>
        )}
        {onFullscreen && (
          <button className="small" title="全螢幕(隱藏頂部資訊列)" onClick={onFullscreen}>
            ⛶
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
              {room?.players?.find((x) => x.playerId === p.playerId)?.isBot && '🤖 '}
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
