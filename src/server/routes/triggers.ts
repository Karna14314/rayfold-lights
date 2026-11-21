import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import { createDailyPost } from '../core/post.ts';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createDailyPost();

    return c.json(
      {
        status: 'success',
        message: `Post created in subreddit ${context.subredditName} with id ${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json(
      {
        status: 'error',
        message: 'Failed to create post',
      },
      400
    );
  }
});
