import { solve, layoutSteps } from '../../../shared/solver.js';

/**
 * 出牌速度檔位:delayMs = 輪到自己後的「假裝思考」時間;min/maxStepMs = 逐張放置的步距範圍。
 * normal 等同舊有的固定行為;預設為 slow。所有檔位仍受 play() 的總時長上限保護。
 */
export const BOT_SPEEDS = {
  fast: { delayMs: 500, minStepMs: 80, maxStepMs: 250 },
  normal: { delayMs: 1200, minStepMs: 150, maxStepMs: 600 },
  slow: { delayMs: 2500, minStepMs: 400, maxStepMs: 1100 },
};
export const DEFAULT_BOT_SPEED = 'slow';
export const isBotSpeed = (s) => Object.prototype.hasOwnProperty.call(BOT_SPEEDS, s);

/**
 * 電腦玩家驅動器:掛在 Game 的 onTurn 回呼上,輪到 bot 時延遲後自動出牌。
 * 出牌以 layoutSteps 逐張放置(每步一次 applyLayout 廣播),其他玩家看得到過程。
 * 失敗層層降級:solve 無解 → 抽牌跳過;applyLayout/endTurn 意外失敗 → 抽牌跳過;
 * 最壞情況由 Game 的回合計時器 autoPass 兜底,bot 永遠不會卡住回合。
 */
export class BotDriver {
  /**
   * botLevelOf(playerId) -> 'hard' | null(非 bot)
   * options.botSpeedOf(playerId) -> 'fast'|'normal'|'slow';未給時用 DEFAULT_BOT_SPEED。
   * options.delayMs / options.stepMs 若給了就覆蓋速度檔位(測試用)。
   */
  constructor(game, botLevelOf, { delayMs = null, stepMs = null, botSpeedOf = null } = {}) {
    this.game = game;
    this.botLevelOf = botLevelOf;
    this.botSpeedOf = botSpeedOf;
    this.delayMs = delayMs; // null = 依速度檔位
    this.stepMs = stepMs; // null = 依速度檔位 + 回合秒數計算
    this.timer = null;
  }

  speedOf(playerId) {
    const key = this.botSpeedOf?.(playerId);
    return BOT_SPEEDS[key] ?? BOT_SPEEDS[DEFAULT_BOT_SPEED];
  }

  onTurn(playerId) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.botLevelOf(playerId)) return;
    const delay = this.delayMs ?? this.speedOf(playerId).delayMs;
    this.timer = setTimeout(() => this.play(playerId), delay);
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
      this.applyStep(playerId, steps, 0, this.stepMsFor(playerId, steps.length));
    } catch {
      if (!game.over && playerId === game.currentPlayerId) game.drawAndPass(playerId);
    }
  }

  /** 逐張步距:整段放置控制在回合時間的一半內,且思考+放置不超過回合的 70%(慢速 + 短回合的保護) */
  stepMsFor(playerId, stepCount) {
    if (this.stepMs != null) return this.stepMs;
    const speed = this.speedOf(playerId);
    const turnMs = this.game.turnSeconds * 1000;
    const n = Math.max(1, stepCount);
    let ms = Math.max(
      speed.minStepMs,
      Math.min(speed.maxStepMs, Math.floor((turnMs * 0.5) / n))
    );
    const hardCap = Math.floor((turnMs * 0.7 - speed.delayMs) / n);
    return Math.max(60, Math.min(ms, hardCap));
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
