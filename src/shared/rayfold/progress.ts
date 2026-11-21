import { CELL_COUNT } from './types.ts';
import type { MirrorMap, MirrorPlacement, MirrorType } from './types.ts';

const MS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CELL_KEY_PATTERN = /^(0|[1-9]\d*)$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isMirrorType(value: unknown): value is MirrorType {
  return value === '/' || value === '\\';
}

export function isUtcDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const check = new Date(timestamp);

  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

export function utcDateString(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return date.toISOString().slice(0, 10);
}

export function previousUtcDate(date: string): string | undefined {
  if (!isUtcDateString(date)) return undefined;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(timestamp - MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Parses an untrusted wire value into a dense mirror map. Empty maps are
 * valid; malformed keys, out-of-range cells, and unknown mirror glyphs are not.
 */
export function parseMirrorMap(value: unknown): MirrorMap | null {
  if (!isRecord(value)) return null;

  const mirrors: MirrorMap = {};
  let count = 0;

  for (const key of Object.keys(value)) {
    if (!CELL_KEY_PATTERN.test(key)) return null;
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT)
      return null;

    const mirror = value[key];
    if (!isMirrorType(mirror)) return null;

    mirrors[index] = mirror;
    count++;
  }

  return count <= CELL_COUNT ? mirrors : null;
}

/** Lower is better: fewer mirrors, then fewer bounces. */
export function encodeLeaderboardScore(
  mirrors: number,
  bounces: number
): number {
  return mirrors * 1000 + bounces;
}

export function decodeLeaderboardScore(score: number): {
  mirrors: number;
  bounces: number;
} {
  const safeScore = Math.max(0, Math.trunc(score));
  const bounces = safeScore % 1000;
  return { mirrors: (safeScore - bounces) / 1000, bounces };
}

export function nextStreak(
  lastSolvedDate: string | undefined,
  today: string,
  currentStreak: number
): number {
  if (lastSolvedDate === today) return Math.max(1, currentStreak);

  const yesterday = previousUtcDate(today);
  if (
    lastSolvedDate !== undefined &&
    yesterday !== undefined &&
    lastSolvedDate === yesterday
  ) {
    return Math.max(0, currentStreak) + 1;
  }

  return 1;
}

/**
 * Returns the first par mirror that is missing or rotated the wrong way.
 * The remaining solution is never exposed.
 */
export function pickHint(
  parSolution: readonly MirrorPlacement[],
  currentMirrors: MirrorMap
): MirrorPlacement | null {
  for (const placement of parSolution) {
    if (currentMirrors[placement.index] !== placement.mirror) {
      return { index: placement.index, mirror: placement.mirror };
    }
  }
  return null;
}
