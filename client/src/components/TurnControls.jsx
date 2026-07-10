import React from 'react';
import { useStore } from '../store.js';
import { req } from '../socket.js';
import { sounds } from '../sounds.js';
import { solve, layoutSteps } from '../../../shared/solver.js';

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
        return act('game:draw');
      }
      // 逐張放置(每步一次 layout,全桌看得到過程),整段控制在回合時間的一半內
      const steps = layoutSteps(result.sets, result.placedTileIds);
      const budget = (g.turnSeconds ?? 60) * 1000 * 0.5;
      const stepMs = Math.max(300, Math.min(800, Math.floor(budget / steps.length)));
      for (const sets of steps) {
        const r = await req('game:layout', { sets });
        if (!r.ok) return act('game:draw');
        await new Promise((done) => setTimeout(done, stepMs));
      }
      await act('game:endTurn');
    } finally {
      setAiBusy(false);
    }
  };

  // 自動模式:輪到自己時自動代打(myTurn 變 false 或關閉時取消排程)
  const aiPlayRef = React.useRef(aiPlay);
  aiPlayRef.current = aiPlay;
  React.useEffect(() => {
    if (!aiAuto || !aiUnlocked || !myTurn || aiBusy) return;
    const t = setTimeout(() => aiPlayRef.current(), 800);
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
