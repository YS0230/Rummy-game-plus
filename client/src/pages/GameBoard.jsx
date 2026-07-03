import React from 'react';
import { useStore, tileLabel } from '../store.js';
import Tile from '../components/Tile.jsx';
import PlayerBar from '../components/PlayerBar.jsx';
import TurnControls from '../components/TurnControls.jsx';
import Chat from '../components/Chat.jsx';
import ResultModal from '../components/ResultModal.jsx';
import RackHud from '../components/RackHud.jsx';
import GameCanvas from '../three/GameCanvas.jsx';

const SMALL_SCREEN = window.matchMedia('(max-width: 720px)').matches;

export default function GameBoard() {
  const { game, playerId, turnFlash, drewOverlay } = useStore();

  if (!game) return <div className="loading">載入遊戲中…</div>;

  const myTurn = game.current === playerId && !game.over;

  return (
    <div className="game-page-3d">
      <GameCanvas myTurn={myTurn} />
      <PlayerBar />
      <TurnControls myTurn={myTurn} />
      <RackHud myTurn={myTurn} />
      <div className="chat-dock">
        <Chat defaultOpen={!SMALL_SCREEN} />
      </div>
      <ResultModal />
      {turnFlash && <div className="turn-banner">🎯 輪到你了!</div>}
      {drewOverlay && (
        <div className="drew-overlay">
          <div className="drew-card">
            <span className="drew-title">你抽到了</span>
            <div className="drew-tile">
              <Tile tile={drewOverlay} />
            </div>
            <span className="drew-label">{tileLabel(drewOverlay)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
