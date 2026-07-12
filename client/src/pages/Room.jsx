import React from 'react';
import { useStore } from '../store.js';
import { req } from '../socket.js';
import { useSecretTaps } from '../useSecretTaps.js';
import Chat from '../components/Chat.jsx';

const SPEED_LABEL = { fast: '快', normal: '中', slow: '慢' };

export default function Room() {
  const { room, playerId, showToast } = useStore();

  // 隱藏功能:2 秒內連點房間名稱 5 次,切換 AI 代出牌
  const onRoomName = useSecretTaps(() => {
    const on = useStore.getState().toggleAiUnlocked();
    showToast(on ? 'AI 代出牌已開啟' : 'AI 代出牌已隱藏');
  });
  const me = room.players.find((p) => p.playerId === playerId);
  const isHost = room.hostId === playerId;
  const allReady = room.players.every((p) => p.ready && p.connected);

  const toggleReady = () => req('room:ready', { ready: !me.ready });

  const start = async () => {
    const res = await req('room:start');
    if (!res.ok) showToast(res.error, 'warn');
  };

  const [botSpeed, setBotSpeed] = React.useState('slow');

  const addBot = async () => {
    const res = await req('room:addBot', { speed: botSpeed });
    if (!res.ok) showToast(res.error, 'warn');
  };

  const removeBot = async (botPlayerId) => {
    const res = await req('room:removeBot', { playerId: botPlayerId });
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
            <h1 onClick={onRoomName}>{room.name}</h1>
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
            {room.isPrivate ? '私人房' : '公開房'} · 每回合 {room.turnSeconds ?? 60} 秒
            {room.sortHint ? ' · 排序提示:開' : ''}
          </p>

          <ul className="player-list">
            {room.players.map((p) => (
              <li key={p.playerId} className={p.connected ? '' : 'offline'}>
                <span className="player-name">
                  {p.isBot && '🤖 '}
                  {p.name}
                  {p.playerId === room.hostId && ' 👑'}
                  {p.playerId === playerId && '(你)'}
                  {p.isBot && p.botSpeed && (
                    <span className="muted"> · 出牌{SPEED_LABEL[p.botSpeed] ?? p.botSpeed}</span>
                  )}
                </span>
                <span className={`badge ${p.ready ? 'ready' : ''}`}>
                  {!p.connected ? '斷線' : p.ready ? '已準備' : '未準備'}
                </span>
                {isHost && p.isBot && (
                  <button
                    className="small danger"
                    title="移除電腦玩家"
                    onClick={() => removeBot(p.playerId)}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
            {Array.from({ length: room.maxPlayers - room.players.length }).map((_, i) => (
              <li key={`empty-${i}`} className="empty-seat">
                {isHost && i === 0 ? (
                  <span className="add-bot">
                    <button className="small" onClick={() => addBot()}>
                      ➕ 電腦
                    </button>
                    <select
                      className="small"
                      value={botSpeed}
                      title="電腦的出牌速度"
                      onChange={(e) => setBotSpeed(e.target.value)}
                    >
                      <option value="slow">慢</option>
                      <option value="normal">中</option>
                      <option value="fast">快</option>
                    </select>
                  </span>
                ) : (
                  '等待玩家加入…'
                )}
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
