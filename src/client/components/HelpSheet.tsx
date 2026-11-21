import type { ReactNode } from 'react';
import type { ClientPuzzle } from '../../shared/api.ts';

export type HelpSheetProps = {
  puzzle: ClientPuzzle;
  onClose: () => void;
};

function MirrorGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="2"
        fill="rgba(30,41,59,0.55)"
        stroke="rgba(100,116,139,0.65)"
      />
      <path
        d="M7 17L17 7"
        stroke="#F5A623"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M13.2 6.8H17.2V10.8"
        fill="none"
        stroke="rgba(245,166,35,0.55)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EmitterGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
      <circle cx="12" cy="12" r="8" fill="rgba(30,41,59,0.55)" stroke="rgba(100,116,139,0.65)" />
      <circle cx="12" cy="12" r="4.5" fill="rgba(245,166,35,0.18)" />
      <circle cx="12" cy="12" r="2.4" fill="#FBBF24" />
      <path d="M16.5 12H22" stroke="#F5A623" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PrismGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
      <path
        d="M12 3.5L20 19.5H4L12 3.5Z"
        fill="rgba(30,41,59,0.55)"
        stroke="rgba(148,163,184,0.65)"
        strokeWidth="1.2"
      />
      <path d="M12 17V9" stroke="rgba(226,232,240,0.65)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M12 9L16 5.5" stroke="#22D3EE" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 9L8 5.5" stroke="#F472B6" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TargetGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
      <path
        d="M12 3L21 12L12 21L3 12Z"
        fill="rgba(245,166,35,0.16)"
        stroke="#F5A623"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 8.2L15.8 12L12 15.8L8.2 12Z" fill="#FBBF24" />
    </svg>
  );
}

function BlockerGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
      <path
        d="M5 4.5H19L20.5 6V18L19 19.5H5L3.5 18V6L5 4.5Z"
        fill="#18202E"
        stroke="rgba(148,163,184,0.35)"
      />
      <path
        d="M5 7L17 19M8 4L20 16M4 12L12 20M12 4L20 12"
        stroke="rgba(148,163,184,0.28)"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function LegendRow({
  glyph,
  name,
  detail,
}: {
  glyph: ReactNode;
  name: string;
  detail: string;
}) {
  return (
    <li className="flex items-center gap-2.5 border-t border-slate-800/70 py-1.5 first:border-t-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700/60 bg-slate-800/35">
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-slate-200">
          {name}
        </span>
        <span className="block text-[10px] leading-snug text-slate-400">
          {detail}
        </span>
      </span>
    </li>
  );
}

export function HelpSheet({ puzzle, onClose }: HelpSheetProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#05080D]/82 p-2.5 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rf-help-title"
        className="rf-card-in relative flex max-h-full w-full max-w-[372px] flex-col overflow-y-auto overscroll-contain rounded-xl border border-slate-600/60 bg-[#101827] shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)]"
      >
        <div
          aria-hidden
          className="h-[3px] w-full shrink-0 bg-gradient-to-r from-amber-400/10 via-amber-300 to-amber-400/10"
        />

        <div className="px-4 pb-2 pt-3.5">
          <div className="font-mono text-[8px] uppercase tracking-[0.24em] text-slate-500">
            Optical bench manual
          </div>
          <h2
            id="rf-help-title"
            className="mt-1.5 text-[21px] font-black leading-none tracking-[0.06em] text-amber-300"
          >
            FOLD THE LIGHT
          </h2>
          <p className="mt-1 text-[11px] leading-snug text-slate-300">
            Light all {puzzle.targets.length} diamonds with one continuous beam,
            using no more than {puzzle.budget} mirrors. Par is the fewest mirrors
            needed.
          </p>
        </div>

        <ol className="mx-4 flex flex-col gap-1 rounded-lg border border-slate-700/60 bg-[#0B1018]/80 px-2.5 py-2 text-[10px] leading-snug text-slate-300">
          <li className="flex gap-2">
            <span className="mt-[1px] font-mono text-[9px] font-bold text-amber-300">1</span>
            <span>
              The <span className="text-amber-200">emitter</span> fires the beam. It
              travels in a straight line until something bends, splits, or stops it.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-[1px] font-mono text-[9px] font-bold text-amber-300">2</span>
            <span>
              Tap an empty cell to place a mirror. Tap it again to rotate the mirror.
              A third tap removes it.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-[1px] font-mono text-[9px] font-bold text-amber-300">3</span>
            <span>
              Mirrors turn the beam 90°. A prism splits it into two beams.{' '}
              <span className="text-pink-200">Hatched cells</span> stop the beam.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-[1px] font-mono text-[9px] font-bold text-amber-300">4</span>
            <span>
              Stuck? <span className="text-amber-200">Hint</span> places one par
              mirror. Undo and Clear adjust the bench. After solving, compare with
              the Par ghost and the community heatmap.
            </span>
          </li>
        </ol>

        <div className="mx-4 mt-2.5 overflow-hidden rounded-lg border border-slate-700/60 bg-[#0B1018]/80">
          <div className="border-b border-slate-800/80 px-2.5 py-1">
            <span className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Bench pieces
            </span>
          </div>
          <ul className="px-2.5">
            <LegendRow
              glyph={<EmitterGlyph />}
              name="Emitter"
              detail="The amber source of the beam."
            />
            <LegendRow
              glyph={<MirrorGlyph />}
              name="Mirror"
              detail="Bends the beam 90°; place and rotate it."
            />
            <LegendRow
              glyph={<PrismGlyph />}
              name="Prism"
              detail="Splits the beam into cyan and magenta."
            />
            <LegendRow
              glyph={<TargetGlyph />}
              name="Target"
              detail="Hollow diamond to light; all must be lit."
            />
            <LegendRow
              glyph={<BlockerGlyph />}
              name="Blocker"
              detail="Hatched cell; the beam cannot pass."
            />
          </ul>
        </div>

        <div className="flex flex-col gap-1.5 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
          <p className="text-center font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">
            One board per day · resets 00:00 UTC
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center rounded-md border border-amber-300/60 bg-gradient-to-b from-amber-300 to-amber-500 px-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#1A1206] shadow-[0_5px_18px_-8px_rgba(245,166,35,0.7)] transition active:scale-[0.99]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
