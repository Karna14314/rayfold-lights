/// <reference types="node" />
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  getInitialBeamCells,
  reflectDirection,
  traceRays,
} from './raycaster.ts';
import { findOptimalSolution } from './solver.ts';
import { DAILY_SEEDS, formatSpoilerFreeCard, getDailyPuzzle } from './daily.ts';
import type { DailyPuzzle, Dir, MirrorMap } from './types.ts';

const DIRECTIONS: Dir[] = ['N', 'E', 'S', 'W'];

const SLASH_EXPECTED: Record<Dir, Dir> = {
  N: 'E',
  E: 'N',
  S: 'W',
  W: 'S',
};

const BACKSLASH_EXPECTED: Record<Dir, Dir> = {
  N: 'W',
  E: 'S',
  S: 'E',
  W: 'N',
};

void test('slash mirror reflects all four directions', () => {
  for (const dir of DIRECTIONS) {
    assert.equal(reflectDirection(dir, '/'), SLASH_EXPECTED[dir], dir);
  }
});

void test('backslash mirror reflects all four directions', () => {
  for (const dir of DIRECTIONS) {
    assert.equal(reflectDirection(dir, '\\'), BACKSLASH_EXPECTED[dir], dir);
  }
});

void test('prism splits an eastbound amber beam into cyan north and magenta south', () => {
  const puzzle: DailyPuzzle = {
    id: 1,
    tier: 2,
    emitter: { index: 12, dir: 'E' },
    blockers: [],
    targets: [13, 3, 27],
    prisms: [15],
    par: 1,
    budget: 2,
    parSolution: [],
    firstHintIndex: 15,
  };

  const result = traceRays(puzzle, {});
  assert.deepEqual(result.litTargets, [3, 13, 27]);
  assert.equal(result.solved, true);
  assert.equal(result.bounces, 1);

  const cyan = result.segments.find((segment) => segment.color === 'cyan');
  const magenta = result.segments.find((segment) => segment.color === 'magenta');
  if (!cyan) throw new Error('missing cyan segment');
  if (!magenta) throw new Error('missing magenta segment');
  assert.deepEqual(
    { row: cyan.toRow, col: cyan.toCol },
    { row: 0, col: 3 }
  );
  assert.deepEqual(
    { row: magenta.toRow, col: magenta.toCol },
    { row: 5, col: 3 }
  );
});

void test('a four-mirror optical cycle terminates safely', () => {
  const puzzle: DailyPuzzle = {
    id: 2,
    tier: 2,
    emitter: { index: 18, dir: 'E' },
    blockers: [],
    targets: [],
    prisms: [19],
    par: 0,
    budget: 1,
    parSolution: [],
    firstHintIndex: 19,
  };

  const mirrors: MirrorMap = {
    9: '\\',
    20: '\\',
    25: '\\',
    26: '/',
  };

  const result = traceRays(puzzle, mirrors);
  assert.equal(result.bounces, 5);
  assert.equal(result.segments.length, 6);
});

function mirrorMapFromSolution(puzzle: DailyPuzzle): MirrorMap {
  const mirrors: MirrorMap = {};
  for (const placement of puzzle.parSolution) {
    mirrors[placement.index] = placement.mirror;
  }
  return mirrors;
}

