// 3D 場景進入點:Canvas、燈光、相機;Scene 統一渲染所有牌(key=tile.id 保持實例跨區存活)
import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useStore } from '../store.js';
import { computeLayout, rackSlotTransform } from './layout.js';
import { useTileDrag } from './useTileDrag.js';
import Table3D from './Table3D.jsx';
import Rack3D from './Rack3D.jsx';
import TableSets3D from './TableSets3D.jsx';
import Tile3D from './Tile3D.jsx';

// 低配檔位:觸控裝置關陰影、降 DPR
const LOW_SPEC =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

// 直向螢幕:拉高 FOV 讓桌面與牌架都入鏡
function ResponsiveCamera() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls);
  useEffect(() => {
    const portrait = size.width / size.height < 0.95;
    camera.fov = portrait ? Math.min(74, 48 / Math.max(0.6, size.width / size.height)) : 48;
    camera.updateProjectionMatrix();
    if (portrait) {
      camera.position.set(0, 10, 13.4);
      if (controls) {
        controls.target.set(0, 0, 2.6);
        controls.update();
      }
    }
  }, [size, camera, controls]);
  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[5, 12, 4]}
        intensity={1.15}
        castShadow={!LOW_SPEC}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
      />
      <pointLight position={[-6, 5, -5]} intensity={30} color="#ffd9a0" />
    </>
  );
}

function Scene({ myTurn }) {
  const game = useStore((s) => s.game);
  const hand = useStore((s) => s.hand);
  const drewTile = useStore((s) => s.drewTile);
  const invalidSetIds = useStore((s) => s.invalidSetIds);

  // 直向螢幕:牌架縮為 8 格且置中、桌面換行寬度縮小
  const size = useThree((s) => s.size);
  const portrait = size.width / size.height < 0.95;
  const layout = useMemo(
    () =>
      computeLayout(
        game.table,
        hand,
        portrait ? { rackCols: 8, rackCx: 0, tableUsableW: 7.5 } : {}
      ),
    [game.table, hand, portrait]
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const { onTileDown, drag, hover, hoverTile, dragPos } = useTileDrag(layoutRef);

  // 開發模式:暴露投影所需物件給自動化測試(座標換算用)
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (import.meta.env.DEV) {
      window.__game3d = {
        camera,
        gl,
        get layout() {
          return layoutRef.current;
        },
        getState: useStore.getState,
      };
    }
  }, [camera, gl]);

  // 桌面 + 手牌全部牌(以 id 去重,防 game:state / game:hand 到達順序造成短暫重複)
  const allTiles = useMemo(() => {
    const m = new Map();
    for (const s of game.table) for (const t of s.tiles) m.set(t.id, t);
    for (const t of hand) if (!m.has(t.id)) m.set(t.id, t);
    return [...m.values()];
  }, [game.table, hand]);

  const placedSet = useMemo(() => new Set(game.placedTileIds ?? []), [game.placedTileIds]);

  // 拖曳懸停在牌架時,該格讓出縫隙(其餘手牌往後移一格)
  const targetFor = (t) => {
    const base = layout.tiles.get(t.id);
    if (
      drag &&
      hover?.type === 'handpos' &&
      base?.zone === 'rack' &&
      t.id !== drag.tileId
    ) {
      let idx = hand.findIndex((h) => h.id === t.id);
      if (drag.from === 'hand') {
        const dragIdx = hand.findIndex((h) => h.id === drag.tileId);
        if (dragIdx !== -1 && dragIdx < idx) idx -= 1;
      }
      if (idx >= hover.index) return rackSlotTransform(idx + 1, layout.rack);
      return rackSlotTransform(idx, layout.rack);
    }
    return base;
  };

  return (
    <>
      <Table3D poolCount={game.poolCount} />
      <Rack3D handCount={hand.length} myTurn={myTurn} rack={layout.rack} />
      <TableSets3D
        layout={layout}
        table={game.table}
        myTurn={myTurn}
        hover={hover}
        dragging={!!drag}
        invalidSetIds={invalidSetIds}
      />
      {allTiles.map((t) => {
        const target = targetFor(t);
        return target ? (
          <Tile3D
            key={t.id}
            tile={t}
            target={target}
            dragging={drag?.tileId === t.id}
            dragPos={dragPos}
            hovered={!drag && hoverTile === t.id}
            onTileDown={onTileDown}
            drawn={drewTile?.id === t.id}
            placed={placedSet.has(t.id) && layout.tiles.get(t.id)?.zone === 'table'}
            flash={layout.tiles.get(t.id)?.zone === 'table' && invalidSetIds.includes(layout.tiles.get(t.id)?.setId)}
          />
        ) : null;
      })}
    </>
  );
}

export default function GameCanvas({ myTurn }) {
  return (
    <div className="game-canvas-wrap">
      <Canvas
        shadows={!LOW_SPEC}
        dpr={LOW_SPEC ? [1, 1.5] : [1, 1.75]}
        camera={{ fov: 48, position: [0, 12, 13], near: 0.5, far: 60 }}
      >
        <color attach="background" args={['#12241c']} />
        <fog attach="fog" args={['#12241c', 24, 42]} />
        <ResponsiveCamera />
        <Lights />
        <Scene myTurn={myTurn} />
        <OrbitControls
          makeDefault
          target={[0, 0, 2.2]}
          enablePan={false}
          minDistance={7}
          maxDistance={17}
          minPolarAngle={Math.PI * 0.2}
          maxPolarAngle={Math.PI * 0.42}
          minAzimuthAngle={-Math.PI / 6}
          maxAzimuthAngle={Math.PI / 6}
        />
      </Canvas>
    </div>
  );
}
