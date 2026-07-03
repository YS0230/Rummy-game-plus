// 端到端模擬:兩位玩家 建房→加入→準備→開始→聊天→出牌/抽牌→斷線重連
// 用法:先啟動伺服器,再 node scripts/e2e.mjs
import { io } from 'socket.io-client';

const URL = 'http://localhost:3001';
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
const once = (s, event, timeout = 5000) =>
  new Promise((r) => {
    const t = setTimeout(() => r(null), timeout);
    s.once(event, (data) => {
      clearTimeout(t);
      r(data);
    });
  });
// 等到符合條件的事件(忽略中途其他同名事件)
const waitFor = (s, event, pred, timeout = 5000) =>
  new Promise((r) => {
    const t = setTimeout(() => {
      s.off(event, h);
      r(null);
    }, timeout);
    const h = (data) => {
      if (pred(data)) {
        clearTimeout(t);
        s.off(event, h);
        r(data);
      }
    };
    s.on(event, h);
  });

const A = await connect('e2e-player-a', '小明');
const B = await connect('e2e-player-b', '小華');

// 建房與大廳
const created = await req(A, 'lobby:create', { roomName: 'E2E測試房', maxPlayers: 2 });
check(created.ok, '建立房間');
const lobbyP = once(B, 'lobby:list', 2000);
B.emit('lobby:refresh');
const lobby = await lobbyP;
check(lobby?.some((r) => r.name === 'E2E測試房'), '大廳列表看得到公開房');

// B 加入
const joined = await req(B, 'lobby:join', { roomId: created.roomId });
check(joined.ok, 'B 加入房間');

// 聊天
const chatP = once(A, 'chat:message');
await req(B, 'chat:send', { text: '哈囉!' });
const chat = await chatP;
check(chat?.text === '哈囉!' && chat?.name === '小華', '聊天訊息廣播');

// 準備 + 開始
await req(B, 'room:ready', { ready: true });
const handA = once(A, 'game:hand');
const handB = once(B, 'game:hand');
const stateB = once(B, 'game:state');
const started = await req(A, 'room:start');
check(started.ok, '房主開始遊戲');
const [ha, hb, st] = await Promise.all([handA, handB, stateB]);
check(ha?.length === 14 && hb?.length === 14, '雙方各發 14 張手牌');
check(st?.players?.length === 2 && st?.poolCount === 106 - 28, '遊戲狀態正確');

// 當前玩家丟不合法佈局(單張)後結束回合 → 應被拒
const cur = st.current;
const curSock = cur === 'e2e-player-a' ? A : B;
const curHand = cur === 'e2e-player-a' ? ha : hb;
const othSock = cur === 'e2e-player-a' ? B : A;

const othStateP = once(othSock, 'game:state', 2000);
const lay = await req(curSock, 'game:layout', {
  sets: [{ id: 'x', tileIds: [curHand[0].id] }],
});
check(lay.ok, '即時佈局(單張)被接受為暫定狀態');
const othState = await othStateP;
check(
  othState?.table?.length === 1 && othState?.placedTileIds?.length === 1,
  '對手即時看到暫定桌面'
);
const end = await req(curSock, 'game:endTurn');
check(!end.ok, '不合法出牌被拒(單張非牌組)');
check(end.invalidSetIds?.length === 1 && end.invalidSetIds[0] === 'x', '回傳不合法牌組 id');
// 回合不強制結束,仍可調整;改為抽牌結束
const afterFailP = once(othSock, 'game:state', 2000);
const giveUp = await req(curSock, 'game:draw');
check(giveUp.ok, '改為抽牌結束回合');
const afterFail = await afterFailP;
check(afterFail?.current !== cur, '抽牌後輪到下一位');

// 用別人的磚 → 拒絕
const cur2 = afterFail.current;
const sock2 = cur2 === 'e2e-player-a' ? A : B;
const stolen = cur === 'e2e-player-a' ? ha : hb; // 上一位玩家的手牌
const bad = await req(sock2, 'game:layout', {
  sets: [{ id: 'x', tileIds: [stolen[1].id] }],
});
check(!bad.ok, '使用他人手牌被拒');

// 抽牌跳過
const drew = await req(sock2, 'game:draw');
check(drew.ok, '抽牌並跳過');

// 斷線重連
const dcP = waitFor(
  A,
  'game:state',
  (st2) => st2?.players?.find((p) => p.playerId === 'e2e-player-b')?.connected === false,
  3000
);
B.disconnect();
const stAfterDc = await dcP;
check(stAfterDc !== null, 'A 看到 B 斷線');
const B2 = await connect('e2e-player-b', '小華');
const full = await once(B2, 'state:full', 3000);
check(!!full?.game && Array.isArray(full?.hand) && full.hand.length > 0, 'B 重連取回完整狀態與手牌');
check(full?.chat?.length > 0, '重連取回聊天記錄');

// 離開房間
await req(B2, 'room:leave');
await sleep(300);

A.disconnect();
B2.disconnect();
console.log(failed === 0 ? '\n全部通過 ✅' : `\n${failed} 項失敗 ❌`);
process.exit(failed === 0 ? 0 : 1);
