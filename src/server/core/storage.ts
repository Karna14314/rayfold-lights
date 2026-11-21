import { reddit, redis } from '@devvit/web/server';
import type { T1, T2, T3 } from '@devvit/web/shared';
import type { LeaderboardEntry } from '../../shared/api.ts';
import { CELL_COUNT } from '../../shared/rayfold/types.ts';
import type { MirrorMap } from '../../shared/rayfold/types.ts';
import {
  decodeLeaderboardScore,
  encodeLeaderboardScore,
  isUtcDateString,
  nextStreak,
  parseMirrorMap,
  utcDateString,
} from '../../shared/rayfold/progress.ts';

export type UserState = {
  streak: number;
  lastSolvedDate?: string;
  totalSolves: number;
};

export type SavedSolve = {
  mirrors: MirrorMap;
  mirrorCount: number;
  bounces: number;
};

export type CommunityStats = {
  totalSolves: number;
  parSolves: number;
};

export type RecordSolveInput = {
  date: string;
  userId: T2;
  username: string;
  mirrors: MirrorMap;
  bounces: number;
  par: number;
};

export type RecordSolveResult = {
  firstSolve: boolean;
  streak: number;
};

const postDateKey = (postId: T3): string => `rf:post:${postId}:date`;
const leaderboardKey = (date: string): string => `rf:${date}:lb`;
const statsKey = (date: string): string => `rf:${date}:stats`;
const heatKey = (date: string): string => `rf:${date}:heat`;
const userKey = (userId: T2): string => `rf:user:${userId}`;
const userDailyKey = (userId: T2, date: string): string =>
  `rf:user:${userId}:${date}`;
const sharedKey = (postId: T3, userId: T2): string =>
  `rf:shared:${postId}:${userId}`;
const shareThreadKey = (postId: T3): string =>
  `rf:post:${postId}:share-thread`;

const SHARE_THREAD_TEXT = `**RAYFOLD score thread**

Solved today's board? Reply with your score card below.

Keep solutions, mirror maps, and other spoilers out of the thread so everyone gets a clean first attempt.`;

function isCommentId(value: string): value is T1 {
  return value.startsWith('t1_');
}

/**
 * Every daily post gets one app-authored comment to collect score replies.
 * Replying to a single thread keeps the post's comment section tidy and gives
 * the user-action share flow a stable parent. If the app cannot distinguish the
 * comment (for example, in a subreddit where it is not a moderator), the thread
 * is still usable, just not pinned.
 */
export async function ensureShareThread(postId: T3): Promise<T1 | undefined> {
  const existing = await redis.get(shareThreadKey(postId));
  if (existing !== undefined && isCommentId(existing)) return existing;

  try {
    const comment = await reddit.submitComment({
      id: postId,
      text: SHARE_THREAD_TEXT,
      runAs: 'APP',
    });

    try {
      await comment.distinguish(true);
    } catch (error) {
      console.warn(`Could not sticky the share thread for ${postId}`, error);
    }

    await redis.set(shareThreadKey(postId), comment.id);
    return comment.id;
  } catch (error) {
    console.warn(`Could not create the share thread for ${postId}`, error);
    return undefined;
  }
}

