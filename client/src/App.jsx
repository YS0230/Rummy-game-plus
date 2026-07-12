import React, { useEffect } from 'react';
import { useStore, bindSocket } from './store.js';
import { socket, connectAs } from './socket.js';
import Lobby from './pages/Lobby.jsx';
import Room from './pages/Room.jsx';
import GameBoard from './pages/GameBoard.jsx';

let bound = false;

export default function App() {
  const { room, results, toasts, name, connected, chatPops, setChatOpen } = useStore();

  useEffect(() => {
    if (!bound) {
      bound = true;
      bindSocket();
    }
    if (name) connectAs(name);
    return () => {};
  }, []);

  let page;
  if (!room) page = <Lobby />;
  else if (room.status === 'playing' || results) page = <GameBoard />;
  else page = <Room />;

  return (
    <div className="app">
      {page}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
      <div className="chat-pop-stack">
        {chatPops.map((p) => (
          <button key={p.id} className="chat-pop" onClick={() => setChatOpen(true)}>
            <span className="chat-pop-name">{p.name}</span>
            <span className="chat-pop-text">{p.text}</span>
          </button>
        ))}
      </div>
      {name && !connected && socket.active !== false && (
        <div className="conn-banner">連線中斷,重新連線中…</div>
      )}
    </div>
  );
}
