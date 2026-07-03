// 桌面:毛氈 + 木邊框 + 牌堆視覺
import React from 'react';
import { feltTexture, woodMaterial, tileBodyMaterial } from './tileTextures.js';
import { TABLE_W, TABLE_D, TILE_W, TILE_H, TILE_T, DECK_POS } from './layout.js';

const FRAME_W = 0.55; // 木框寬
const FRAME_H = 0.3; // 木框高

export default function Table3D({ poolCount }) {
  const halfW = TABLE_W / 2;
  const halfD = TABLE_D / 2;
  const deckLayers = Math.min(4, Math.max(1, Math.ceil((poolCount ?? 0) / 27)));
  return (
    <group>
      {/* 毛氈 */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[TABLE_W, TABLE_D]} />
        <meshStandardMaterial map={feltTexture()} roughness={0.95} />
      </mesh>
      {/* 木邊框(四條) */}
      <mesh position={[0, FRAME_H / 2 - 0.1, -halfD - FRAME_W / 2]} material={woodMaterial()} castShadow receiveShadow>
        <boxGeometry args={[TABLE_W + FRAME_W * 2, FRAME_H, FRAME_W]} />
      </mesh>
      <mesh position={[0, FRAME_H / 2 - 0.1, halfD + FRAME_W / 2]} material={woodMaterial()} castShadow receiveShadow>
        <boxGeometry args={[TABLE_W + FRAME_W * 2, FRAME_H, FRAME_W]} />
      </mesh>
      <mesh position={[-halfW - FRAME_W / 2, FRAME_H / 2 - 0.1, 0]} material={woodMaterial()} castShadow receiveShadow>
        <boxGeometry args={[FRAME_W, FRAME_H, TABLE_D]} />
      </mesh>
      <mesh position={[halfW + FRAME_W / 2, FRAME_H / 2 - 0.1, 0]} material={woodMaterial()} castShadow receiveShadow>
        <boxGeometry args={[FRAME_W, FRAME_H, TABLE_D]} />
      </mesh>
      {/* 牌堆(面朝下的一疊) */}
      {poolCount > 0 && (
        <group position={[DECK_POS[0], 0, DECK_POS[2]]} rotation-y={0.28}>
          {Array.from({ length: deckLayers }, (_, i) => (
            <mesh
              key={i}
              position={[i * 0.03, TILE_T / 2 + i * TILE_T, -i * 0.02]}
              rotation-x={-Math.PI / 2}
              material={tileBodyMaterial()}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[TILE_W, TILE_H, TILE_T]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}
