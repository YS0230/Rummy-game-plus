import React, { useState } from 'react';

export default function RulesHelp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="small" onClick={() => setOpen(true)}>
        📖 規則
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal rules-modal" onClick={(e) => e.stopPropagation()}>
            <h2>📖 拉密規則說明</h2>
            <div className="rules-body">
              <h3>目標</h3>
              <p>最先把手牌全部出完的人獲勝。</p>
              <h3>合法牌組(至少 3 張)</h3>
              <ul>
                <li>
                  <b>群組</b>:同數字、不同顏色,3–4 張(例:紅7 藍7 黑7)
                </li>
                <li>
                  <b>順子</b>:同顏色、連續數字(例:藍4 藍5 藍6)
                </li>
                <li>
                  <b>鬼牌 ☺</b>:可代替任何一張磚
                </li>
              </ul>
              <h3>首攤</h3>
              <p>
                第一次出牌必須全部來自自己的手牌,且點數合計 <b>至少 30 點</b>
                ;首攤前不能移動桌面上的牌。
              </p>
              <h3>回合流程(限時 60 秒)</h3>
              <ul>
                <li>把手牌拖到桌面組成新牌組,或(首攤後)自由重組桌面既有牌組</li>
                <li>按「出牌」提交:若有牌組不合法會紅色閃爍提醒,可繼續調整再出</li>
                <li>時間到仍未完成合法出牌,將自動還原並罰抽 1 張</li>
                <li>無法出牌就按「抽牌並跳過」抽 1 張結束回合</li>
                <li>桌面既有的牌不能收回手中;本回合放上的牌(虛線框)可以收回</li>
              </ul>
              <h3>計分</h3>
              <p>
                有人出完牌時,其他玩家依手上剩餘磚點數扣分(鬼牌 30 點),勝者獲得眾人扣分總和。
              </p>
            </div>
            <button className="primary" onClick={() => setOpen(false)}>
              知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
}
