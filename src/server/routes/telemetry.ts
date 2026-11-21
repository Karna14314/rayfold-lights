import { Hono } from 'hono';
import { telemetry } from '@devvit/analytics/server/reddit';
import {
  TELEMETRY_JOURNEY_ENDPOINTS,
  TELEMETRY_UNSPECIFIED_RECEIPT,
} from '@devvit/analytics/shared/reddit';
import type {
  TelemetryJourneyInteractionRequest,
  TelemetryJourneyProgressRequest,
} from '@devvit/analytics/shared/reddit';
import { isRecord } from '../../shared/rayfold/progress.ts';

const invalidReceipt = {
  status: 'JOURNEY_RECEIPT_INVALID',
  message: 'Invalid: Event payload was not recorded.',
} as const;

type Validation<T> = { value: T } | { error: string };

type EndJourneyInput = {
  journeyId: string;
  complete: boolean;
  game?: { win: boolean; score: number };
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function toProgressRequest(
  body: unknown
): Validation<TelemetryJourneyProgressRequest> {
  if (!isRecord(body)) return { error: 'Expected a JSON object body.' };

  const { journeyId, progress, action, actionDetails } = body;
  if (!isNonEmptyString(journeyId)) return { error: 'journeyId is required.' };
  if (!isFiniteNumber(progress)) {
    return { error: 'progress must be a number between 0 and 1.' };
  }
  if (progress < 0 || progress > 1) {
    return { error: 'progress must be between 0 and 1.' };
  }
  if (action !== undefined && !isNonEmptyString(action)) {
    return { error: 'action must be a non-empty string.' };
  }
  if (actionDetails !== undefined && !isNonEmptyString(actionDetails)) {
    return { error: 'actionDetails must be a non-empty string.' };
  }

  return {
    value: {
      journeyId,
      progress,
      ...(action !== undefined ? { action } : {}),
      ...(actionDetails !== undefined ? { actionDetails } : {}),
    },
  };
}

function toInteractionRequest(
  body: unknown
): Validation<TelemetryJourneyInteractionRequest> {
  if (!isRecord(body)) return { error: 'Expected a JSON object body.' };

  const { journeyId, action, actionDetails } = body;
  if (journeyId !== undefined && typeof journeyId !== 'string') {
    return { error: 'journeyId must be a string.' };
  }
  if (!isNonEmptyString(action)) return { error: 'action is required.' };
  if (actionDetails !== undefined && !isNonEmptyString(actionDetails)) {
    return { error: 'actionDetails must be a non-empty string.' };
  }

  return {
    value: {
      action,
      ...(isNonEmptyString(journeyId) ? { journeyId } : {}),
      ...(actionDetails !== undefined ? { actionDetails } : {}),
    },
  };
}

function toEndRequest(body: unknown): Validation<EndJourneyInput> {
  if (!isRecord(body)) return { error: 'Expected a JSON object body.' };

  const { journeyId, complete, game } = body;
  if (!isNonEmptyString(journeyId)) return { error: 'journeyId is required.' };
  if (complete !== undefined && typeof complete !== 'boolean') {
    return { error: 'complete must be a boolean.' };
  }
  if (game !== undefined) {
    if (!isRecord(game)) return { error: 'game must be an object.' };
    if (game['win'] !== undefined && typeof game['win'] !== 'boolean') {
      return { error: 'game.win must be a boolean.' };
    }
    if (game['score'] !== undefined && !isFiniteNumber(game['score'])) {
      return { error: 'game.score must be a number.' };
    }
  }

  const gameWin = isRecord(game) ? game['win'] : undefined;
  const gameScore = isRecord(game) ? game['score'] : undefined;

  return {
    value: {
      journeyId,
      complete: complete ?? false,
      ...(game !== undefined
        ? {
            game: {
              win: typeof gameWin === 'boolean' ? gameWin : false,
              score: isFiniteNumber(gameScore) ? gameScore : 0,
            },
          }
        : {}),
    },
  };
}

async function readJson(c: {
  req: { json: <T = unknown>() => Promise<T> };
}): Promise<Validation<unknown>> {
  try {
    return { value: await c.req.json() };
  } catch {
    return { error: 'Expected a JSON object body.' };
  }
}

export const telemetryRoutes = new Hono();

telemetryRoutes.onError((error, c) => {
  console.error('Telemetry route error:', error);
  return c.json(
    { error: 'Internal server error', receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
    500
  );
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.start, async (c) => {
  const response = await telemetry.startJourney();
  if (response.journeyId.trim().length === 0) {
    return c.json(
      {
        error: 'Telemetry journey id missing',
        receipt: TELEMETRY_UNSPECIFIED_RECEIPT,
      },
      500
    );
  }
  return c.json(response);
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.progress, async (c) => {
  const body = await readJson(c);
  if ('error' in body) {
    return c.json({ error: body.error, receipt: invalidReceipt }, 400);
  }

  const request = toProgressRequest(body.value);
  if ('error' in request) {
    return c.json({ error: request.error, receipt: invalidReceipt }, 400);
  }

  return c.json(await telemetry.journeyProgress(request.value));
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.interaction, async (c) => {
  const body = await readJson(c);
  if ('error' in body) {
    return c.json({ error: body.error, receipt: invalidReceipt }, 400);
  }

  const request = toInteractionRequest(body.value);
  if ('error' in request) {
    return c.json({ error: request.error, receipt: invalidReceipt }, 400);
  }

  return c.json(
    await telemetry.journeyInteraction({
      journeyId: request.value.journeyId ?? '',
      action: request.value.action,
      actionDetails: request.value.actionDetails ?? '',
    })
  );
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.end, async (c) => {
  const body = await readJson(c);
  if ('error' in body) {
    return c.json({ error: body.error, receipt: invalidReceipt }, 400);
  }

  const request = toEndRequest(body.value);
  if ('error' in request) {
    return c.json({ error: request.error, receipt: invalidReceipt }, 400);
  }

  return c.json(await telemetry.endJourney(request.value));
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.appReady, async (c) => {
  return c.json(await telemetry.appReady());
});
