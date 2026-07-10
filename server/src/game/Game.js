import {
  isValidSet,
  setScore,
  rackPenalty,
  INITIAL_MELD_MIN,
} from '../../../shared/validator.js';
import { createTiles, shuffle } from './tiles.js';

const TURN_SECONDS = 60;
const HAND_SIZE = 14;
const DISCONNECT_SKIP_MS = 3000;

/**
 * 一局 Rummikub。
 * callbacks: { broadcast(event,data), toPlayer(playerId,event,data), isConnected(playerId), onGameOver(results), onTurn?(playerId) }
 * options: { turnSeconds } 每回合秒數(房間建立時設定,預設 60)
 */
export class Game {
  constructor(players, callbacks, options = {}) {
    this.cb = callbacks;
    this.turnSeconds = Math.min(300, Math.max(15, Number(options.turnSeconds) || TURN_SECONDS));
    this.order = players.map((p) => p.playerId);
    this.names = new Map(players.map((p) => [p.playerId, p.name]));
    const deck = shuffle(createTiles());
    this.tileById = new Map(deck.map((t) => [t.id, t]));
    this.racks = new Map();
    for (const pid of this.order) this.racks.set(pid, deck.splice(0, HAND_SIZE));
    this.pool = deck;
    this.table = []; // [{ id, tiles: [tile] }]
    this.hasMelded = new Set();
    this.turnIndex = -1;
    this.turnDeadline = null;
    this.winner = null;
    this.over = false;
    // 回合暫定狀態
    this.snapshotTable = [];
    this.provisionalTable = [];
    this.provisionalRack = null;
    this.turnTimer = null;
    this.skipTimer = null;
  }

  start() {
    for (const pid of this.order) this.sendHand(pid);
    this.nextTurn();
  }

  get currentPlayerId() {
    return this.order[this.turnIndex];
  }

  // ---------- 狀態快照/廣播 ----------

  cloneTable(table) {
    return table.map((s) => ({ id: s.id, tiles: [...s.tiles] }));
  }

  tableIds(table) {
    const ids = new Set();
    for (const s of table) for (const t of s.tiles) ids.add(t.id);
    return ids;
  }

  placedThisTurn() {
    const snap = this.tableIds(this.snapshotTable);
    const ids = [];
    for (const id of this.tableIds(this.provisionalTable)) {
      if (!snap.has(id)) ids.push(id);
    }
    return ids;
  }

  publicState() {
    return {
      table: this.provisionalTable,
      poolCount: this.pool.length,
      players: this.order.map((pid) => ({
        playerId: pid,
        name: this.names.get(pid),
        rackCount:
          pid === this.currentPlayerId && this.provisionalRack
            ? this.provisionalRack.length
            : this.racks.get(pid).length,
        hasMelded: this.hasMelded.has(pid),
        connected: this.cb.isConnected(pid),
      })),
      current: this.currentPlayerId ?? null,
      turnDeadline: this.turnDeadline,
      turnSeconds: this.turnSeconds,
      placedTileIds: this.placedThisTurn(),
      over: this.over,
    };
  }

  broadcastState() {
    this.cb.broadcast('game:state', this.publicState());
  }

  handOf(playerId) {
    if (playerId === this.currentPlayerId && this.provisionalRack) {
      return this.provisionalRack;
    }
    return this.racks.get(playerId) ?? [];
  }

  sendHand(playerId) {
    this.cb.toPlayer(playerId, 'game:hand', this.handOf(playerId));
  }

  // ---------- 回合流程 ----------

  nextTurn() {
    if (this.over) return;
    this.clearTimers();
    this.turnIndex = (this.turnIndex + 1) % this.order.length;
    this.snapshotTable = this.cloneTable(this.table);
    this.provisionalTable = this.cloneTable(this.table);
    this.provisionalRack = [...this.racks.get(this.currentPlayerId)];
    this.turnDeadline = Date.now() + this.turnSeconds * 1000;
    this.turnTimer = setTimeout(() => this.onTimeout(), this.turnSeconds * 1000);
    if (!this.cb.isConnected(this.currentPlayerId)) {
      this.skipTimer = setTimeout(() => {
        if (!this.over && !this.cb.isConnected(this.currentPlayerId)) {
          this.autoPass('斷線,自動抽牌跳過');
        }
      }, DISCONNECT_SKIP_MS);
    }
    this.broadcastState();
    this.cb.onTurn?.(this.currentPlayerId);
  }

