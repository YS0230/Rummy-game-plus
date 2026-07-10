import { solve, layoutSteps } from '../../../shared/solver.js';

const BOT_DELAY_MS = 1200; // 假裝思考;需小於最短回合秒數(15s)

/**
 * 電腦玩家驅動器:掛在 Game 的 onTurn 回呼上,輪到 bot 時延遲後自動出牌。
 * 出牌以 layoutSteps 逐張放置(每步一次 applyLayout 廣播),其他玩家看得到過程。
 * 失敗層層降級:solve 無解 → 抽牌跳過;applyLayout/endTurn 意外失敗 → 抽牌跳過;
 * 最壞情況由 Game 的回合計時器 autoPass 兜底,bot 永遠不會卡住回合。
 */
export class BotDriver {
  /** botLevelOf(playerId) -> 'hard' | null(非 bot) */
  constructor(game, botLevelOf, { delayMs = BOT_DELAY_MS, stepMs = null } = {}) {
    this.game = game;
    this.botLevelOf = botLevelOf;
    this.delayMs = delayMs;
    this.stepMs = stepMs; // null = 依回合秒數自動計算
    this.timer = null;
  }

  onTurn(playerId) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.botLevelOf(playerId)) return;
    this.timer = setTimeout(() => this.play(playerId), this.delayMs);
  }

  play(playerId) {
    const game = this.game;
    if (game.over || playerId !== game.currentPlayerId) return;
    try {
      const result = solve(
        {
          rack: game.racks.get(playerId),
          table: game.table,
          hasMelded: game.hasMelded.has(playerId),
        },
        { level: this.botLevelOf(playerId) }
      );
      if (!result) return void game.drawAndPass(playerId);
      const steps = layoutSteps(result.sets, result.placedTileIds);
      // 逐張步距:整段放置控制在回合時間的一半內
      const budget = game.turnSeconds * 1000 * 0.5;
      const stepMs =
        this.stepMs ?? Math.max(150, Math.min(600, Math.floor(budget / steps.length)));
      this.applyStep(playerId, steps, 0, stepMs);
    } catch {
      if (!game.over && playerId === game.currentPlayerId) game.drawAndPass(playerId);
    }
  }

  applyStep(playerId, steps, i, stepMs) {
    const game = this.game;
    if (game.over || playerId !== game.currentPlayerId) return;
    try {
      if (i >= steps.length) {
        if (!game.endTurn(playerId).ok) game.drawAndPass(playerId);
        return;
      }
      if (!game.applyLayout(playerId, steps[i]).ok) return void game.drawAndPass(playerId);
      this.timer = setTimeout(() => this.applyStep(playerId, steps, i + 1, stepMs), stepMs);
    } catch {
      if (!game.over && playerId === game.currentPlayerId) game.drawAndPass(playerId);
    }
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
