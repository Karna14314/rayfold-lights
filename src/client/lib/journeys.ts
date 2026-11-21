import { telemetry } from '@devvit/analytics/client/reddit';

let queue: Promise<void> = Promise.resolve();
let appReadyTracked = false;
let journeyStartTracked = false;
let lastLitCount = 0;
let lastTotalTargets = -1;

function enqueue(task: () => Promise<unknown>): void {
  queue = queue.then(async () => {
    try {
      await task();
    } catch (error) {
      console.warn('RAYFOLD journey telemetry skipped:', error);
    }
  });
}

/** Fires App.Ready once the init payload is loaded and the canvas has mounted. */
export function trackAppReady(): void {
  if (appReadyTracked) return;
  appReadyTracked = true;
  enqueue(() => telemetry.appReady());
}

/** Starts a journey only on the first committed board tap. */
export function trackJourneyStartOnce(): void {
  if (journeyStartTracked) return;
  journeyStartTracked = true;
  enqueue(() => telemetry.startJourney());
}

/**
 * Reports monotonic target progress. Re-lighting the same count is ignored,
 * which keeps journey progress from repeating while a player edits a board.
 */
export function trackTargetProgress(
  litCount: number,
  totalTargets: number
): void {
  if (totalTargets <= 0) return;

  if (totalTargets !== lastTotalTargets) {
    lastTotalTargets = totalTargets;
    lastLitCount = 0;
  }

  const safeLitCount = Math.max(0, Math.min(litCount, totalTargets));
  if (safeLitCount <= lastLitCount) return;

  lastLitCount = safeLitCount;
  enqueue(() =>
    telemetry.progress({
      progress: safeLitCount / totalTargets,
      action: 'target_lit',
    })
  );
}

/** Records a committed player action without ever blocking gameplay. */
export function trackInteraction(action: string): void {
  enqueue(() => telemetry.interaction({ action }));
}

/** Supplies the server-side solve correlation header when a journey is active. */
export function getActiveJourneyHeader():
  | { 'x-devvit-journey-id': string }
  | undefined {
  try {
    const journeyId = telemetry.getActiveJourneyId();
    if (!journeyId) return undefined;
    return { 'x-devvit-journey-id': journeyId };
  } catch {
    return undefined;
  }
}
