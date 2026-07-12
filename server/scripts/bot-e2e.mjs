// Bot 端對端驗證:真人建房 → 加/移電腦玩家 → 開始 → 觀察 bot 自動出牌
// 用法:先啟動伺服器,再 node bot-e2e.mjs
import { io } from 'socket.io-client';

const URL = process.env.URL || 'http://localhost:3001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
};

function connect(playerId, name) {
  return new Promise((resolve, reject) => {
    const s = io(URL, { auth: { playerId, name }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}
const req = (s, event, payload) =>
  new Promise((r) => s.emit(event, payload, (res) => r(res ?? { ok: true })));

const A = await connect('e2e-bot-host', '房主');

// 建房 + 加入/移除電腦玩家
const create = await req(A, 'lobby:create', { roomName: 'bot測試房', maxPlayers: 3, isPrivate: true, turnSeconds: 15 });
check(create.ok, '建房成功');

let roomState = null;
A.on('room:update', (r) => (roomState = r));

const notHostErr = await req(A, 'room:removeBot', { playerId: 'nope' });
check(!notHostErr.ok, '移除不存在的 bot 回錯誤');

check((await req(A, 'room:addBot')).ok, '加入電腦玩家(未指定速度)');
check((await req(A, 'room:addBot', { speed: 'fast' })).ok, '加入電腦玩家(快速)');
await sleep(200);
const bots = roomState.players.filter((p) => p.isBot);
check(bots.length === 2, 'room:update 帶出 2 個 bot');
check(bots.every((p) => p.ready && p.connected), 'bot 恆為已準備且在線');
check(bots.every((p) => p.botLevel === 'hard'), 'botLevel 恆為 hard');
check(bots[0].botSpeed === 'slow', '未指定速度 → 預設慢');
check(bots[1].botSpeed === 'fast', '指定 fast → botSpeed=fast');
const full = await req(A, 'room:addBot');
check(!full.ok && /已滿/.test(full.error), '滿員時無法再加 bot');

check((await req(A, 'room:removeBot', { playerId: bots[0].playerId })).ok, '移除 bot');
await sleep(200);
check(roomState.players.filter((p) => p.isBot).length === 1, '移除後剩 1 個 bot');

// 開始遊戲:1 真人 + 1 bot
const botTurnResults = [];
let hand = [];
let state = null;
A.on('game:hand', (h) => (hand = h));
A.on('game:state', (s) => (state = s));
A.on('game:turnResult', (r) => {
  if (String(r.playerId).startsWith('bot-')) botTurnResults.push(r);
});

const start = await req(A, 'room:start');
check(start.ok, '1 真人 + 1 bot 可開始遊戲');
await sleep(300);
check(state && state.players.length === 2, 'game:state 有 2 位玩家');

// 輪到真人就抽牌跳過;觀察 bot 自動動作,直到 bot 完成首攤出牌(最多 ~60 秒)
const botMelded = () =>
  !!state?.players.find((p) => String(p.playerId).startsWith('bot-'))?.hasMelded;
for (let i = 0; i < 120 && !state?.over && !botMelded(); i++) {
  if (state && state.current === 'e2e-bot-host' && !state.over) {
    await req(A, 'game:draw');
  }
  await sleep(500);
}
check(botTurnResults.length >= 1, `bot 自動動作 ${botTurnResults.length} 次(出牌或抽牌)`);
check(botMelded() || state?.over, 'bot 完成首攤出牌(或已分出勝負)');
const played = botTurnResults.filter((r) => /出牌成功/.test(r.message));
console.log(`INFO  bot 出牌 ${played.length} 次,樣本: ${botTurnResults.slice(-5).map((r) => r.message).join(' | ')}`);

// 真人離開 → 房內只剩 bot → 遊戲結束、房間銷毀
await req(A, 'room:leave');
await sleep(300);
const rejoin = await req(A, 'lobby:joinByCode', { code: roomState.code });
check(!rejoin.ok, '真人離開後房間已銷毀(無法再以代碼加入)');

A.disconnect();
console.log(failed === 0 ? '\n全部通過' : `\n${failed} 項失敗`);
process.exit(failed === 0 ? 0 : 1);
