/**
 * 背景音樂:第一次從頭完整播放,結束後改從 42 秒處開始重複循環。
 * 開關狀態存 localStorage,跨對局/重新整理仍記得使用者選擇。
 */
const SRC = '/audio/bgm.mp3';
const LOOP_FROM = 42;
const STORAGE_KEY = 'bgmEnabled';

let audio = null;
let enabled = localStorage.getItem(STORAGE_KEY) === '1';
const listeners = new Set();

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio(SRC);
  audio.volume = 0.35;
  audio.addEventListener('ended', () => {
    audio.currentTime = LOOP_FROM;
    audio.play().catch(() => {});
  });
  return audio;
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
  const a = ensureAudio();
  if (next) a.play().catch(() => {});
  else a.pause();
  notify();
}

export function toggleBgm() {
  setBgmEnabled(!enabled);
}

/** 遊戲畫面掛載時呼叫:若使用者先前已開啟,則(重新)開始播放 */
export function startBgmIfEnabled() {
  if (enabled) ensureAudio().play().catch(() => {});
}

/** 離開遊戲畫面時呼叫:暫停但保留開關設定 */
export function pauseBgm() {
  audio?.pause();
}
