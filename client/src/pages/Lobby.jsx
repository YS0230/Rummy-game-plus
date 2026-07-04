import React, { useState } from 'react';
import { useStore } from '../store.js';
import { connectAs, req } from '../socket.js';
import { randomNickname, randomRoomName } from '../names.js';

export default function Lobby() {
  const { lobby, name, setName, showToast, connected } = useStore();
  const [draft, setDraft] = useState(name || randomNickname());
  const [roomName, setRoomName] = useState(randomRoomName());
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [isPrivate, setIsPrivate] = useState(false);
  const [turnSeconds, setTurnSeconds] = useState(60);
  const [sortHint, setSortHint] = useState(true);
  const [code, setCode] = useState('');

  const ensureName = () => {
    const n = draft.trim();
    if (!n) {
      showToast('請先輸入暱稱', 'warn');
      return null;
    }
    setName(n);
    connectAs(n);
    return n;
  };

  const create = async () => {
    const n = ensureName();
    if (!n) return;
    const res = await req('lobby:create', {
      playerName: n,
      roomName: roomName.trim(),
      maxPlayers,
      isPrivate,
      turnSeconds,
      sortHint,
    });
    if (!res.ok) showToast(res.error, 'warn');
  };

  const join = async (roomId) => {
    const n = ensureName();
    if (!n) return;
    const res = await req('lobby:join', { playerName: n, roomId });
    if (!res.ok) showToast(res.error, 'warn');
  };

  const joinByCode = async () => {
    const n = ensureName();
    if (!n) return;
    const res = await req('lobby:joinByCode', { playerName: n, code: code.trim() });
    if (!res.ok) showToast(res.error, 'warn');
  };

  return (
    <div className="lobby">
      <h1>🀄 拉密 Rummikub 線上對戰</h1>

      <div className="card">
        <label>暱稱</label>
        <div className="row" style={{ margin: 0 }}>
          <input
            value={draft}
            maxLength={16}
            placeholder="輸入你的暱稱"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={ensureName}
          />
          <button className="small" title="隨機暱稱" onClick={() => setDraft(randomNickname())}>
            🎲 隨機
          </button>
        </div>
      </div>

      <div className="lobby-grid">
        <div className="card">
          <h2>建立房間</h2>
          <div className="row" style={{ margin: 0 }}>
            <input
              value={roomName}
              maxLength={30}
              placeholder="房間名稱(選填)"
              onChange={(e) => setRoomName(e.target.value)}
            />
            <button
              className="small"
              title="隨機房名"
              onClick={() => setRoomName(randomRoomName())}
            >
              🎲 隨機
            </button>
          </div>
          <div className="row">
            <label>人數上限</label>
            <select value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              私人房(僅限代碼加入)
            </label>
          </div>
          <div className="row">
            <label>每回合秒數</label>
            <select value={turnSeconds} onChange={(e) => setTurnSeconds(Number(e.target.value))}>
              <option value={30}>30 秒</option>
              <option value={45}>45 秒</option>
              <option value={60}>1 分鐘(預設)</option>
              <option value={90}>1.5 分鐘</option>
              <option value={120}>2 分鐘</option>
              <option value={180}>3 分鐘</option>
            </select>
          </div>
          <div className="row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={sortHint}
                onChange={(e) => setSortHint(e.target.checked)}
              />
              排序後閃爍提示手牌中可組成的牌組
            </label>
          </div>
          <button className="primary" onClick={create}>
            建立房間
          </button>

          <h2 style={{ marginTop: 20 }}>用代碼加入</h2>
          <div className="row">
            <input
              value={code}
              maxLength={6}
              placeholder="房間代碼"
              style={{ textTransform: 'uppercase' }}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinByCode()}
            />
            <button onClick={joinByCode}>加入</button>
          </div>
        </div>

        <div className="card">
          <h2>公開房間 {connected ? '' : '(輸入暱稱後連線)'}</h2>
          {lobby.length === 0 && <p className="muted">目前沒有公開房間,建立一個吧!</p>}
          <ul className="room-list">
            {lobby.map((r) => (
              <li key={r.id}>
                <span className="room-name">{r.name}</span>
                <span className="muted">
                  {r.playerCount}/{r.maxPlayers} · {r.status === 'waiting' ? '等待中' : '遊戲中'}
                </span>
                <button
                  disabled={r.status !== 'waiting' || r.playerCount >= r.maxPlayers}
                  onClick={() => join(r.id)}
                >
                  加入
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
