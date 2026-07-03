import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { req } from '../socket.js';

export default function Chat({ defaultOpen = true }) {
  const { chat, playerId } = useStore();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(defaultOpen);
  const [seenCount, setSeenCount] = useState(chat.length);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
    if (open) setSeenCount(chat.length);
  }, [chat, open]);

  const unread = Math.max(0, chat.length - seenCount);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    req('chat:send', { text: t });
    setText('');
  };

  if (!open) {
    return (
      <button className="chat-toggle" onClick={() => setOpen(true)}>
        💬 聊天
        {unread > 0 && <span className="chat-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
    );
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <span>💬 聊天室</span>
        <button className="small" onClick={() => setOpen(false)}>
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
