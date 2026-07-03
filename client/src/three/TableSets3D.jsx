// 桌面牌組底板 + 「建立新牌組」提示板(牌本身在 Scene 統一渲染,避免換區時 remount)
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { newSetTexture } from './tileTextures.js';
import { NEWSET_ID } from './layout.js';

function SetBoard({ rect, hovered, flagged }) {
  const flashMat = useRef();
  useFrame((state) => {
    if (flashMat.current) {
      flashMat.current.opacity = 0.28 + 0.28 * Math.sin(state.clock.elapsedTime * 8);
    }
  });
  return (
    <group position={[rect.x, 0, rect.z]}>
      {/* 不合法牌組:紅色外框 */}
      {!rect.valid && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
          <planeGeometry args={[rect.w + 0.14, rect.d + 0.14]} />
          <meshBasicMaterial color="#ff7b6b" transparent opacity={0.85} />
        </mesh>
      )}
      <mesh rotation-x={-Math.PI / 2} position-y={0.018}>
        <planeGeometry args={[rect.w, rect.d]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} />
      </mesh>
      {/* 出牌驗證失敗:紅色閃爍 */}
      {flagged && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.026}>
          <planeGeometry args={[rect.w + 0.2, rect.d + 0.2]} />
          <meshBasicMaterial ref={flashMat} color="#ff5240" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      )}
      {/* 拖曳懸停:金色高亮 */}
      {hovered && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.024}>
          <planeGeometry args={[rect.w + 0.1, rect.d + 0.1]} />
          <meshBasicMaterial color="#ffd75e" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export default function TableSets3D({ layout, table, myTurn, hover, dragging, invalidSetIds }) {
  const newSetRect = layout.sets.get(NEWSET_ID);
  const newSetHover = dragging && hover?.type === 'newset';
  return (
    <group>
      {table.map((s) => {
        const rect = layout.sets.get(s.id);
        return rect ? (
          <SetBoard
            key={s.id}
            rect={rect}
            hovered={dragging && hover?.setId === s.id}
            flagged={invalidSetIds?.includes(s.id)}
          />
        ) : null;
      })}
      {newSetRect && (
        <group position={[newSetRect.x, 0, newSetRect.z]} visible={!!myTurn}>
          <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
            <planeGeometry args={[newSetRect.w, newSetRect.d]} />
            <meshBasicMaterial map={newSetTexture()} transparent />
          </mesh>
          {newSetHover && (
            <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
              <planeGeometry args={[newSetRect.w, newSetRect.d]} />
              <meshBasicMaterial color="#ffd75e" transparent opacity={0.25} depthWrite={false} />
            </mesh>
          )}
        </group>
      )}
    </group>
  );
}
