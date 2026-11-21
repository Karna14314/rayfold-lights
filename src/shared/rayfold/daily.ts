import seedsJson from './seeds.json' with { type: 'json' };
import type { DailyPuzzle, Dir, MirrorType } from './types.ts';

const MS_PER_DAY = 86_400_000;
export const SEED_EPOCH_UTC = '2026-01-01';
const VALID_DIRS: Dir[] = ['N', 'E', 'S', 'W'];
const VALID_MIRRORS: MirrorType[] = ['/', '\\'];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function expectNumberArray(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'number')) {
    throw new Error(`Invalid ${field}`);
  }
  return value.map((item) => expectNumber(item, field));
}

function expectTier(value: unknown): 1 | 2 | 3 {
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new Error('Invalid tier');
  }
  return value;
}

function expectDir(value: unknown): Dir {
  if (typeof value !== 'string' || !VALID_DIRS.includes(value as Dir)) {
    throw new Error('Invalid direction');
  }
  return value as Dir;
}

function expectMirror(value: unknown): MirrorType {
  if (typeof value !== 'string' || !VALID_MIRRORS.includes(value as MirrorType)) {
    throw new Error('Invalid mirror');
  }
  return value as MirrorType;
}

function parseDailyPuzzle(value: unknown, expectedId: number): DailyPuzzle {
  if (!isRecord(value)) throw new Error(`Seed ${expectedId} is not an object`);

  const id = expectNumber(value.id, 'id');
  if (id !== expectedId) {
    throw new Error(`Seed ${expectedId} has id ${id}`);
  }

  const emitterRaw = value.emitter;
  if (!isRecord(emitterRaw)) throw new Error(`Seed ${id} has an invalid emitter`);

  const solutionRaw = value.parSolution;
  if (!Array.isArray(solutionRaw)) {
    throw new Error(`Seed ${id} has an invalid parSolution`);
  }

  const parSolution = solutionRaw.map((entry) => {
    if (!isRecord(entry)) throw new Error(`Seed ${id} has an invalid solution entry`);
    return {
      index: expectNumber(entry.index, 'solution index'),
      mirror: expectMirror(entry.mirror),
    };
  });

  return {
    id,
    tier: expectTier(value.tier),
    emitter: {
      index: expectNumber(emitterRaw.index, 'emitter index'),
      dir: expectDir(emitterRaw.dir),
    },
    blockers: expectNumberArray(value.blockers, 'blockers'),
    targets: expectNumberArray(value.targets, 'targets'),
    prisms: expectNumberArray(value.prisms, 'prisms'),
    par: expectNumber(value.par, 'par'),
    budget: expectNumber(value.budget, 'budget'),
    parSolution,
    firstHintIndex: expectNumber(value.firstHintIndex, 'firstHintIndex'),
  };
}

function loadSeeds(value: unknown): DailyPuzzle[] {
  if (!Array.isArray(value)) throw new Error('seeds.json must be an array');
  return value.map((seed, index) => parseDailyPuzzle(seed, index + 1));
}

export const DAILY_SEEDS: readonly DailyPuzzle[] = loadSeeds(seedsJson);

function utcDayNumber(dateStr: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new Error(`Expected YYYY-MM-DD, received "${dateStr}"`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const check = new Date(timestamp);

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error(`Invalid UTC date "${dateStr}"`);
  }

  return timestamp / MS_PER_DAY;
}

export function getDailyPuzzle(utcDateStr: string): DailyPuzzle {
  const day = utcDayNumber(utcDateStr);
  const epochDay = utcDayNumber(SEED_EPOCH_UTC);
  const offset = day - epochDay;
  const index =
    ((offset % DAILY_SEEDS.length) + DAILY_SEEDS.length) % DAILY_SEEDS.length;
  const seed = DAILY_SEEDS[index];
  if (!seed) throw new Error(`No seed for index ${index}`);
  return seed;
}

export type ShareCardStats = {
  puzzleNumber: number;
  mirrors: number;
  par: number;
  bounces: number;
  streak: number;
};

export function formatSpoilerFreeCard(stats: ShareCardStats): string {
  const number = String(stats.puzzleNumber).padStart(3, '0');
  return [
    `RAYFOLD #${number}`,
    `Mirrors ${stats.mirrors} / Par ${stats.par} · ${stats.bounces} bounces`,
    `Streak ${stats.streak} days`,
    'Spoiler-free — can you fold the light?',
  ].join('\n');
}
