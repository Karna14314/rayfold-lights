import './index.css';

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { InitResponse, SubmitResponse } from '../shared/api.ts';
import { traceRays } from '../shared/rayfold/raycaster.ts';
import type { MirrorMap, MirrorType } from '../shared/rayfold/types.ts';
import { EndCard } from './components/EndCard.tsx';
import type { ShareState } from './components/EndCard.tsx';
import { HelpSheet } from './components/HelpSheet.tsx';
import { OpticalCanvas } from './components/OpticalCanvas.tsx';
import {
  isMuted,
  playBudgetShake,
  playMirrorPlace,
  playMirrorRemove,
  playSolved,
  playTargetLit,
  primeAudio,
  toggleMute,
} from './lib/audio.ts';
import { fetchInit, requestHint, shareSolve, submitSolve } from './lib/api.ts';
import {
  getActiveJourneyHeader,
  trackAppReady,
  trackInteraction,
  trackJourneyStartOnce,
  trackTargetProgress,
} from './lib/journeys.ts';

type SubmitPhase = 'idle' | 'celebrating' | 'submitting' | 'done' | 'error';

const HELP_SEEN_KEY = 'rf:help-seen:v1';

function hasSeenHelp(): boolean {
  try {
    return window.localStorage.getItem(HELP_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function markHelpSeen(): void {
  try {
    window.localStorage.setItem(HELP_SEEN_KEY, '1');
  } catch {
    // Storage can be unavailable inside the embedded webview; the manual
    // button still works, we just avoid forcing the sheet every launch.
  }
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: InitResponse };

function buildInitialResult(data: InitResponse): SubmitResponse | null {
  if (!data.user.solvedToday || !data.user.savedMirrors) return null;

  const trace = traceRays(data.puzzle, data.user.savedMirrors);
  if (!trace.solved) return null;

  return {
    solved: true,
    mirrors: trace.mirrorCount,
    par: data.puzzle.par,
    bounces: trace.bounces,
    beatPar: trace.mirrorCount < data.puzzle.par,
    streak: data.user.streak,
    shareText: '',
    parSolution: data.community.parSolution ?? [],
    heatmap: data.community.heatmap ?? {},
    leaderboard: data.community.leaderboard,
  };
}

function useTransientMessage(): {
  message: string | null;
  push: (text: string) => void;
} {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const push = useCallback((text: string): void => {
    setMessage(text);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setMessage(null);
      timerRef.current = null;
    }, 2400);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  return { message, push };
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" />
      {muted ? (
        <path d="M16 9.5l4.5 5M20.5 9.5L16 14.5" />
      ) : (
        <>
          <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
          <path d="M18 6.8a7.4 7.4 0 0 1 0 10.4" />
        </>
      )}
    </svg>
  );
}

function TierDiamonds({
  targets,
  litTargets,
}: {
  targets: readonly number[];
  litTargets: readonly number[];
}) {
  const lit = new Set(litTargets);
  return (
    <div
      role="img"
      aria-label={`${lit.size} of ${targets.length} targets lit`}
      className="flex shrink-0 items-center gap-1 px-0.5"
    >
      {targets.map((target) => (
        <span
          key={target}
          className={`block h-[7px] w-[7px] rotate-45 border ${
            lit.has(target)
              ? 'border-amber-200 bg-amber-300 shadow-[0_0_7px_rgba(245,166,35,0.9)]'
              : 'border-slate-600/90 bg-slate-800/50'
          }`}
        />
      ))}
    </div>
  );
}

function GameBoard({ data }: { data: InitResponse }) {
  const { puzzle, user } = data;
  const initialResult = useMemo(() => buildInitialResult(data), [data]);

  const [mirrors, setMirrors] = useState<MirrorMap>(() => ({
    ...(data.user.savedMirrors ?? {}),
  }));
  const [history, setHistory] = useState<MirrorMap[]>([]);
  const [hintIndex, setHintIndex] = useState<number | null>(null);
  const [hintPending, setHintPending] = useState(false);
  const [budgetShakeKey, setBudgetShakeKey] = useState(0);
  const [muted, setMuted] = useState<boolean>(() => isMuted());
  const [canvasReady, setCanvasReady] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(initialResult);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>(
    initialResult ? 'done' : 'idle'
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(initialResult !== null);
  const [showParGhost, setShowParGhost] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [shareState, setShareState] = useState<ShareState>('idle');
  const [helpOpen, setHelpOpen] = useState(
    () => !data.user.solvedToday && !hasSeenHelp()
  );

  const closeHelp = useCallback((): void => {
    markHelpSeen();
    setHelpOpen(false);
  }, []);

  const hintTimerRef = useRef<number | null>(null);
  const previousLitCountRef = useRef(-1);
  const { message: toast, push: pushToast } = useTransientMessage();

  const trace = useMemo(() => traceRays(puzzle, mirrors), [puzzle, mirrors]);
  const mirrorCount = Object.keys(mirrors).length;

  const structureCells = useMemo(
    () =>
      new Set<number>([
        puzzle.emitter.index,
        ...puzzle.blockers,
        ...puzzle.targets,
        ...puzzle.prisms,
      ]),
    [puzzle]
  );

  const locked =
    result !== null ||
    submitPhase === 'celebrating' ||
    submitPhase === 'submitting';
  const interactive = !locked;

  const submitBoard = useCallback((): void => {
    setSubmitError(null);
    setSubmitPhase('submitting');
    void submitSolve({ ...mirrors }, getActiveJourneyHeader())
      .then((response) => {
        setResult(response);
        setSubmitPhase('done');
        setCardOpen(true);
      })
      .catch((error: unknown) => {
        setSubmitPhase('error');
        setSubmitError(
          error instanceof Error ? error.message : 'Could not submit the solve.'
        );
      });
  }, [mirrors]);

  const handleCanvasReady = useCallback((): void => {
    setCanvasReady(true);
  }, []);

  useEffect(() => {
    if (!canvasReady) return;
    trackAppReady();
  }, [canvasReady]);

  useEffect(() => {
    const count = trace.litTargets.length;
    const previous = previousLitCountRef.current;
    previousLitCountRef.current = count;

    if (previous < 0) return;

    trackTargetProgress(count, puzzle.targets.length);
    if (count <= previous || trace.solved) return;

    if (count === 1) playTargetLit(1);
    else if (count === 2) playTargetLit(2);
    else playTargetLit(3);
  }, [trace.litTargets.length, trace.solved, puzzle.targets.length]);

  useEffect(() => {
    if (submitPhase !== 'celebrating') return;
    const timeout = window.setTimeout(submitBoard, 520);
    return () => window.clearTimeout(timeout);
  }, [submitPhase, submitBoard]);

  const maybeCelebrate = (nextMirrors: MirrorMap): void => {
    if (result !== null) return;
    const nextTrace = traceRays(puzzle, nextMirrors);
    if (!nextTrace.solved) return;
    if (nextTrace.mirrorCount > puzzle.budget) return;

    setSubmitPhase('celebrating');
    playSolved(nextTrace.mirrorCount < puzzle.par);
  };

  useEffect(
    () => () => {
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
      }
    },
    []
  );

  const handleCellTap = (index: number, next: MirrorType | null): void => {
    if (!interactive) return;
    if (structureCells.has(index)) return;

    const current = mirrors[index];
    if (current === next) return;

    trackJourneyStartOnce();
    setHistory((previous) => [...previous.slice(-49), { ...mirrors }]);

    const updated: MirrorMap = { ...mirrors };
    if (next === null) {
      delete updated[index];
    } else {
      updated[index] = next;
    }

    setMirrors(updated);
    maybeCelebrate(updated);
    setHintIndex(null);
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    if (submitPhase === 'error') {
      setSubmitPhase('idle');
      setSubmitError(null);
    }

    if (next === null) {
      playMirrorRemove();
    } else {
      playMirrorPlace();
      trackInteraction(current === undefined ? 'mirror_placed' : 'mirror_rotated');
    }
  };

  const handleBudgetExceeded = (): void => {
    setBudgetShakeKey((value) => value + 1);
    playBudgetShake();
    pushToast(`Mirror budget reached · ${puzzle.budget} max`);
  };

  const handleUndo = (): void => {
    if (!interactive) return;
    const previous = history[history.length - 1];
    if (!previous) return;

    setHistory(history.slice(0, -1));
    setMirrors(previous);
    setHintIndex(null);
    playMirrorRemove();
    setSubmitError(null);
    if (submitPhase === 'error') setSubmitPhase('idle');
  };

  const handleClear = (): void => {
    if (!interactive || mirrorCount === 0) return;

    setHistory((previous) => [...previous.slice(-49), { ...mirrors }]);
    setMirrors({});
    setHintIndex(null);
    playMirrorRemove();
    setSubmitError(null);
    if (submitPhase === 'error') setSubmitPhase('idle');
  };

  const handleHint = (): void => {
    if (!interactive || hintPending) return;

    setHintPending(true);
    void requestHint(mirrors)
      .then((response) => {
        if (!response) {
          pushToast('No hint available — the par route is already on the board.');
          return;
        }
        if (structureCells.has(response.index)) return;

        setHistory((previous) => [...previous.slice(-49), { ...mirrors }]);
        const updated = { ...mirrors, [response.index]: response.mirror };
        setMirrors(updated);
        maybeCelebrate(updated);
        setHintIndex(response.index);
        setSubmitError(null);
        if (submitPhase === 'error') setSubmitPhase('idle');
        playMirrorPlace();
        trackInteraction('hint_used');

        if (hintTimerRef.current !== null) {
          window.clearTimeout(hintTimerRef.current);
        }
        hintTimerRef.current = window.setTimeout(() => {
          setHintIndex(null);
          hintTimerRef.current = null;
        }, 4200);
      })
      .catch((error: unknown) => {
        pushToast(
          error instanceof Error ? error.message : 'Hint unavailable right now.'
        );
      })
      .finally(() => {
        setHintPending(false);
      });
  };

  const handleMute = (): void => {
    setMuted(toggleMute());
  };

  const handleShare = (): void => {
    if (shareState === 'sharing') return;

    setShareState('sharing');
    void shareSolve(getActiveJourneyHeader())
      .then((response) => {
        if (response.postedAsComment) {
          setShareState('shared');
          pushToast('Posted to comments!');
          trackInteraction('comment_shared');
          return;
        }

        const clipboard = navigator.clipboard;
        if (!clipboard) {
          setShareState('idle');
          pushToast('Clipboard unavailable in this view.');
          return;
        }

        void clipboard
          .writeText(response.fallbackText)
          .then(() => {
            setShareState('copied');
            pushToast('Copied to clipboard!');
            trackInteraction('comment_shared');
          })
          .catch(() => {
            setShareState('idle');
            pushToast('Clipboard permission was denied.');
          });
      })
      .catch((error: unknown) => {
        setShareState('idle');
        pushToast(
          error instanceof Error ? error.message : 'Sharing is unavailable right now.'
        );
      });
  };

  const handleToggleParGhost = (): void => {
    setShowParGhost((value) => !value);
    trackInteraction('par_ghost_toggled');
  };

  const handleToggleHeatmap = (): void => {
    setShowHeatmap((value) => !value);
    trackInteraction('heatmap_toggled');
  };

  const showOnboarding =
    mirrorCount === 0 && !user.solvedToday && result === null;
  const parSolution = result?.parSolution ?? [];
  const heatmap = result?.heatmap ?? {};
  const canShowParGhost = parSolution.length > 0;
  const canShowHeatmap = Object.keys(heatmap).length > 0;
  const celebrating =
    submitPhase === 'celebrating' || submitPhase === 'submitting';
  const boardInteractive = interactive && !hintPending;

  return (
    <div
      className="relative flex h-screen w-screen select-none flex-col overflow-hidden bg-[#0B1018] text-slate-200"
      onPointerDownCapture={() => primeAudio()}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -15%, rgba(245,166,35,0.1), transparent 60%), radial-gradient(ellipse 60% 45% at 100% 110%, rgba(34,211,238,0.07), transparent 65%)',
        }}
      />

      <header className="relative z-20 flex h-11 shrink-0 items-center gap-1.5 border-b border-[#223047]/80 bg-[#0D1420]/90 px-2">
        <div className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5">
          <span className="text-[10px] font-black leading-none tracking-[0.18em] text-amber-300">
            RAYFOLD
          </span>
          <span className="font-mono text-[8px] font-bold leading-none text-amber-200/70">
            #{String(data.puzzleNumber).padStart(3, '0')}
          </span>
        </div>

        <div className="min-w-0 flex-1" />

        <div
          key={budgetShakeKey}
          className={`min-w-0 text-right font-mono text-[9px] leading-none tracking-[-0.01em] text-slate-400 ${
            budgetShakeKey > 0 ? 'rf-budget-shake' : ''
          }`}
        >
          <span className="text-slate-200">Mirrors {mirrorCount}</span>
          <span className="text-slate-600">/{puzzle.budget}</span>
          <span className="mx-1 text-slate-700">·</span>
          <span className="text-slate-400">Par {puzzle.par}</span>
        </div>

        <TierDiamonds targets={puzzle.targets} litTargets={trace.litTargets} />

        <button
          type="button"
          onClick={handleMute}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          aria-pressed={muted}
          className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md transition ${
            muted
              ? 'text-slate-600 hover:text-slate-400'
              : 'text-cyan-200/80 hover:text-cyan-100'
          }`}
        >
          <SpeakerIcon muted={muted} />
        </button>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col px-2 py-1.5">
        <div className="flex shrink-0 items-center justify-between gap-2 px-1 pb-1 font-mono text-[8px] uppercase tracking-[0.16em]">
          <span className="text-slate-500">
            Goal ·{' '}
            <span className="text-slate-300">
              light all {puzzle.targets.length} diamonds
            </span>
          </span>
          <span
            className={
              trace.solved ? 'text-amber-300' : 'text-slate-500'
            }
          >
            {trace.litTargets.length}/{puzzle.targets.length} lit
          </span>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <OpticalCanvas
            puzzle={puzzle}
            mirrors={mirrors}
            interactive={boardInteractive}
            showParGhost={showParGhost && canShowParGhost}
            showHeatmap={showHeatmap && canShowHeatmap}
            showOnboarding={showOnboarding}
            celebrating={celebrating}
            parSolution={parSolution}
            heatmap={heatmap}
            hintIndex={hintIndex}
            onCellTap={handleCellTap}
            onBudgetExceeded={handleBudgetExceeded}
            onReady={handleCanvasReady}
            className="flex h-full w-full items-center justify-center"
          />

          {celebrating ? (
            <div className="pointer-events-none absolute inset-x-0 top-1 z-20 flex justify-center">
              <span className="rounded-full border border-amber-300/50 bg-[#1A1206]/92 px-3 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-amber-200 shadow-[0_0_18px_rgba(245,166,35,0.25)]">
                {submitPhase === 'celebrating'
                  ? 'Beam locked'
                  : 'Recording blueprint'}
              </span>
            </div>
          ) : null}

          {result !== null && !cardOpen ? (
            <button
              type="button"
              onClick={() => setCardOpen(true)}
              className="absolute right-0.5 top-0.5 z-20 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-amber-400/40 bg-[#151007]/90 px-2 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-amber-200 shadow-lg"
            >
              Results
            </button>
          ) : null}

          {submitError !== null && result === null ? (
            <div className="absolute inset-x-0.5 top-0.5 z-20 flex items-center gap-2 rounded-md border border-pink-400/40 bg-[#2A0F1B]/95 px-2 py-1 shadow-lg">
              <span className="min-w-0 flex-1 text-[9px] leading-tight text-pink-100/90">
                {submitError}
              </span>
              <button
                type="button"
                onClick={submitBoard}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-pink-300/50 bg-pink-400/10 px-2 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-pink-100"
              >
                Retry
              </button>
            </div>
          ) : null}

          {showOnboarding ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
              <span className="rounded-full border border-amber-400/25 bg-[#0B1018]/80 px-2.5 py-0.5 font-mono text-[7.5px] uppercase tracking-[0.16em] text-amber-200/70">
                Tap the pulsing cell
              </span>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="relative z-20 flex h-[68px] shrink-0 items-center border-t border-[#223047]/80 bg-[#0D1420]/95 px-2.5 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-[520px] items-center gap-1.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!boardInteractive || history.length === 0}
            className="inline-flex h-12 min-h-[48px] min-w-[44px] flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-700/70 bg-slate-800/35 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-slate-300 transition enabled:hover:border-slate-500 enabled:hover:text-slate-100 disabled:opacity-30"
          >
            <span aria-hidden className="text-[13px] leading-none">
              ↶
            </span>
            Undo
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!boardInteractive || mirrorCount === 0}
            className="inline-flex h-12 min-h-[48px] min-w-[44px] flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-700/70 bg-slate-800/35 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-slate-300 transition enabled:hover:border-slate-500 enabled:hover:text-slate-100 disabled:opacity-30"
          >
            <span aria-hidden className="text-[13px] leading-none">
              ⌫
            </span>
            Clear
          </button>
          <button
            type="button"
            onClick={handleHint}
            disabled={!boardInteractive || hintPending}
            className="inline-flex h-12 min-h-[48px] min-w-[44px] flex-1 items-center justify-center gap-1.5 rounded-md border border-amber-400/45 bg-amber-400/10 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-amber-200 transition enabled:hover:border-amber-300/70 enabled:hover:bg-amber-400/15 disabled:opacity-40"
          >
            <span aria-hidden className="text-[11px] leading-none">
              ✦
            </span>
            {hintPending ? 'Scan' : 'Hint'}
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="inline-flex h-12 min-h-[48px] min-w-[44px] flex-1 items-center justify-center gap-1.5 rounded-md border border-cyan-400/35 bg-cyan-400/10 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-200 transition hover:border-cyan-300/60 hover:bg-cyan-400/15"
          >
            <span aria-hidden className="text-[11px] leading-none">
              ?
            </span>
            Help
          </button>
        </div>
      </footer>

      {cardOpen && result !== null ? (
        <EndCard
          result={result}
          puzzleNumber={data.puzzleNumber}
          username={data.user.username}
          shareState={shareState}
          showParGhost={showParGhost}
          showHeatmap={showHeatmap}
          canShowParGhost={canShowParGhost}
          canShowHeatmap={canShowHeatmap}
          onToggleParGhost={handleToggleParGhost}
          onToggleHeatmap={handleToggleHeatmap}
          onShare={handleShare}
          onViewBoard={() => setCardOpen(false)}
          onDismiss={() => setCardOpen(false)}
        />
      ) : null}

      {helpOpen ? (
        <HelpSheet puzzle={puzzle} onClose={closeHelp} />
      ) : null}

      {toast !== null ? (
        <div className="pointer-events-none absolute left-1/2 top-[52px] z-40 -translate-x-1/2">
          <div className="rounded-full border border-slate-600/70 bg-[#161F2D]/95 px-3 py-1.5 font-mono text-[9px] tracking-[0.02em] text-slate-200 shadow-xl">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GameStatus({
  status,
  message,
  onRetry,
}: {
  status: 'loading' | 'error';
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="relative flex h-screen w-screen select-none flex-col items-center justify-center overflow-hidden bg-[#0B1018] px-6 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 20%, rgba(245,166,35,0.12), transparent 65%)',
        }}
      />
      <div className="relative flex flex-col items-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <span
            className={`absolute inset-0 rounded-full border border-amber-400/25 ${
              status === 'loading' ? 'rf-breathe' : ''
            }`}
          />
          <span
            className={`absolute inset-2 rotate-45 border ${
              status === 'loading'
                ? 'rf-spin-slow border-cyan-300/50'
                : 'border-pink-400/50'
            }`}
          />
          <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(245,166,35,0.9)]" />
        </div>

        <div className="flex flex-col gap-1.5">
          <h1 className="text-[15px] font-black tracking-[0.3em] text-amber-300">
            RAYFOLD
          </h1>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
            {status === 'loading' ? 'Folding the light path…' : 'Bench unreachable'}
          </p>
          {status === 'error' && message !== undefined ? (
            <p className="max-w-[260px] text-[11px] leading-snug text-slate-400">
              {message}
            </p>
          ) : null}
        </div>

        {status === 'error' && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-amber-400/50 bg-amber-400/10 px-5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200 transition hover:bg-amber-400/20"
          >
            Retry scan
          </button>
        ) : null}
      </div>
    </div>
  );
}

export const Game = () => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void fetchInit(controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Could not reach the optical bench.',
        });
      });

    return () => controller.abort();
  }, [attempt]);

  if (state.status === 'loading') {
    return <GameStatus status="loading" />;
  }

  if (state.status === 'error') {
    return (
      <GameStatus
        status="error"
        message={state.message}
        onRetry={() => {
          setState({ status: 'loading' });
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  return <GameBoard data={state.data} />;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Game />
  </StrictMode>
);
