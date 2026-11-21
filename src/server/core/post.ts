import { reddit } from '@devvit/web/server';
import { getDailyPuzzle } from '../../shared/rayfold/daily.ts';
import { utcDateString } from '../../shared/rayfold/progress.ts';
import { ensureShareThread } from './storage.ts';

/**
 * Creates the day's interactive post. The app account owns the post so the
 * daily thread stays stable even if the requesting moderator leaves.
 */
export async function createDailyPost(
  date: string = utcDateString(new Date())
) {
  const puzzle = getDailyPuzzle(date);

  const post = await reddit.submitCustomPost({
    title: `RAYFOLD #${puzzle.id} — Daily Optical Puzzle (${date})`,
    entry: 'default',
  });

  await ensureShareThread(post.id);
  return post;
}
