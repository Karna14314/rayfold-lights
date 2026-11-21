import './index.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { InitResponse } from '../shared/api.ts';
import { fetchInit } from './lib/api.ts';
import { HelpSheet } from './components/HelpSheet.tsx';
import { OpticalCanvas } from './components/OpticalCanvas.tsx';

const TIER_LABEL: Record<1 | 2 | 3, string> = {
  1: 'TIER I · REFRACTION',
  2: 'TIER II · DISPERSION',
  3: 'TIER III · INTERFERENCE',
};

const TIER_PILL: Record<1 | 2 | 3, string> = {
  1: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-200',
  2: 'border-amber-400/35 bg-amber-400/10 text-amber-200',
  3: 'border-pink-400/35 bg-pink-400/10 text-pink-200',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: InitResponse };

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-screen w-screen select-none flex-col overflow-hidden bg-[#0B1018] text-slate-200">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 78% 58% at 50% -12%, rgba(245,166,35,0.13), transparent 62%), radial-gradient(ellipse 62% 48% at 92% 112%, rgba(34,211,238,0.08), transparent 68%)',
        }}
      />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        {children}
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <Shell>
      <header className="mx-auto flex w-full max-w-[560px] items-start justify-between px-4 pt-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-black tracking-[0.3em] text-amber-300">
            RAYFOLD
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-500">
            Optical bench loading
          </span>
        </div>
        <span className="rf-breathe h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(245,166,35,0.8)]" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6">
        <div className="relative flex aspect-square w-full max-w-[180px] items-center justify-center overflow-hidden rounded-lg border border-slate-700/60 bg-[#131B29]">
          <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(34,48,71,0.9)_1px,transparent_1px),linear-gradient(90deg,rgba(34,48,71,0.9)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="rf-breathe relative h-10 w-10 rounded-full bg-[radial-gradient(circle,rgba(255,231,181,0.95),rgba(245,166,35,0.35)_55%,transparent_72%)]" />
          <div className="absolute left-1/2 top-1/2 h-[2px] w-24 -translate-y-1/2 translate-x-2 bg-gradient-to-r from-amber-300/90 to-transparent" />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-slate-500">
          Calibrating optics…
        </p>
      </div>
      <div className="h-14 shrink-0" />
    </Shell>
  );
}

function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Shell>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-pink-300/80">
          Bench offline
        </span>
        <p className="max-w-[280px] text-[13px] leading-snug text-slate-400">
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-slate-600/70 bg-slate-800/60 px-5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200 transition hover:border-amber-400/60 hover:text-amber-200"
        >
          Retry scan
        </button>
      </div>
    </Shell>
  );
}

function SplashCard({ data }: { data: InitResponse }) {
  const { puzzle, user, community } = data;
  const solved = user.solvedToday;
  const tier = puzzle.tier;
  const [helpOpen, setHelpOpen] = useState(false);

  const openGame = (event: MouseEvent<HTMLButtonElement>): void => {
    requestExpandedMode(event.nativeEvent, 'game');
  };

  return (
    <Shell>
      <header className="mx-auto flex w-full max-w-[560px] shrink-0 items-start justify-between gap-3 px-4 pt-2.5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-black tracking-[0.3em] text-amber-300">
              RAYFOLD
            </span>
            <span className="font-mono text-[10px] font-semibold tracking-wider text-slate-400">
              #{String(data.puzzleNumber).padStart(3, '0')}
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
            <span>{data.utcDate}</span>
            <span aria-hidden className="text-slate-700">
              /
            </span>
            <span className="truncate">{context.username ?? 'guest'}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] ${TIER_PILL[tier]}`}
          >
            {TIER_LABEL[tier]}
          </span>
          {solved ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-emerald-300">
              <span aria-hidden>◆</span> Solved
            </span>
          ) : null}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-1.5">
        <div className="relative flex h-full w-full items-center justify-center">
          <div
            aria-hidden
            className="pointer-events-none absolute h-[78%] w-[78%] rounded-full bg-[radial-gradient(circle,rgba(245,166,35,0.08),transparent_70%)]"
          />
          <OpticalCanvas
            puzzle={puzzle}
            mirrors={user.savedMirrors ?? {}}
            showParGhost={false}
            showHeatmap={false}
            className="flex h-full w-full items-center justify-center"
          />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[560px] shrink-0 items-center justify-between gap-1.5 px-4 pb-1.5 font-mono text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden>🔥</span>
          <span className="font-bold text-amber-200/90">{user.streak}</span>
          <span className="text-slate-500">day streak</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="text-cyan-300/80">
            ◈
          </span>
          <span className="font-bold text-slate-200">{community.totalSolves}</span>
          <span className="text-slate-500">folded today</span>
        </span>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-md px-1 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-cyan-200/90 transition hover:text-cyan-100"
        >
          <span aria-hidden>?</span> How to play
        </button>
      </div>

      <div className="mx-auto w-full max-w-[560px] shrink-0 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-1">
        <p className="mb-1 text-center font-mono text-[8.5px] uppercase tracking-[0.18em] text-slate-500">
          Fold the beam · light all {puzzle.targets.length} diamonds
        </p>
        <button
          type="button"
          onClick={openGame}
          className="group relative inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center gap-2 overflow-hidden rounded-md border border-amber-300/60 bg-gradient-to-b from-amber-300 to-amber-500 px-4 text-[12px] font-black uppercase tracking-[0.16em] text-[#1A1206] shadow-[0_6px_24px_-8px_rgba(245,166,35,0.65)] transition active:scale-[0.99]"
        >
          <span aria-hidden className="text-[10px] opacity-70">
            ▸
          </span>
          {solved ? 'View my solution' : "Play today's puzzle"}
        </button>
      </div>

      {helpOpen ? (
        <HelpSheet puzzle={puzzle} onClose={() => setHelpOpen(false)} />
      ) : null}
    </Shell>
  );
}

export const Splash = () => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void fetchInit(controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : 'Could not reach the bench.';
        setState({ status: 'error', message });
      });

    return () => controller.abort();
  }, [attempt]);

  if (state.status === 'loading') return <LoadingCard />;
  if (state.status === 'error') {
    return (
      <ErrorCard
        message={state.message}
        onRetry={() => {
          setState({ status: 'loading' });
          setAttempt((value) => value + 1);
        }}
      />
    );
  }
  return <SplashCard data={state.data} />;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
