import { Hono } from 'hono';
import { createDailyPost } from '../core/post.ts';

export const scheduler = new Hono();

scheduler.post('/daily-post', async (c) => {
  try {
    const post = await createDailyPost();

    return c.json(
      {
        status: 'success',
        message: `Created daily RAYFOLD post ${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating scheduled post: ${error}`);
    return c.json(
      {
        status: 'error',
        message: 'Failed to create the daily post',
      },
      500
    );
  }
});