void test('all 90 seeds are valid and solvable at their exact par', () => {
  assert.equal(DAILY_SEEDS.length, 90);

  const seenBoards = new Set<string>();
  const seenIds = new Set<number>();

  for (const seed of DAILY_SEEDS) {
    assert.ok(seed.id >= 1 && seed.id <= 90);
    assert.equal(seenIds.has(seed.id), false, `duplicate id ${seed.id}`);
    seenIds.add(seed.id);

    assert.equal(seed.targets.length, 3, `seed ${seed.id} target count`);
    assert.equal(seed.budget, seed.par + 1, `seed ${seed.id} budget`);
    assert.equal(
      seed.parSolution.length,
      seed.par,
      `seed ${seed.id} par solution length`
    );
    assert.ok(seed.par >= 3 && seed.par <= 5, `seed ${seed.id} par range`);
    assert.equal(
      seed.blockers.length >= 3 && seed.blockers.length <= 5,
      true,
      `seed ${seed.id} blocker count`
    );

    if (seed.tier === 1) {
      assert.equal(seed.par, 3, `seed ${seed.id} tier 1 par`);
      assert.equal(seed.prisms.length, 0, `seed ${seed.id} tier 1 prism`);
      assert.ok(seed.blockers.length <= 4, `seed ${seed.id} tier 1 blockers`);
    } else if (seed.tier === 2) {
      assert.ok(seed.par === 3 || seed.par === 4, `seed ${seed.id} tier 2 par`);
      assert.equal(seed.prisms.length, 1, `seed ${seed.id} tier 2 prism`);
      assert.ok(seed.blockers.length <= 4, `seed ${seed.id} tier 2 blockers`);
    } else {
      assert.ok(seed.par === 4 || seed.par === 5, `seed ${seed.id} tier 3 par`);
      assert.equal(seed.prisms.length, 1, `seed ${seed.id} tier 3 prism`);
      assert.ok(seed.blockers.length >= 4, `seed ${seed.id} tier 3 blockers`);
    }

    const boardKey = [
      seed.emitter.index,
      seed.emitter.dir,
      [...seed.blockers].sort((a, b) => a - b).join('.'),
      [...seed.targets].sort((a, b) => a - b).join('.'),
      [...seed.prisms].sort((a, b) => a - b).join('.'),
    ].join('|');
    assert.equal(seenBoards.has(boardKey), false, `duplicate board ${seed.id}`);
    seenBoards.add(boardKey);

    const mirrors = mirrorMapFromSolution(seed);
    const result = traceRays(seed, mirrors);
    assert.equal(result.solved, true, `seed ${seed.id} does not solve`);
    assert.equal(result.litTargets.length, 3, `seed ${seed.id} lit targets`);
    assert.equal(result.mirrorCount, seed.par, `seed ${seed.id} mirror count`);

    assert.ok(
      seed.parSolution.some((placement) => placement.index === seed.firstHintIndex),
      `seed ${seed.id} hint is not in parSolution`
    );
    assert.ok(
      getInitialBeamCells(seed).includes(seed.firstHintIndex),
      `seed ${seed.id} hint is not on the opening beam`
    );

    if (seed.tier > 1) {
      const prism = seed.prisms[0];
      if (prism === undefined) throw new Error(`seed ${seed.id} missing prism`);
      const prismHit = result.segments.some(
        (segment) => segment.toRow * 6 + segment.toCol === prism
      );
      assert.equal(prismHit, true, `seed ${seed.id} prism not hit`);
    }
  }

  assert.equal(seenBoards.size, 90);
});

void test('ten spot-checked seeds are impossible at par minus one', () => {
  const spotChecks = [0, 9, 18, 27, 36, 45, 54, 63, 72, 81];

  for (const index of spotChecks) {
    const seed = DAILY_SEEDS[index];
    if (!seed) throw new Error(`missing seed at index ${index}`);
    const result = findOptimalSolution(seed, seed.par - 1);
    assert.equal(result, null, `seed ${seed.id} is solvable below par`);
  }
});

void test('daily lookup is deterministic and wraps every 90 days', () => {
  assert.equal(getDailyPuzzle('2026-01-01').id, 1);
  assert.equal(getDailyPuzzle('2026-01-02').id, 2);
  assert.equal(getDailyPuzzle('2026-04-01').id, 1);
  assert.equal(getDailyPuzzle('2025-12-31').id, 90);
  assert.throws(() => getDailyPuzzle('2026-02-30'));
  assert.throws(() => getDailyPuzzle('19-11-2026'));
});

void test('share card is spoiler-free telemetry', () => {
  const card = formatSpoilerFreeCard({
    puzzleNumber: 7,
    mirrors: 3,
    par: 3,
    bounces: 9,
    streak: 4,
  });

  assert.match(card, /RAYFOLD #007/);
  assert.match(card, /Mirrors 3 \/ Par 3/);
  assert.match(card, /9 bounces/);
  assert.match(card, /Streak 4 days/);
  assert.equal(card.includes('/'), true); // only the mirrors/par separator
  assert.equal(card.split('/').length, 2);
});
