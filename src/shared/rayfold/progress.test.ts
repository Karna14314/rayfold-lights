/// <reference types="node" />
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  decodeLeaderboardScore,
  encodeLeaderboardScore,
  isUtcDateString,
  nextStreak,
  parseMirrorMap,
  pickHint,
  previousUtcDate,
  utcDateString,
} from './progress.ts';
import type { MirrorPlacement } from './types.ts';

void test('UTC date helpers reject impossible calendar dates', () => {
  assert.equal(isUtcDateString('2026-11-19'), true);
  assert.equal(isUtcDateString('2024-02-29'), true);
  assert.equal(isUtcDateString('2026-02-29'), false);
  assert.equal(isUtcDateString('19-11-2026'), false);
  assert.equal(isUtcDateString(20261119), false);

  assert.equal(
    utcDateString(new Date('2026-11-19T23:59:59.000Z')),
    '2026-11-19'
  );
  assert.equal(previousUtcDate('2026-03-01'), '2026-02-28');
  assert.equal(previousUtcDate('2024-03-01'), '2024-02-29');
  assert.equal(previousUtcDate('2026-01-01'), '2025-12-31');
});

void test('streak continues only from yesterday', () => {
  assert.equal(nextStreak(undefined, '2026-11-19', 0), 1);
  assert.equal(nextStreak('2026-11-18', '2026-11-19', 4), 5);
  assert.equal(nextStreak('2026-11-19', '2026-11-19', 4), 4);
  assert.equal(nextStreak('2026-11-17', '2026-11-19', 4), 1);
  assert.equal(nextStreak('2026-10-31', '2026-11-01', 9), 10);
});

void test('leaderboard scores round-trip mirrors and bounces', () => {
  const score = encodeLeaderboardScore(3, 17);
  assert.equal(score, 3017);
  assert.deepEqual(decodeLeaderboardScore(score), { mirrors: 3, bounces: 17 });
  assert.deepEqual(decodeLeaderboardScore(0), { mirrors: 0, bounces: 0 });
});

void test('mirror map parsing rejects hostile or malformed payloads', () => {
  assert.deepEqual(parseMirrorMap({}), {});
  assert.deepEqual(parseMirrorMap({ 0: '/', 35: '\\' }), { 0: '/', 35: '\\' });

  assert.equal(parseMirrorMap(null), null);
  assert.equal(parseMirrorMap([]), null);
  assert.equal(parseMirrorMap({ 0: 'x' }), null);
  assert.equal(parseMirrorMap({ 36: '/' }), null);
  assert.equal(parseMirrorMap({ '-1': '/' }), null);
  assert.equal(parseMirrorMap({ '01': '/' }), null);
  assert.equal(parseMirrorMap({ 1.5: '/' }), null);
});

void test('hints reveal one missing or mis-rotated par mirror', () => {
  const parSolution: MirrorPlacement[] = [
    { index: 2, mirror: '/' },
    { index: 9, mirror: '\\' },
    { index: 20, mirror: '/' },
  ];

  assert.deepEqual(pickHint(parSolution, {}), { index: 2, mirror: '/' });
  assert.deepEqual(pickHint(parSolution, { 2: '\\' }), {
    index: 2,
    mirror: '/',
  });
  assert.deepEqual(pickHint(parSolution, { 2: '/', 9: '/' }), {
    index: 9,
    mirror: '\\',
  });
  assert.equal(pickHint(parSolution, { 2: '/', 9: '\\', 20: '/' }), null);
});
