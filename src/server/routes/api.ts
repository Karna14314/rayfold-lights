import { Hono } from 'hono';
import type { Context } from 'hono';
import { telemetry } from '@devvit/analytics/server/reddit';
import { context, reddit } from '@devvit/web/server';
import type {
  ClientPuzzle,
  HintResponse,
  InitResponse,
  ShareResponse,
  SubmitResponse,
} from '../../shared/api.ts';
import {
  formatSpoilerFreeCard,
  getDailyPuzzle,
} from '../../shared/rayfold/daily.ts';
import { traceRays } from '../../shared/rayfold/raycaster.ts';
import {
  encodeLeaderboardScore,
  isRecord,
  parseMirrorMap,
  pickHint,
} from '../../shared/rayfold/progress.ts';
import type { DailyPuzzle } from '../../shared/rayfold/types.ts';
import {
  ensureShareThread,
  getCommunityStats,
  getHeatmap,
  getLeaderboard,
  getPostUtcDate,
  getUserSolve,
  getUserState,
  hasShared,
  markShared,
  recordSolve,
} from '../core/storage.ts';
import { telemetryRoutes } from './telemetry.ts';

type ErrorResponse = {
  status: 'error';
  message: string;
};

function apiError(
  c: Context,
  message: string,
  status: 400 | 401 | 500 = 400
): Response {
  return c.json<ErrorResponse>({ status: 'error', message }, status);
}

function toClientPuzzle(puzzle: DailyPuzzle): ClientPuzzle {
  return {
    id: puzzle.id,
    tier: puzzle.tier,
    emitter: puzzle.emitter,
    blockers: puzzle.blockers,
    targets: puzzle.targets,
    prisms: puzzle.prisms,
    par: puzzle.par,
    budget: puzzle.budget,
    firstHintIndex: puzzle.firstHintIndex,
  };
}

export const api = new Hono();

api.route('/telemetry', telemetryRoutes);

api.onError((error, c) => {
  console.error('RAYFOLD API error:', error);
  return apiError(c, 'Internal server error', 500);
});

api.get('/init', async (c) => {
  const { postId, userId, username } = context;
  if (!postId) return apiError(c, 'postId is required', 400);

  const utcDate = await getPostUtcDate(postId);
  const puzzle = getDailyPuzzle(utcDate);
  const displayName = username ?? 'anonymous';

  const [stats, leaderboard, userState, saved] = await Promise.all([
    getCommunityStats(utcDate),
    getLeaderboard(utcDate, username),
    userId ? getUserState(userId) : Promise.resolve(null),
    userId ? getUserSolve(userId, utcDate) : Promise.resolve(null),
  ]);

  const solvedToday = saved !== null;
  const community: InitResponse['community'] = {
    totalSolves: stats.totalSolves,
    parSolves: stats.parSolves,
    leaderboard,
  };

  if (solvedToday) {
    community.heatmap = await getHeatmap(utcDate);
    community.parSolution = puzzle.parSolution;
  }

  const user: InitResponse['user'] = {
    username: displayName,
    streak: userState?.streak ?? 0,
    solvedToday,
  };

  if (saved) {
    user.savedMirrors = saved.mirrors;
    user.bestMirrors = saved.mirrorCount;
    user.bestBounces = saved.bounces;
  }

  return c.json<InitResponse>({
    postId,
    utcDate,
    puzzleNumber: puzzle.id,
    puzzle: toClientPuzzle(puzzle),
    user,
    community,
  });
});

api.post('/hint', async (c) => {
  const { postId } = context;
  if (!postId) return apiError(c, 'postId is required', 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 'Expected a JSON request body', 400);
  }

  const currentMirrors = isRecord(body)
    ? parseMirrorMap(body['currentMirrors'])
    : null;
  if (!currentMirrors)
    return apiError(c, 'currentMirrors must be a mirror map', 400);

  const utcDate = await getPostUtcDate(postId);
  const puzzle = getDailyPuzzle(utcDate);

  return c.json<HintResponse>(pickHint(puzzle.parSolution, currentMirrors));
});

