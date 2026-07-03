// 單張 3D 牌:共用幾何/材質,useFrame damp 到 layout 目標位置(移動動畫免費獲得)
// 拖曳中改追隨 dragPos 並保持平躺,豁免 layout(對手同時改桌面也不影響手上的牌)
// 特效:drawn=剛抽到(金色脈動)、placed=本回合放上(金框)、flash=驗證失敗(抖動)
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three-stdlib';
import { easing } from 'maath';
import { faceMaterial, tileBodyMaterial } from './tileTextures.js';
import { TILE_W, TILE_H, TILE_T, DECK_POS, TABLE_TILE_ROT, RACK_LEAN } from './layout.js';

const bodyGeom = new RoundedBoxGeometry(TILE_W, TILE_H, TILE_T, 3, 0.05);
const faceGeom = new THREE.PlaneGeometry(TILE_W * 0.94, TILE_H * 0.96);

const SMOOTH = 0.16;
const DRAG_SMOOTH = 0.05;
// 懸停上浮:沿牌面法線浮出(牌距壓縮重疊時可看清整張)
const HOVER_LIFT = 0.34;
const HOVER_LIFT_Y = HOVER_LIFT * Math.sin(RACK_LEAN);
const HOVER_LIFT_Z = HOVER_LIFT * Math.cos(RACK_LEAN);
const liftPos = [0, 0, 0]; // useFrame 共用暫存,避免每幀配置

export default function Tile3D({ tile, target, dragging, dragPos, onTileDown, drawn, placed, flash, hovered }) {
  const ref = useRef();
  const glowMat = useRef();
  const flashStart = useRef(0);

  useEffect(() => {
    if (flash) flashStart.current = performance.now();
  }, [flash]);

  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    if (dragging) {
      easing.damp3(g.position, dragPos, DRAG_SMOOTH, dt);
      easing.dampE(g.rotation, TABLE_TILE_ROT, 0.1, dt);
    } else {
      if (hovered && target.zone === 'rack') {
        liftPos[0] = target.pos[0];
        liftPos[1] = target.pos[1] + HOVER_LIFT_Y;
        liftPos[2] = target.pos[2] + HOVER_LIFT_Z;
        easing.damp3(g.position, liftPos, 0.08, dt);
      } else {
        easing.damp3(g.position, target.pos, SMOOTH, dt);
      }
      easing.dampE(g.rotation, target.rot, SMOOTH, dt);
      if (flash) {
        // 驗證失敗:左右抖動,約 0.9 秒衰減
        const amp = Math.max(0, 1 - (performance.now() - flashStart.current) / 900) * 0.06;
        g.position.x += Math.sin(state.clock.elapsedTime * 35) * amp;
      }
    }
    if (glowMat.current) {
      glowMat.current.opacity = 0.3 + 0.22 * Math.sin(state.clock.elapsedTime * 5);
    }
  });

  return (
    // 初始位置在牌堆(面朝下),第一次出現會飛入定位
    <group ref={ref} position={DECK_POS} rotation={[Math.PI / 2, 0, 0]}>
      <mesh
        geometry={bodyGeom}
        material={tileBodyMaterial()}
        castShadow
        receiveShadow
        onPointerDown={onTileDown ? (e) => onTileDown(e, tile) : undefined}
        onPointerOver={() => (document.body.style.cursor = 'grab')}
        onPointerOut={() => (document.body.style.cursor = '')}
      />
      {/* 本回合放上:金色外框(墊在牌面後,露出邊緣) */}
      {placed && (
        <mesh geometry={faceGeom} position={[0, 0, TILE_T / 2 + 0.002]} scale={[1.14, 1.1, 1]}>
          <meshBasicMaterial color="#ffd75e" transparent opacity={0.95} />
        </mesh>
      )}
      <mesh geometry={faceGeom} material={faceMaterial(tile)} position={[0, 0, TILE_T / 2 + 0.004]} />
      {/* 剛抽到:金色光暈脈動 */}
      {drawn && (
        <mesh geometry={faceGeom} position={[0, 0, TILE_T / 2 + 0.008]} scale={[1.2, 1.15, 1]}>
          <meshBasicMaterial ref={glowMat} color="#ffd75e" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
