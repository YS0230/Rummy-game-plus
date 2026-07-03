// 3D 模式的手牌工具列(排序按鈕等,對應舊版 Rack 的 rack-tools)
import React from 'react';
import { useStore } from '../store.js';

export default function RackHud({ myTurn }) {
  const { hand, sortHand } = useStore();
  return (
    <div className="rack-hud">
      <span className="muted">手牌 {hand.length} 張</span>
      {myTurn && <span className="turn-tag">🎯 你的回合</span>}
      <button className="small" onClick={() => sortHand('color')}>
        依色排序
      </button>
      <button className="small" onClick={() => sortHand('num')}>
        依數字排序
      </button>
    </div>
  );
}