  clearTimers() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.skipTimer) clearTimeout(this.skipTimer);
    this.turnTimer = null;
    this.skipTimer = null;
  }

  onTimeout() {
    this.autoPass('時間到,自動還原並抽牌');
  }

  autoPass(reason) {
    const pid = this.currentPlayerId;
    this.revertProvisional();
    const drawn = this.drawTile(pid);
    if (drawn) this.cb.toPlayer(pid, 'game:drew', drawn);
    this.cb.broadcast('game:turnResult', {
      playerId: pid,
      ok: false,
      auto: true,
      message: `${this.names.get(pid)} ${reason}`,
    });
    this.sendHand(pid);
    this.nextTurn();
  }

  revertProvisional() {
    this.provisionalTable = this.cloneTable(this.snapshotTable);
    this.provisionalRack = [...this.racks.get(this.currentPlayerId)];
  }

  drawTile(playerId) {
    if (this.pool.length === 0) return null;
    const tile = this.pool.pop();
    this.racks.get(playerId).push(tile);
    // 抽牌者仍是當前玩家時,暫定手牌一併加入,sendHand 才拿得到新磚
    if (playerId === this.currentPlayerId && this.provisionalRack) {
      this.provisionalRack.push(tile);
    }
    return tile;
  }

  // ---------- 玩家動作 ----------

  /** 即時套用玩家的桌面佈局(每次拖放都呼叫),回傳 { ok, error } */
  applyLayout(playerId, layout) {
    if (this.over) return { ok: false, error: '遊戲已結束' };
    if (playerId !== this.currentPlayerId) return { ok: false, error: '不是你的回合' };
    if (!Array.isArray(layout)) return { ok: false, error: '格式錯誤' };

    const rackStart = this.racks.get(playerId);
    const allowed = this.tableIds(this.snapshotTable);
    for (const t of rackStart) allowed.add(t.id);

    const seen = new Set();
    const usedSetIds = new Set();
    const newTable = [];
    for (const set of layout) {
      if (!set || !Array.isArray(set.tileIds) || set.tileIds.length === 0) continue;
      const tiles = [];
      for (const id of set.tileIds) {
        if (seen.has(id) || !allowed.has(id) || !this.tileById.has(id)) {
          return { ok: false, error: '無效的磚' };
        }
        seen.add(id);
        tiles.push(this.tileById.get(id));
      }
      // 牌組 id 去重:重複 id 會讓前端「以 id 找牌組」的拖曳邏輯錯亂
      const base = String(set.id ?? `s-${newTable.length}`);
      let sid = base;
      for (let n = 1; usedSetIds.has(sid); n++) sid = `${base}~${n}`;
      usedSetIds.add(sid);
      newTable.push({ id: sid, tiles });
    }
    // 桌面既有磚不得收回
    for (const id of this.tableIds(this.snapshotTable)) {
      if (!seen.has(id)) return { ok: false, error: '桌面的磚不能收回' };
    }
    this.provisionalTable = newTable;
    this.provisionalRack = rackStart.filter((t) => !seen.has(t.id));
    this.broadcastState();
    this.sendHand(playerId);
    return { ok: true };
  }

  /** 還原回合開始狀態 */
  resetLayout(playerId) {
    if (this.over || playerId !== this.currentPlayerId) return { ok: false };
    this.revertProvisional();
    this.broadcastState();
    this.sendHand(playerId);
    return { ok: true };
  }

  /** 抽牌結束回合(放棄本回合擺放) */
  drawAndPass(playerId) {
    if (this.over || playerId !== this.currentPlayerId) return { ok: false, error: '不是你的回合' };
    this.revertProvisional();
    const tile = this.drawTile(playerId);
    if (tile) this.cb.toPlayer(playerId, 'game:drew', tile);
    this.cb.broadcast('game:turnResult', {
      playerId,
      ok: true,
      drew: true,
      message: `${this.names.get(playerId)} ${tile ? '抽了一張牌' : '跳過(牌堆已空)'}`,
    });
    this.sendHand(playerId);
    this.nextTurn();
    return { ok: true };
  }

  /**
   * 出牌:驗證暫定桌面。不合法時只回傳提示(含不合法牌組 id),
   * 回合繼續讓玩家調整;逾時才由計時器自動還原+罰抽。
   */
  endTurn(playerId) {
    if (this.over || playerId !== this.currentPlayerId) return { ok: false, error: '不是你的回合' };
    const placed = this.placedThisTurn();
    if (placed.length === 0) {
      return { ok: false, error: '尚未出牌,請出牌或抽牌' };
    }
    const invalid = (msg, invalidSetIds = []) => ({ ok: false, error: msg, invalidSetIds });

    const badSets = this.provisionalTable.filter((s) => !isValidSet(s.tiles));
    if (badSets.length > 0) {
      return invalid(
        `有 ${badSets.length} 組牌不符規則(需同色連號或同號異色,至少 3 張),請調整`,
        badSets.map((s) => s.id)
      );
    }

    if (!this.hasMelded.has(playerId)) {
      // 首攤:不可重組桌面,新牌組須全為自己手牌且合計 >= 30
      const snapSigs = new Set(
        this.snapshotTable.map((s) => [...s.tiles.map((t) => t.id)].sort().join(','))
      );
      const placedSet = new Set(placed);
      let score = 0;
      const mixedIds = [];
      for (const set of this.provisionalTable) {
        const sig = [...set.tiles.map((t) => t.id)].sort().join(',');
        if (snapSigs.has(sig)) {
          snapSigs.delete(sig);
          continue;
        }
        if (!set.tiles.every((t) => placedSet.has(t.id))) {
          mixedIds.push(set.id);
          continue;
        }
        score += setScore(set.tiles);
      }
      if (mixedIds.length > 0) return invalid('首攤前不能動用桌面既有的牌,請調整', mixedIds);
      if (snapSigs.size > 0) return invalid('首攤前不能重組桌面既有牌組,請按「還原」調整');
      if (score < INITIAL_MELD_MIN)
        return invalid(`首攤需至少 ${INITIAL_MELD_MIN} 點,目前只有 ${score} 點`);
      this.hasMelded.add(playerId);
    }

    // 提交
    this.table = this.cloneTable(this.provisionalTable);
    this.racks.set(playerId, [...this.provisionalRack]);
    this.cb.broadcast('game:turnResult', {
      playerId,
      ok: true,
      message: `${this.names.get(playerId)} 出牌成功(${placed.length} 張)`,
    });
    this.sendHand(playerId);

    if (this.racks.get(playerId).length === 0) {
      this.finish(playerId);
    } else {
      this.nextTurn();
    }
    return { ok: true };
  }

  /** 玩家永久離開(非斷線) */
  removePlayer(playerId) {
    const idx = this.order.indexOf(playerId);
    if (idx === -1 || this.over) return;
    const wasCurrent = playerId === this.currentPlayerId;
    this.order.splice(idx, 1);
    if (this.order.length === 1) {
      this.finish(this.order[0]);
      return;
    }
    if (wasCurrent) {
      this.revertProvisional();
      this.turnIndex = (idx - 1 + this.order.length) % this.order.length;
      this.nextTurn();
    } else {
      if (idx < this.turnIndex) this.turnIndex--;
      this.broadcastState();
    }
  }

  finish(winnerId) {
    this.over = true;
    this.winner = winnerId;
    this.clearTimers();
    this.turnDeadline = null;
    const results = this.order.map((pid) => {
      const penalty = pid === winnerId ? 0 : rackPenalty(this.racks.get(pid));
      return {
        playerId: pid,
        name: this.names.get(pid),
        isWinner: pid === winnerId,
        remaining: this.racks.get(pid).length,
        penalty,
      };
    });
    const totalPenalty = results.reduce((s, r) => s + r.penalty, 0);
    for (const r of results) r.score = r.isWinner ? totalPenalty : -r.penalty;
    this.broadcastState();
    this.cb.broadcast('game:over', { winnerId, results });
    this.cb.onGameOver(results);
  }

  dispose() {
    this.clearTimers();
    this.over = true;
  }
}
