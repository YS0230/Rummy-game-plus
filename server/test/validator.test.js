import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidGroup,
  isValidRun,
  analyzeRun,
  isValidSet,
  setScore,
  validateTable,
  rackPenalty,
} from '../../shared/validator.js';
import { createTiles } from '../src/game/tiles.js';

const t = (color, num) => ({ id: `${color}-${num}-t`, color, num, isJoker: false });
const joker = (i = 0) => ({ id: `joker-${i}`, color: 'red', num: 0, isJoker: true });

test('createTiles 產生 106 張、2 張鬼牌、id 唯一', () => {
  const tiles = createTiles();
  assert.equal(tiles.length, 106);
  assert.equal(tiles.filter((x) => x.isJoker).length, 2);
  assert.equal(new Set(tiles.map((x) => x.id)).size, 106);
});

test('群組:同號不同色 3-4 張合法', () => {
  assert.ok(isValidGroup([t('red', 5), t('blue', 5), t('black', 5)]));
  assert.ok(isValidGroup([t('red', 5), t('blue', 5), t('black', 5), t('orange', 5)]));
  assert.ok(!isValidGroup([t('red', 5), t('red', 5), t('black', 5)])); // 重複色
  assert.ok(!isValidGroup([t('red', 5), t('blue', 6), t('black', 5)])); // 不同號
  assert.ok(!isValidGroup([t('red', 5), t('blue', 5)])); // 太少
});

test('群組:鬼牌可補', () => {
  assert.ok(isValidGroup([t('red', 5), t('blue', 5), joker()]));
  assert.ok(isValidGroup([t('red', 5), joker(0), joker(1)]));
  assert.equal(setScore([t('red', 5), t('blue', 5), joker()]), 15);
});

test('順子:同色連號合法', () => {
  assert.ok(isValidRun([t('red', 3), t('red', 4), t('red', 5)]));
  assert.ok(isValidRun([t('red', 5), t('red', 3), t('red', 4)])); // 順序無關
  assert.ok(!isValidRun([t('red', 3), t('blue', 4), t('red', 5)])); // 混色
  assert.ok(!isValidRun([t('red', 3), t('red', 5), t('red', 6)])); // 有洞
  assert.ok(!isValidRun([t('red', 3), t('red', 3), t('red', 4)])); // 重複
});

test('順子:鬼牌補洞與接頭尾', () => {
  assert.ok(isValidRun([t('red', 3), joker(), t('red', 5)])); // 補 4
  assert.ok(isValidRun([t('red', 12), t('red', 13), joker()])); // 只能接 11
  assert.equal(analyzeRun([t('red', 12), t('red', 13), joker()]).sum, 11 + 12 + 13);
  // 鬼牌優先接高位: 3,4 + joker => 3,4,5
  assert.equal(analyzeRun([t('red', 3), t('red', 4), joker()]).sum, 12);
  // 13,12 + 2 jokers => 11,12,13 + 一張只能往下 => 10,11,12,13
  assert.equal(analyzeRun([t('red', 12), t('red', 13), joker(0), joker(1)]).sum, 46);
  assert.ok(!isValidRun([t('red', 1), t('red', 13), joker()])); // 洞太大
});

test('setScore 與 rackPenalty', () => {
  assert.equal(setScore([t('red', 10), t('red', 11), t('red', 12)]), 33);
  assert.equal(setScore([t('red', 1), t('blue', 1), t('black', 1)]), 3);
  assert.equal(rackPenalty([t('red', 10), joker()]), 40);
});

test('validateTable', () => {
  const good = [
    { id: 's1', tiles: [t('red', 3), t('red', 4), t('red', 5)] },
    { id: 's2', tiles: [t('red', 9), t('blue', 9), joker()] },
  ];
  const bad = [{ id: 's1', tiles: [t('red', 3), t('red', 4)] }];
  assert.ok(validateTable(good));
  assert.ok(!validateTable(bad));
  assert.ok(isValidSet([t('red', 1), t('red', 2), t('red', 3)]));
});
