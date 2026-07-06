/**
 * 背景音樂:第一次從頭完整播放,結束後改從 42 秒處開始重複循環。
 * 用 Web Audio API 的 AudioBufferSourceNode + loopStart/loopEnd 做無縫循環
 * (先解碼整段音檔到記憶體,由瀏覽器音訊時脈精準銜接,不會像 <audio> 那樣
 * 在 ended 事件裡手動 seek+play 造成銜接空隙/喀噠聲)。
 * 開關狀態存 localStorage,跨對局/重新整理仍記得使用者選擇。
 */
const SRC = '/audio/bgm.mp3';
const LOOP_FROM = 42;
const STORAGE_KEY = 'bgmEnabled';
const VOLUME = 0.35;

let ctx = null;
let gainNode = null;
let source = null;
let bufferPromise = null;
let enabled = localStorage.getItem(STORAGE_KEY) === '1';
const listeners = new Set();

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function loadBuffer() {
  if (!bufferPromise) {
    bufferPromise = fetch(SRC)
      .then((res) => res.arrayBuffer())
      .then((data) => ac().decodeAudioData(data));
  }
  return bufferPromise;
}

/** 建立並啟動唯一一顆 source node(只能 start 一次);之後只用 ctx.suspend/resume 控制播放/暫停 */
async function ensureStarted() {
  if (source) return;
  const buffer = await loadBuffer();
  if (source) return; // 避免同時呼叫兩次造成重複建立
  const c = ac();
  gainNode = c.createGain();
  gainNode.gain.value = VOLUME;
  gainNode.connect(c.destination);

  source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = LOOP_FROM;
  source.loopEnd = buffer.duration;
  source.connect(gainNode);
  source.start(0);
}

function notify() {
  listeners.forEach((fn) => fn(enabled));
}

export function isBgmEnabled() {
  return enabled;
}

export function subscribeBgm(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setBgmEnabled(next) {
  enabled = next;
  localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  if (next) {
    ensureStarted().then(() => ac().resume());
  } else {
    ctx?.suspend();
  }
  notify();
}

export function toggleBgm() {
  setBgmEnabled(!enabled);
}

/** 遊戲畫面掛載時呼叫:若使用者先前已開啟,則(重新)開始播放 */
export function startBgmIfEnabled() {
  if (enabled) ensureStarted().then(() => ac().resume());
}

/** 離開遊戲畫面時呼叫:暫停但保留開關設定,恢復時從暫停處接續(不重新從頭播) */
export function pauseBgm() {
  ctx?.suspend();
}
