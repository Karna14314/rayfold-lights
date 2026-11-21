import type { SubmitResponse } from '../../shared/api.ts';

export type ShareState = 'idle' | 'sharing' | 'shared' | 'copied';

export type EndCardProps = {
  result: SubmitResponse;
  puzzleNumber: number;
  username: string;
  shareState: ShareState;
  showParGhost: boolean;
  showHeatmap: boolean;
  canShowParGhost: boolean;
  canShowHeatmap: boolean;
  onToggleParGhost: () => void;
  onToggleHeatmap: () => void;
  onShare: () => void;
  onViewBoard: () => void;
  onDismiss: () => void;
};

const shareLabels: Record<ShareState, string> = {
  idle: 'Comment score',
  sharing: 'Commenting…',
  shared: 'Posted to comments!',
  copied: 'Copied to clipboard!',
};

function ToggleButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center gap-1.5 rounded-md border px-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] transition ${
        active
          ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-200'
          : 'border-slate-700/70 bg-slate-800/40 text-slate-400 hover:border-slate-500/80 hover:text-slate-200'
      } ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rotate-45 ${
          active ? 'bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-slate-600'
        }`}
      />
      {label}
    </button>
  );
}

export function EndCard({
  result,
  puzzleNumber,
  username,
  shareState,
  showParGhost,
  showHeatmap,
  canShowParGhost,
  canShowHeatmap,
  onToggleParGhost,
  onToggleHeatmap,
  onShare,
  onViewBoard,
  onDismiss,
}: EndCardProps) {
  const perfect = result.mirrors <= result.par;
  const topFive = result.leaderboard.slice(0, 5);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#05080D]/75 p-2.5 backdrop-blur-[2px]">
      <div className="rf-card-in relative flex max-h-full w-full max-w-[372px] flex-col overflow-y-auto overscroll-contain rounded-xl border border-slate-600/60 bg-[#101827] shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)]">
        <div
          aria-hidden
          className={`h-[3px] w-full shrink-0 ${
            perfect
              ? 'bg-gradient-to-r from-amber-400/10 via-amber-300 to-amber-400/10'
              : 'bg-gradient-to-r from-cyan-400/10 via-cyan-300 to-cyan-400/10'
          }`}
        />

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss results"
          className="absolute right-1.5 top-2 z-10 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-800/70 hover:text-slate-200"
        >
          <span aria-hidden className="text-lg leading-none">
            ×
          </span>
        </button>

        <div className="px-4 pb-2 pt-3.5">
          <div className="font-mono text-[8px] uppercase tracking-[0.24em] text-slate-500">
            RAYFOLD #{String(puzzleNumber).padStart(3, '0')} · solved
          </div>
          <h2
            className={`mt-1.5 text-[21px] font-black leading-none tracking-[0.06em] ${
              perfect ? 'text-amber-300' : 'text-cyan-200'
            }`}
          >
            {perfect ? "ARCHITECT'S PAR!" : 'SOLVED!'}
          </h2>
          <p className="mt-1 pr-8 text-[10px] leading-snug text-slate-400">
            {perfect
              ? 'The beam folds exactly along the architect’s blueprint.'
              : 'Every target is lit. There may be a leaner fold.'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1.5 px-4">
          <Stat label="Mirrors" value={String(result.mirrors)} sub={`PAR ${result.par}`} />
          <Stat label="Bounces" value={String(result.bounces)} sub="BEAM" />
          <Stat label="Streak" value={`${result.streak}`} sub="DAYS" />
        </div>

        <div className="mx-4 mt-2.5 overflow-hidden rounded-lg border border-slate-700/60 bg-[#0B1018]/80">
          <div className="flex items-center justify-between border-b border-slate-800/80 px-2.5 py-1">
            <span className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Opticians today
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">
              Top 5
            </span>
          </div>
          {topFive.length === 0 ? (
            <div className="px-2.5 py-2 font-mono text-[9px] text-slate-500">
              No other solves yet.
            </div>
          ) : (
            <ol>
              {topFive.map((entry, position) => (
                <li
                  key={`${entry.username}-${position}`}
                  className={`flex items-center gap-2 px-2.5 py-[3px] font-mono text-[9.5px] ${
                    entry.isCurrentUser ? 'bg-amber-400/10 text-amber-100' : 'text-slate-300'
                  }`}
                >
                  <span className="w-3 shrink-0 text-slate-600">{position + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{entry.username}</span>
                  <span className="shrink-0 text-slate-500">
                    M{entry.mirrors} · B{entry.bounces}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex gap-1.5 px-4 pt-2.5">
          <ToggleButton
            label="Par ghost"
            active={showParGhost}
            disabled={!canShowParGhost}
            onClick={onToggleParGhost}
          />
          <ToggleButton
            label="Heatmap"
            active={showHeatmap}
            disabled={!canShowHeatmap}
            onClick={onToggleHeatmap}
          />
        </div>

        <div className="flex flex-col gap-1.5 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
          <p className="px-1 text-center font-mono text-[8px] uppercase tracking-[0.1em] text-slate-500">
            Posts a spoiler-free score comment as{' '}
            <span className="text-slate-300">u/{username}</span>
          </p>
          <button
            type="button"
            onClick={onShare}
            disabled={shareState === 'sharing' || shareState === 'shared'}
            className="inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center gap-2 rounded-md border border-amber-300/60 bg-gradient-to-b from-amber-300 to-amber-500 px-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#1A1206] shadow-[0_5px_18px_-8px_rgba(245,166,35,0.7)] transition active:scale-[0.99] disabled:opacity-70"
          >
            <span aria-hidden className="text-[10px] opacity-70">
              ◆
            </span>
            {shareLabels[shareState]}
          </button>
          <button
            type="button"
            onClick={onViewBoard}
            className="inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center rounded-md border border-slate-700/70 bg-slate-800/40 px-3 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
          >
            View board
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-2 py-1.5 text-center">
      <div className="font-mono text-[7.5px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="font-mono text-lg font-bold leading-tight text-slate-100">
        {value}
      </div>
      <div className="font-mono text-[7.5px] uppercase tracking-[0.14em] text-slate-600">
        {sub}
      </div>
    </div>
  );
}
