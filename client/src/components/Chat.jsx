import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { req } from '../socket.js';

/**
 * floatingToggle:收合時是否顯示右下角浮動按鈕。
 * 遊戲頁傳 false(改由 PlayerBar 的按鈕開啟,避免蓋住手牌)。
 */
export default function Chat({ floatingToggle = true }) {
  const { chat, playerId, chatOpen, chatSeen, setChatOpen } = useStore();
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
    if (chatOpen) useStore.setState({ chatSeen: chat.length });
  }, [chat, chatOpen]);

  const unread = Math.max(0, chat.length - chatSeen);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    req('chat:send', { text: t });
    setText('');
  };

  if (!chatOpen) {
    if (!floatingToggle) return null;
    return (
      <button className="chat-toggle" onClick={() => setChatOpen(true)}>
        💬 聊天
        {unread > 0 && <span className="chat-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
    );
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <span>💬 聊天室</span>
        <button className="small" onClick={() => setChatOpen(false)}>
          收合
        </button>
      </div>
      <div className="chat-list" ref={listRef}>
        {chat.map((m, i) =>
          m.system ? (
            <div key={i} className="chat-system">
              {m.text}
            </div>
          ) : (
            <div key={i} className={`chat-msg ${m.playerId === playerId ? 'mine' : ''}`}>
              <span className="chat-name">{m.name}</span>
              <span className="chat-text">{m.text}</span>
            </div>
          )
        )}
      </div>
      <div className="chat-input">
        <input
          value={text}
          maxLength={300}
          placeholder="輸入訊息…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button onClick={send}>送出</button>
      </div>
    </div>
  );
}
