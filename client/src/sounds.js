/**
 * 全合成音效(Web Audio),不需音檔。
 * 行動端瀏覽器要求使用者互動後才能出聲:共用一個 AudioContext,
 * 每次播放前 resume;未允許音效時一律靜默忽略。
 */
let ctx = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** 單音;freq 給 [起, 迄] 則做滑音 */
function tone(freq, { at = 0, dur = 0.15, type = 'sine', vol = 0.08 } = {}) {
  const c = ac();
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  if (Array.isArray(freq)) {
    osc.frequency.setValueAtTime(freq[0], t0);
    osc.frequency.exponentialRampToValueAtTime(freq[1], t0 + dur);
  } else {
    osc.frequency.value = freq;
  }
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

const safe =
  (fn) =>
  (...args) => {
    try {
      fn(...args);
    } catch {
      /* 瀏覽器未允許音效時忽略 */
    }
  };

export const sounds = {
  /** 放牌:短促「嗒」(高頻敲擊+低頻墊底) */
  place: safe(() => {
    tone(1800, { dur: 0.03, type: 'triangle', vol: 0.05 });
    tone(240, { dur: 0.08, vol: 0.1 });
  }),
  /** 拼成有效牌組:上行雙音 */
  validSet: safe(() => {
    tone(660, { dur: 0.09, vol: 0.07 });
    tone(880, { at: 0.08, dur: 0.16, vol: 0.07 });
  }),
  /** 出牌成功:上行三連音 */
  play: safe(() => {
    tone(523, { dur: 0.1, vol: 0.07 });
    tone(659, { at: 0.09, dur: 0.1, vol: 0.07 });
    tone(784, { at: 0.18, dur: 0.22, vol: 0.07 });
  }),
  /** 抽牌:上滑音 */
  draw: safe(() => tone([300, 620], { dur: 0.18, vol: 0.06 })),
  /** 無效操作:低頻短嗡 ×2 */
  error: safe(() => {
    tone(180, { dur: 0.12, type: 'square', vol: 0.045 });
    tone(140, { at: 0.13, dur: 0.18, type: 'square', vol: 0.045 });
  }),
  /** 輪到你 */
  yourTurn: safe(() => tone(880, { dur: 0.5, vol: 0.08 })),
  /** 勝利:上行琶音 */
  win: safe(() => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(f, { at: i * 0.12, dur: i === 3 ? 0.5 : 0.13, vol: 0.08 })
    );
  }),
  /** 落敗:下行雙音 */
  lose: safe(() => {
    tone(392, { dur: 0.2, vol: 0.06 });
    tone(262, { at: 0.2, dur: 0.4, vol: 0.06 });
  }),
};
