import React, { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useStore, tileLabel } from '../store.js';
import { req } from '../socket.js';
import { sounds } from '../sounds.js';
import { isValidRun, isValidSet, sortRunForDisplay } from '../../../shared/validator.js';
import Tile from '../components/Tile.jsx';
import Rack from '../components/Rack.jsx';
import TableArea from '../components/TableArea.jsx';
import StagingArea from '../components/StagingArea.jsx';
import PlayerBar from '../components/PlayerBar.jsx';
import TurnControls from '../components/TurnControls.jsx';
import Chat from '../components/Chat.jsx';
import ResultModal from '../components/ResultModal.jsx';
import { startBgmIfEnabled, pauseBgm } from '../bgm.js';

export default function GameBoard() {
  const {
    game,
    hand,
    playerId,
    moveHandTile,
    stageTile,
    unstageTile,
    clearStagingSet,
    showToast,
    turnFlash,
    drewOverlay,
  } = useStore();
  const [activeTile, setActiveTile] = useState(null);
  const [stagingOpen, setStagingOpen] = useState(true);

  useEffect(() => {
    startBgmIfEnabled();
    return () => pauseBgm();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  );

  // 桌面(table)只當後備目標:先比對牌組/牌架等,都沒碰到才算「拖到桌面空白處」
  const collisionDetection = (args) => {
    const isTable = (c) => c.data.current?.type === 'table';
    const hits = rectIntersection({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => !isTable(c)),
    });
    if (hits.length) return hits;
    return rectIntersection({
      ...args,
      droppableContainers: args.droppableContainers.filter(isTable),
    });
  };

  if (!game) return <div className="loading">載入遊戲中…</div>;

  const myTurn = game.current === playerId && !game.over;
  const placedSet = new Set(game.placedTileIds ?? []);

  const currentLayout = () =>
    game.table.map((s) => ({ id: s.id, tileIds: s.tiles.map((t) => t.id) }));

  const sendLayout = async (sets, sound = sounds.place) => {
    const res = await req('game:layout', { sets: sets.filter((s) => s.tileIds.length > 0) });
    if (!res.ok && res.error) {
      showToast(res.error, 'warn');
      sounds.error();
      return false;
    }
    sound();
    return true;
  };

  // 雙擊手牌:自己回合排到「建立新牌組」區;非自己回合放進暫放區
  const playTileToNewSet = (tileId) => {
    if (!myTurn) {
      stageTile(tileId);
      setStagingOpen(true); // 收合時雙擊進暫放區,自動展開避免牌「消失」
      sounds.place();
      return;
    }
    const layout = currentLayout();
    layout.push({ id: `n-${Date.now().toString(36)}`, tileIds: [tileId] });
    sendLayout(layout);
  };

  // 暫放區整組送上桌面(輪到自己時)
  const submitStagedSet = async (stagedSet) => {
    if (!myTurn) return;
    const layout = currentLayout();
    layout.push({ id: `n-${Date.now().toString(36)}`, tileIds: [...stagedSet.tileIds] });
    const ok = await sendLayout(layout, sounds.validSet);
    if (ok) clearStagingSet(stagedSet.id);
  };

  // 雙擊桌面牌組:收回這回合放進該組的牌
  const recallSet = (setId) => {
    if (!myTurn) return;
    const layout = currentLayout();
    const ls = layout.find((s) => s.id === setId);
    if (!ls) return;
    const kept = ls.tileIds.filter((id) => !placedSet.has(id));
    if (kept.length === ls.tileIds.length) {
      showToast('這個牌組沒有本回合放上的牌');
      return;
    }
    ls.tileIds = kept;
    sendLayout(layout);
  };

  const onDragStart = ({ active }) => setActiveTile(active.data.current?.tile ?? null);

  const onDragEnd = ({ active, over }) => {
    setActiveTile(null);
    if (!over) return;
    const { tileId, from, setId: srcSetId } = active.data.current ?? {};
    const target = over.data.current ?? {};
    if (!tileId) return;
    // 手牌與暫放區的磚,對伺服器而言都還在手上
    const fromHandish = from === 'hand' || from === 'staging';

    // 手牌內排序 / 暫放區收回手牌(任何時候可做)
    if (fromHandish && (target.type === 'handpos' || target.type === 'rack')) {
      if (from === 'staging') unstageTile(tileId);
      moveHandTile(tileId, target.type === 'handpos' ? target.beforeTileId : null);
      return;
    }

    // 拖進暫放區(任何時候可做,僅限自己手上的磚)
    if (target.type === 'staging' || target.type === 'stagingnew') {
      if (!fromHandish) {
        showToast('桌面的牌不能放進暫放區', 'warn');
        return;
      }
      if (from === 'staging' && target.type === 'staging' && target.setId === srcSetId) return;
      stageTile(tileId, target.type === 'staging' ? target.setId : null);
      sounds.place();
      return;
    }

    if (!myTurn) return;
    const layout = currentLayout();
    // 從來源牌組移除:若拉走的是中間的牌,以它為界拆成左右兩組
    const removeFromSets = () => {
      const src = game.table.find((s) => s.tiles.some((t) => t.id === tileId));
      const ls = src && layout.find((s) => s.id === src.id);
      if (!ls) return;
      // 依畫面顯示順序切割(順子顯示時已重排)
      const display = isValidRun(src.tiles) ? sortRunForDisplay(src.tiles) : src.tiles;
      const idx = display.findIndex((t) => t.id === tileId);
      const left = display.slice(0, idx).map((t) => t.id);
      const right = display.slice(idx + 1).map((t) => t.id);
      if (left.length && right.length) {
        ls.tileIds = left;
        layout.splice(layout.indexOf(ls) + 1, 0, {
          id: `n-${Date.now().toString(36)}r`,
          tileIds: right,
        });
      } else {
        ls.tileIds = left.length ? left : right;
      }
    };

    // 拖到桌面空白處(table)與拖到「建立新牌組」區(newset)等價
    if (target.type === 'set' || target.type === 'newset' || target.type === 'table') {
      if (!fromHandish) {
        if (from === target.setId) return; // 同組不動
        removeFromSets();
      }
      let sound = sounds.place;
      if (target.type === 'set') {
        const ls = layout.find((s) => s.id === target.setId);
        ls?.tileIds.push(tileId);
        // 這一放若讓牌組變成有效組合,給上行雙音回饋
        if (ls) {
          const tileById = new Map(hand.map((t) => [t.id, t]));
          for (const s of game.table) for (const t of s.tiles) tileById.set(t.id, t);
          const tiles = ls.tileIds.map((id) => tileById.get(id)).filter(Boolean);
          if (tiles.length === ls.tileIds.length && isValidSet(tiles)) sound = sounds.validSet;
        }
      } else {
        layout.push({ id: `n-${Date.now().toString(36)}`, tileIds: [tileId] });
      }
      if (from === 'staging') unstageTile(tileId);
      sendLayout(layout, sound);
      return;
    }

    // 從桌面收回本回合放的磚
    if ((target.type === 'rack' || target.type === 'handpos') && !fromHandish) {
      if (!placedSet.has(tileId)) {
        showToast('只能收回本回合放上的磚', 'warn');
        return;
      }
      removeFromSets();
      sendLayout(layout);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveTile(null)}
    >
      <div className="game-page">
        <PlayerBar />
        <TableArea myTurn={myTurn} placedSet={placedSet} onSetDoubleClick={recallSet} />
        <TurnControls myTurn={myTurn} />
        {stagingOpen && <StagingArea myTurn={myTurn} onSubmitSet={submitStagedSet} />}
        <Rack
          myTurn={myTurn}
          onTileDoubleClick={playTileToNewSet}
          stagingOpen={stagingOpen}
          onToggleStaging={() => setStagingOpen((o) => !o)}
        />
        <Chat floatingToggle={false} />
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
      <DragOverlay dropAnimation={null}>
        {activeTile && <Tile tile={activeTile} dragging />}
      </DragOverlay>
    </DndContext>
  );
}