api.post('/submit', async (c) => {
  const { postId, userId, username } = context;
  if (!postId) return apiError(c, 'postId is required', 400);
  if (!userId || !username)
    return apiError(c, 'Sign in to submit a solve', 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 'Expected a JSON request body', 400);
  }

  const mirrors = isRecord(body) ? parseMirrorMap(body['mirrors']) : null;
  if (!mirrors) return apiError(c, 'mirrors must be a mirror map', 400);

  const utcDate = await getPostUtcDate(postId);
  const puzzle = getDailyPuzzle(utcDate);

  const occupied = new Set<number>([
    puzzle.emitter.index,
    ...puzzle.blockers,
    ...puzzle.targets,
    ...puzzle.prisms,
  ]);
  for (const key of Object.keys(mirrors)) {
    if (occupied.has(Number(key))) {
      return apiError(c, 'Mirrors cannot be placed on structure cells', 400);
    }
  }

  const trace = traceRays(puzzle, mirrors);
  if (!trace.solved)
    return apiError(c, 'The beam does not light every target', 400);
  if (trace.mirrorCount > puzzle.budget) {
    return apiError(c, `Mirror budget exceeded (${puzzle.budget})`, 400);
  }

  const mirrorCount = trace.mirrorCount;
  const { streak } = await recordSolve({
    date: utcDate,
    userId,
    username,
    mirrors,
    bounces: trace.bounces,
    par: puzzle.par,
  });

  const [heatmap, leaderboard] = await Promise.all([
    getHeatmap(utcDate),
    getLeaderboard(utcDate, username),
  ]);

  const journeyId = c.req.header('x-devvit-journey-id')?.trim();
  if (journeyId) {
    try {
      await telemetry.endJourney({
        journeyId,
        complete: true,
        game: {
          win: true,
          score: encodeLeaderboardScore(mirrorCount, trace.bounces),
        },
      });
    } catch (error) {
      console.warn('Journey end failed; solve response continues', error);
    }
  }

  return c.json<SubmitResponse>({
    solved: true,
    mirrors: mirrorCount,
    par: puzzle.par,
    bounces: trace.bounces,
    beatPar: mirrorCount < puzzle.par,
    streak,
    shareText: formatSpoilerFreeCard({
      puzzleNumber: puzzle.id,
      mirrors: mirrorCount,
      par: puzzle.par,
      bounces: trace.bounces,
      streak,
    }),
    parSolution: puzzle.parSolution,
    heatmap,
    leaderboard,
  });
});

api.post('/share', async (c) => {
  const { postId, userId } = context;
  if (!postId) return apiError(c, 'postId is required', 400);
  if (!userId) return apiError(c, 'Sign in to share your solve', 401);

  const utcDate = await getPostUtcDate(postId);
  const puzzle = getDailyPuzzle(utcDate);
  const [saved, user] = await Promise.all([
    getUserSolve(userId, utcDate),
    getUserState(userId),
  ]);

  if (!saved) return apiError(c, 'Solve today’s puzzle before sharing', 400);

  const fallbackText = formatSpoilerFreeCard({
    puzzleNumber: puzzle.id,
    mirrors: saved.mirrorCount,
    par: puzzle.par,
    bounces: saved.bounces,
    streak: user.streak,
  });

  if (await hasShared(postId, userId)) {
    return c.json<ShareResponse>({
      ok: true,
      postedAsComment: false,
      alreadyShared: true,
      fallbackText,
    });
  }

  try {
    const threadId = await ensureShareThread(postId);
    if (!threadId) {
      return c.json<ShareResponse>({
        ok: true,
        postedAsComment: false,
        fallbackText,
      });
    }

    await reddit.submitComment({
      id: threadId,
      text: fallbackText,
      runAs: 'USER',
    });
    await markShared(postId, userId);
    return c.json<ShareResponse>({
      ok: true,
      postedAsComment: true,
      fallbackText,
    });
  } catch (error) {
    console.warn('Comment share failed; returning clipboard fallback', error);
    return c.json<ShareResponse>({
      ok: true,
      postedAsComment: false,
      fallbackText,
    });
  }
});
