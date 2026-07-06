import React, { useEffect, useState } from 'react';
import { isBgmEnabled, subscribeBgm, toggleBgm } from '../bgm.js';

export default function BgmToggle() {
  const [on, setOn] = useState(isBgmEnabled());

  useEffect(() => subscribeBgm(setOn), []);

  return (
    <button className="small" title="背景音樂開關" onClick={toggleBgm}>
      {on ? '🎵' : '🔇'}
    </button>
  );
}