function parseCount(value: string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

/**
 * The post's date anchors every daily puzzle. Prefer the cached anchor, then
 * the post's real creation timestamp, then today's UTC date as a last resort.
 */
export async function getPostUtcDate(postId: T3): Promise<string> {
  const key = postDateKey(postId);
  const cached = await redis.get(key);
  if (isUtcDateString(cached)) return cached;

  let date = utcDateString(new Date());
  try {
    const post = await reddit.getPostById(postId);
    date = utcDateString(post.createdAt);
  } catch (error) {
    console.warn(
      `Could not read createdAt for post ${postId}; using UTC today`,
      error
    );
  }

  await redis.set(key, date);
  return date;
}

export async function getUserState(userId: T2): Promise<UserState> {
  const stored = await redis.hGetAll(userKey(userId));
  const lastSolvedDate = stored['lastSolvedDate'];

  return {
    streak: parseCount(stored['streak']),
    ...(isUtcDateString(lastSolvedDate) ? { lastSolvedDate } : {}),
    totalSolves: parseCount(stored['totalSolves']),
  };
}

export async function getUserSolve(
  userId: T2,
  date: string
): Promise<SavedSolve | null> {
  const stored = await redis.hGetAll(userDailyKey(userId, date));
  if (stored['firstSolvedAt'] === undefined) return null;

  let mirrors: MirrorMap = {};
  const rawMirrors = stored['mirrors'];
  if (rawMirrors !== undefined) {
    try {
      const parsed: unknown = JSON.parse(rawMirrors);
      const mirrorMap = parseMirrorMap(parsed);
      if (mirrorMap) mirrors = mirrorMap;
    } catch {
      // A corrupt cached map should not make an otherwise solved user unsolved.
    }
  }

  return {
    mirrors,
    mirrorCount: parseCount(stored['mirrorCount']),
    bounces: parseCount(stored['bounces']),
  };
}

export async function getLeaderboard(
  date: string,
  currentUsername?: string
): Promise<LeaderboardEntry[]> {
  const rows = await redis.zRange(leaderboardKey(date), 0, 9, { by: 'rank' });

  return rows.map((row) => {
    const { mirrors, bounces } = decodeLeaderboardScore(row.score);
    return {
      username: row.member,
      mirrors,
      bounces,
      isCurrentUser: currentUsername === row.member,
    };
  });
}

export async function getCommunityStats(date: string): Promise<CommunityStats> {
  const stored = await redis.hGetAll(statsKey(date));
  return {
    totalSolves: parseCount(stored['solves']),
    parSolves: parseCount(stored['parSolves']),
  };
}

export async function getHeatmap(
  date: string
): Promise<Record<number, number>> {
  const stored = await redis.hGetAll(heatKey(date));
  const heatmap: Record<number, number> = {};

  for (const [field, value] of Object.entries(stored)) {
    const index = Number(field);
    const count = parseCount(value);
    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < CELL_COUNT &&
      count > 0
    ) {
      heatmap[index] = count;
    }
  }

  return heatmap;
}

async function updateLeaderboard(
  date: string,
  username: string,
  mirrors: number,
  bounces: number
): Promise<void> {
  const score = encodeLeaderboardScore(mirrors, bounces);
  const key = leaderboardKey(date);
  const existing = await redis.zScore(key, username);

  if (existing === undefined || score < existing) {
    await redis.zAdd(key, { member: username, score });
  }
}

/**
 * Persists a verified solve. Daily stats and heat only move on the first solve;
 * the leaderboard and saved board move whenever the player improves.
 */
export async function recordSolve(
  input: RecordSolveInput
): Promise<RecordSolveResult> {
  const { date, userId, username, mirrors, bounces, par } = input;
  const dailyKey = userDailyKey(userId, date);
  const mirrorCount = Object.keys(mirrors).length;

  const firstSolve =
    (await redis.hSetNX(dailyKey, 'firstSolvedAt', date)) === 1;
  const existing = firstSolve ? null : await getUserSolve(userId, date);
  const newScore = encodeLeaderboardScore(mirrorCount, bounces);
  const existingScore = existing
    ? encodeLeaderboardScore(existing.mirrorCount, existing.bounces)
    : Number.POSITIVE_INFINITY;

  if (firstSolve || newScore < existingScore) {
    await redis.hSet(dailyKey, {
      mirrors: JSON.stringify(mirrors),
      mirrorCount: String(mirrorCount),
      bounces: String(bounces),
    });
  }

  let user = await getUserState(userId);
  if (firstSolve) {
    const streak = nextStreak(user.lastSolvedDate, date, user.streak);
    await redis.hSet(userKey(userId), {
      streak: String(streak),
      lastSolvedDate: date,
      totalSolves: String(user.totalSolves + 1),
    });

    await Promise.all([
      redis.hIncrBy(statsKey(date), 'solves', 1),
      ...(mirrorCount <= par
        ? [redis.hIncrBy(statsKey(date), 'parSolves', 1)]
        : []),
      ...Object.keys(mirrors).map((index) =>
        redis.hIncrBy(heatKey(date), index, 1)
      ),
    ]);

    user = {
      streak,
      lastSolvedDate: date,
      totalSolves: user.totalSolves + 1,
    };
  }

  await updateLeaderboard(date, username, mirrorCount, bounces);
  return { firstSolve, streak: user.streak };
}

export async function hasShared(postId: T3, userId: T2): Promise<boolean> {
  return (await redis.get(sharedKey(postId, userId))) !== undefined;
}

export async function markShared(postId: T3, userId: T2): Promise<void> {
  await redis.set(sharedKey(postId, userId), '1');
}
