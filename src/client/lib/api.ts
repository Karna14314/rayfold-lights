import type {
  HintResponse,
  InitResponse,
  ShareResponse,
  SubmitResponse,
} from '../../shared/api.ts';
import type { MirrorMap } from '../../shared/rayfold/types.ts';

type JourneyHeader = { 'x-devvit-journey-id': string } | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body['message'] === 'string') {
      return body['message'];
    }
  } catch {
    // The response was not JSON; fall back to the status line.
  }
  return `Request failed (${response.status})`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(await errorMessage(response));
  const data: T = await response.json();
  return data;
}

export function fetchInit(signal?: AbortSignal): Promise<InitResponse> {
  return fetchJson<InitResponse>('/api/init', {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
}

export function requestHint(currentMirrors: MirrorMap): Promise<HintResponse> {
  return fetchJson<HintResponse>('/api/hint', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentMirrors }),
  });
}

export function submitSolve(
  mirrors: MirrorMap,
  journeyHeader: JourneyHeader
): Promise<SubmitResponse> {
  return fetchJson<SubmitResponse>('/api/submit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(journeyHeader ?? {}),
    },
    body: JSON.stringify({ mirrors }),
  });
}

export function shareSolve(journeyHeader: JourneyHeader): Promise<ShareResponse> {
  return fetchJson<ShareResponse>('/api/share', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      ...(journeyHeader ?? {}),
    },
  });
}
