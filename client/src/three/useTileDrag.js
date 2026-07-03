// 3D 拖放控制:pointer 事件 → 拖曳平面投影 → 地面命中判定 → applyDrop
// 產出的 { tileId, from, target } 形狀與 dnd-kit 完全相同
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useStore } from '../store.js';
import { applyDrop } from '../dragActions.js';
import {
  hitTarget,
  rackHoverIndex,
  RACK_LEAN,
  RACK_SHELF_Y,
  RACK_FOOT_Z,
} from './layout.js';

export const DRAG_Y = 0.85; // 拖曳中牌浮起高度

// 牌架斜面(過所有牌中心的平面),懸停判定用
const RACK_PLANE = new THREE.Plane(
  new THREE.Vector3(0, Math.sin(RACK_LEAN), Math.cos(RACK_LEAN)),
  -(Math.sin(RACK_LEAN) * RACK_SHELF_Y + Math.cos(RACK_LEAN) * RACK_FOOT_Z)
);

export function useTileDrag(layoutRef) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls);
  const [drag, setDrag] = useState(null); // { tileId, from }
  const [hover, setHover] = useState(null); // 拖曳中的目標(高亮用)
  const [hoverTile, setHoverTile] = useState(null); // 非拖曳時游標指到的手牌 id(上浮用)
  const S = useRef(null);
  if (!S.current) {
    S.current = {
      down: null, // pointerdown 但未達 4px 啟動閾值
      active: null,
      pos: new THREE.Vector3(), // 拖曳牌跟隨位置(y=DRAG_Y)
      raycaster: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      dragPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_Y),
      groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      ground: new THREE.Vector3(),
    };
  }

  const onTileDown = useCallback(
    (e, tile) => {
      if (e.nativeEvent.button !== 0 && e.nativeEvent.pointerType === 'mouse') return;
      const tr = layoutRef.current?.tiles.get(tile.id);
      if (!tr) return;
      const { game, playerId } = useStore.getState();
      const myTurn = game && game.current === playerId && !game.over;
      const from = tr.zone === 'rack' ? 'hand' : tr.setId;
      if (from !== 'hand' && !myTurn) return; // 非我回合只能動手牌
      e.stopPropagation();
      if (controls) controls.enabled = false; // 點到牌就不轉相機
      S.current.down = {
        tileId: tile.id,
        from,
        x: e.nativeEvent.clientX,
        y: e.nativeEvent.clientY,
      };
    },
    [layoutRef, controls]
  );

  useEffect(() => {
    const el = gl.domElement;
    const s = S.current;

    const project = (ev, plane, out) => {
      const rect = el.getBoundingClientRect();
      s.ndc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      );
      s.raycaster.setFromCamera(s.ndc, camera);
      return s.raycaster.ray.intersectPlane(plane, out);
    };

    const move = (ev) => {
      if (!s.down && !s.active) {
        // 非拖曳:游標指到的手牌上浮(重疊時可看清整張)
        if (ev.pointerType === 'mouse' && project(ev, RACK_PLANE, s.ground)) {
          const { hand } = useStore.getState();
          const idx = rackHoverIndex(s.ground, layoutRef.current, hand.length);
          setHoverTile(idx >= 0 ? hand[idx]?.id ?? null : null);
        } else {
          setHoverTile(null);
        }
        return;
      }
      if (!s.active) {
        if (Math.hypot(ev.clientX - s.down.x, ev.clientY - s.down.y) < 4) return;
        s.active = { tileId: s.down.tileId, from: s.down.from };
        s.down = null;
        setDrag(s.active);
        setHoverTile(null);
      }
      project(ev, s.dragPlane, s.pos);
      if (project(ev, s.groundPlane, s.ground)) {
        const t = hitTarget(s.ground, layoutRef.current, useStore.getState().hand.length);
        setHover((h) =>
          h && h.type === t.type && h.setId === t.setId && h.index === t.index ? h : t
        );
      }
    };

    const finish = (ev, cancelled) => {
      if (s.active) {
        if (!cancelled && project(ev, s.groundPlane, s.ground)) {
          const target = hitTarget(s.ground, layoutRef.current, useStore.getState().hand.length);
          applyDrop({ tileId: s.active.tileId, from: s.active.from, target });
        }
        s.active = null;
        setDrag(null);
        setHover(null);
      }
      s.down = null;
      if (controls) controls.enabled = true;
    };

    const up = (ev) => finish(ev, false);
    const cancel = (ev) => finish(ev, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [gl, camera, controls, layoutRef]);

  return { onTileDown, drag, hover, hoverTile, dragPos: S.current.pos };
}
