import { useRef } from 'react';

/** 隱藏功能開關:回傳 onClick handler,windowMs 內連點 count 次觸發 onTrigger */
export function useSecretTaps(onTrigger, { count = 5, windowMs = 2000 } = {}) {
  const taps = useRef([]);
  return () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < windowMs), now];
    if (taps.current.length >= count) {
      taps.current = [];
      onTrigger();
    }
  };
}
