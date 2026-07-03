// 木質手牌架:單一斜板,手牌多於一排時板面沿斜面加長;輪到自己時前唇金色脈動
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { woodMaterial } from './tileTextures.js';
import {
  rackParams,
  RACK_LEAN,
  RACK_ROW_PITCH,
  RACK_FOOT_Z,
  RACK_SHELF_Y,
  TILE_H,
} from './layout.js';

export default function Rack3D({ handCount, myTurn, rack = rackParams() }) {
  const tiers = Math.max(1, Math.ceil((handCount || 1) / rack.cols));
  const pulseMat = useRef();
  useFrame((state) => {
    if (pulseMat.current) {
      pulseMat.current.opacity = 0.45 + 0.35 * Math.sin(state.clock.elapsedTime * 4);
    }
  });

  const cosL = Math.cos(RACK_LEAN);
  const sinL = Math.sin(RACK_LEAN);
  // 斜托板:與牌同角度,長度涵蓋所有排,沿牌面法線往後退 0.1
  const boardLen = TILE_H + 0.35 + (tiers - 1) * RACK_ROW_PITCH;
  const boardY = RACK_SHELF_Y + (boardLen / 2) * cosL - 0.1 * sinL;
  const boardZ = RACK_FOOT_Z - (boardLen / 2) * sinL - 0.1 * cosL;
  return (
    <group position-x={rack.cx}>
      <mesh position={[0, boardY, boardZ]} rotation-x={-RACK_LEAN} material={woodMaterial()} receiveShadow>
        <boxGeometry args={[rack.w, boardLen, 0.12]} />
      </mesh>
      {/* 底座 */}
      <mesh position={[0, 0.06, RACK_FOOT_Z - 0.35]} material={woodMaterial()} castShadow receiveShadow>
        <boxGeometry args={[rack.w, 0.12, 1.8]} />
      </mesh>
      {/* 前唇擋牌 */}
      <mesh position={[0, 0.17, RACK_FOOT_Z + 0.12]} material={woodMaterial()} castShadow receiveShadow>
        <boxGeometry args={[rack.w, 0.24, 0.12]} />
      </mesh>
      {/* 輪到自己:前唇金色脈動光條 */}
      {myTurn && (
        <mesh position={[0, 0.3, RACK_FOOT_Z + 0.12]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[rack.w, 0.16]} />
          <meshBasicMaterial ref={pulseMat} color="#ffd75e" transparent opacity={0.6} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
