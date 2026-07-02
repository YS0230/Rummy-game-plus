import React from 'react';
import { useStore } from '../store.js';
import { req } from '../socket.js';
import Chat from '../components/Chat.jsx';

export default function Room() {
  const { room, playerId, showToast } = useStore();
  const me = room.players.find((p) => p.playerId === playerId);
  const isHost = room.hostId === playerId;
  const allReady = room.players.every((p) => p.ready && p.connected);

  const toggleReady = () => req('room:ready', { ready: !me.ready });

  const start = async () => {
    const res = await req('room:start');
    if (!res.ok) showToast(res.error, 'warn');
  };

  const leave = async () => {
    await req('room:leave');
    useStore.setState({ room: null, chat: [], game: null, hand: [], results: null });
  };

  return (
    <div className="room-page">
      <div className="room-main">
        <div className="card">
          <div className="room-head">
            <h1>{room.name}</h1>
            <div className="room-code">
              房間代碼:<b>{room.code}</b>
              <button
                className="small"
                onClick={() => {
                  navigator.clipboard?.writeText(room.code);
                  showToast('已複製代碼');
                }}
              >
                複製
              </button>
            </div>
          </div>
          <p className="muted">
            {room.players.length}/{room.maxPlayers} 位玩家 ·{' '}
            {room.isPrivate ? '私人房' : '公開房'}
          </p>

          <ul className="player-list">
            {room.players.map((p) => (
              <li key={p.playerId} className={p.connected ? '' : 'offline'}>
                <span className="player-name">
                  {p.name}
                  {p.playerId === room.hostId && ' 👑'}
                  {p.playerId === playerId && '(你)'}
                </span>
                <span className={`badge ${p.ready ? 'ready' : ''}`}>
                  {!p.connected ? '斷線' : p.ready ? '已準備' : '未準備'}
                </span>
              </li>
            ))}
            {Array.from({ length: room.maxPlayers - room.players.length }).map((_, i) => (
              <li key={`empty-${i}`} className="empty-seat">
                等待玩家加入…
              </li>
            ))}
          </ul>

          <div className="row" style={{ marginTop: 16 }}>
            {isHost ? (
              <button
                className="primary"
                disabled={room.players.length < 2 || !allReady}
                onClick={start}
              >
                開始遊戲{room.players.length < 2 ? '(需 2 人以上)' : !allReady ? '(等待準備)' : ''}
              </button>
            ) : (
              <button className={me?.ready ? '' : 'primary'} onClick={toggleReady}>
                {me?.ready ? '取消準備' : '準備'}
              </button>
            )}
            <button className="danger" onClick={leave}>
              離開房間
            </button>
          </div>
        </div>
      </div>
      <Chat />
    </div>
  );
}
