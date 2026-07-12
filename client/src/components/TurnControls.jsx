import React from 'react';
import { useStore } from '../store.js';
import { req } from '../socket.js';
import { sounds } from '../sounds.js';
import { solve, layoutSteps } from '../../../shared/solver.js';

const rand = (a, b) => a + Math.random() * (b - a);
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * 產生「像真人」的逐張放置步距:偏慢、有抖動、偶爾長考,總時長不超過 budgetMs。
 * 目的是避免固定節奏被其他玩家看出是 AI 代打。
 */
function humanStepDelays(n, budgetMs) {
  const base = Math.max(260, Math.min(900, Math.floor(budgetMs / Math.max(1, n))));
  const raw = Array.from({ length: n }, () =>
    // 偏慢:抖動區間偏向 1x 以上;15% 機率追加一次「猶豫」
    base * rand(0.7, 1.6) + (Math.random() < 0.15 ? rand(400, 1000) : 0)
  );
  const sum = raw.reduce((a, b) => a + b, 0);
  const scale = sum > budgetMs ? budgetMs / sum : 1;
  return raw.map((d) => Math.round(d * scale));
}

export default function TurnControls({ myTurn }) {
  const { game, showToast, flagInvalidSets, aiUnlocked, aiAuto, setAiAuto } = useStore();
  const [aiBusy, setAiBusy] = React.useState(false);

  const placedCount = game.placedTileIds?.length ?? 0;

  const act = async (event, payload) => {
    const res = await req(event, payload);
    if (!res.ok && res.error) {
      showToast(res.error, 'warn');
      sounds.error();
      if (res.invalidSetIds?.length) flagInvalidSets(res.invalidSetIds);
    }
  };

  // AI 代出牌:還原到回合初始 → 本地 solver 計算 → 走既有 layout + endTurn,無解則抽牌
  const aiPlay = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    try {
      const reset = await req('game:reset');
      if (!reset.ok) return;
      const { hand, game: g, playerId } = useStore.getState();
      const me = g?.players?.find((p) => p.playerId === playerId);
      if (!me) return;
      const result = solve(
        { rack: hand, table: g.table, hasMelded: me.hasMelded },
        { level: 'hard', timeBudgetMs: 150 }
      );
      if (!result) {
        showToast('AI 找不到可出的牌,改為抽牌');
        await wait(rand(1500, 3500)); // 不要秒抽,看起來像有想過
        return act('game:draw');
      }
      // 逐張放置(每步一次 layout,全桌看得到過程);步距隨機且偏慢,整段留在回合時間內
      const steps = layoutSteps(result.sets, result.placedTileIds);
      const turnMs = (g.turnSeconds ?? 60) * 1000;
      const think = Math.min(turnMs * 0.15, rand(1200, 3200)); // 出第一張前先「想一下」
      await wait(think);
      // 0.65:扣掉思考與收尾停頓後仍有餘裕,15 秒的短回合也不會被計時器強制 autoPass
      const delays = humanStepDelays(steps.length, Math.max(0, turnMs * 0.65 - think));
      for (let i = 0; i < steps.length; i++) {
        const r = await req('game:layout', { sets: steps[i] });
        if (!r.ok) return act('game:draw');
        await wait(delays[i]);
      }
      await wait(rand(300, 900)); // 按「出牌」前的停頓
      await act('game:endTurn');
    } finally {
      setAiBusy(false);
    }
  };

  // 自動模式:輪到自己時自動代打(myTurn 變 false 或關閉時取消排程);啟動延遲也隨機
  const aiPlayRef = React.useRef(aiPlay);
  aiPlayRef.current = aiPlay;
  React.useEffect(() => {
    if (!aiAuto || !aiUnlocked || !myTurn || aiBusy) return;
    const t = setTimeout(() => aiPlayRef.current(), rand(600, 2400));
    return () => clearTimeout(t);
  }, [aiAuto, aiUnlocked, myTurn, aiBusy]);

  return (
    <div className="turn-controls">
      <div className="turn-buttons">
        <button
          className="primary"
          disabled={!myTurn || placedCount === 0}
          onClick={() => act('game:endTurn')}
        >
          出牌{myTurn && placedCount > 0 ? `(${placedCount} 張)` : ''}
        </button>
        <button disabled={!myTurn} onClick={() => act('game:draw')}>
          抽牌並跳過
        </button>
        <button className="small" disabled={!myTurn} onClick={() => act('game:reset')}>
          還原
        </button>
        {aiUnlocked && (
          <>
            <button
              className="small"
              disabled={!myTurn || aiBusy}
              title="AI 自動計算並代你出牌;找不到可出的牌時自動抽牌"
              onClick={aiPlay}
            >
              🤖 AI 代出牌
            </button>
            <label className="checkbox small" title="每回合輪到你時自動由 AI 代打">
              <input
                type="checkbox"
                checked={aiAuto}
                onChange={(e) => setAiAuto(e.target.checked)}
              />
              自動
            </label>
          </>
        )}
      </div>
    </div>
  );
}
