import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getInitialBeamCells, cellIndex, traceRays } from '../src/shared/rayfold/raycaster.ts';
import { findOptimalSolution } from '../src/shared/rayfold/solver.ts';
import type {
  DailyPuzzle,
  Dir,
  MirrorMap,
  MirrorType,
  Segment,
  TraceResult,
} from '../src/shared/rayfold/types.ts';

type Tier = 1 | 2 | 3;

const TOTAL_SEEDS = 90;
const MAX_ATTEMPTS_PER_SEED = 500;
const RNG_SEED = 0x52415946; // "RAYF"

const failureCounts = new Map<string, number>();

function fail(reason: string): null {
  failureCounts.set(reason, (failureCounts.get(reason) ?? 0) + 1);
  return null;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nextInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pickOne<T>(rng: () => number, items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[nextInt(rng, 0, items.length - 1)];
}

function shuffle<T>(rng: () => number, items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    const a = copy[i];
    const b = copy[j];
    if (a === undefined || b === undefined) continue;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

function unique(items: number[]): number[] {
  return Array.from(new Set(items));
}

function tierForDay(dayIndex: number): Tier {
  const slot = dayIndex % 7;
  if (slot <= 2) return 1;
  if (slot <= 4) return 2;
  return 3;
}

function choosePar(rng: () => number, tier: Tier): number {
  if (tier === 1) return 3;
  if (tier === 2) return rng() < 0.7 ? 3 : 4;
  return 4;
}

function chooseBlockerCount(rng: () => number, tier: Tier): number {
  return tier === 3 ? nextInt(rng, 4, 5) : nextInt(rng, 3, 4);
}

function pickEmitter(rng: () => number): { index: number; dir: Dir } {
  const options: Array<{ index: number; dirs: Dir[] }> = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      if (row !== 0 && row !== 5 && col !== 0 && col !== 5) continue;
      const dirs: Dir[] = [];
      if (row === 0) dirs.push('S');
      if (row === 5) dirs.push('N');
      if (col === 0) dirs.push('E');
      if (col === 5) dirs.push('W');
      if (dirs.length > 0) options.push({ index: cellIndex(row, col), dirs });
    }
  }

  const border = pickOne(rng, options);
  if (!border) throw new Error('No emitter border cells');
  const dir = pickOne(rng, border.dirs);
  if (!dir) throw new Error('No emitter direction');
  return { index: border.index, dir };
}

function makeBasePuzzle(emitter: { index: number; dir: Dir }): DailyPuzzle {
  return {
    id: 0,
    tier: 1,
    emitter,
    blockers: [],
    targets: [],
    prisms: [],
    par: 0,
    budget: 1,
    parSolution: [],
    firstHintIndex: 0,
  };
}

function segmentCells(segment: Segment): number[] {
  const from = cellIndex(segment.fromRow, segment.fromCol);
  const to = cellIndex(segment.toRow, segment.toCol);
  if (from === to) return [from];

  const cells: number[] = [];
  if (segment.fromRow === segment.toRow) {
    const step = segment.toCol > segment.fromCol ? 1 : -1;
    for (let col = segment.fromCol; col !== segment.toCol + step; col += step) {
      cells.push(cellIndex(segment.fromRow, col));
    }
  } else if (segment.fromCol === segment.toCol) {
    const step = segment.toRow > segment.fromRow ? 1 : -1;
    for (let row = segment.fromRow; row !== segment.toRow + step; row += step) {
      cells.push(cellIndex(row, segment.fromCol));
    }
  }
  return cells;
}

function hasOutgoingSegment(trace: TraceResult, mirrorIndex: number): boolean {
  return trace.segments.some(
    (segment) =>
      cellIndex(segment.fromRow, segment.fromCol) === mirrorIndex &&
      (segment.fromRow !== segment.toRow || segment.fromCol !== segment.toCol)
  );
}

function isPrismHit(trace: TraceResult, prismIndex: number): boolean {
  return trace.segments.some(
    (segment) => cellIndex(segment.toRow, segment.toCol) === prismIndex
  );
}

function prismIncomingSegmentIndex(trace: TraceResult, prismIndex: number): number {
  return trace.segments.findIndex(
    (segment) => cellIndex(segment.toRow, segment.toCol) === prismIndex
  );
}

function branchCellsOf(trace: TraceResult, prismIndex: number): number[] {
  const incomingIndex = prismIncomingSegmentIndex(trace, prismIndex);
  if (incomingIndex < 0) return [];
  const cells: number[] = [];
  for (let i = incomingIndex + 1; i < trace.segments.length; i++) {
    const segment = trace.segments[i];
    if (segment) cells.push(...segmentCells(segment));
  }
  return unique(cells);
}

function buildMirrors(
  rng: () => number,
  puzzle: DailyPuzzle,
  par: number
): MirrorMap | null {
  const mirrors: MirrorMap = {};
  let trace = traceRays(puzzle, mirrors);

  for (let step = 0; step < par; step++) {
    const candidates = shuffle(rng, trace.activeEmptyCells);
    if (candidates.length === 0) return null;

    let best:
      | { index: number; mirror: MirrorType; trace: TraceResult; score: number }
      | undefined;

    for (const index of candidates) {
      const options: MirrorType[] = ['/', '\\'];
      for (const mirror of options) {
        const trial = traceRays(puzzle, { ...mirrors, [index]: mirror });
        if (!hasOutgoingSegment(trial, index)) continue;
        const score = trial.activeEmptyCells.length * 3 + trial.segments.length;
        if (!best || score > best.score) {
          best = { index, mirror, trace: trial, score };
        }
      }
    }

    if (!best) return null;
    mirrors[best.index] = best.mirror;
    trace = best.trace;
  }

  return mirrors;
}

function choosePrism(
  rng: () => number,
  puzzle: DailyPuzzle,
  mirrors: MirrorMap,
  trace: TraceResult
): { index: number; trace: TraceResult } | null {
  const finalSegment = trace.segments[trace.segments.length - 1];
  if (!finalSegment) return null;

  const occupied = new Set<number>([
    puzzle.emitter.index,
    ...Object.keys(mirrors).map(Number),
  ]);

  const initialCells = getInitialBeamCells(puzzle);
  const firstMirrorPosition = initialCells.findIndex(
    (cell) => mirrors[cell] !== undefined
  );
  const beforeFirstMirror =
    firstMirrorPosition >= 0
      ? new Set(initialCells.slice(0, firstMirrorPosition + 1))
      : new Set<number>();

  const candidates = shuffle(
    rng,
    segmentCells(finalSegment).filter(
      (index) => !occupied.has(index) && !beforeFirstMirror.has(index)
    )
  );

  let best: { index: number; trace: TraceResult; score: number } | undefined;

  for (const index of candidates) {
    const trialPuzzle: DailyPuzzle = { ...puzzle, prisms: [index] };
    const trial = traceRays(trialPuzzle, mirrors);
    if (!isPrismHit(trial, index)) continue;

    const branches = branchCellsOf(trial, index).filter(
      (cell) => !occupied.has(cell) && cell !== index
    );
    if (branches.length === 0) continue;

    const score = branches.length * 4 + trial.segments.length;
    if (!best || score > best.score) {
      best = { index, trace: trial, score };
    }
  }

  if (!best) return null;
  return { index: best.index, trace: best.trace };
}

function firstVisitSegmentIndex(trace: TraceResult): Map<number, number> {
  const firstVisit = new Map<number, number>();
  trace.segments.forEach((segment, segmentIndex) => {
    for (const cell of segmentCells(segment)) {
      if (!firstVisit.has(cell)) firstVisit.set(cell, segmentIndex);
    }
  });
  return firstVisit;
}

function chooseTargets(
  rng: () => number,
  puzzle: DailyPuzzle,
  mirrors: MirrorMap,
  prismIndex: number,
  trace: TraceResult
): number[] | null {
  const occupied = new Set<number>([
    puzzle.emitter.index,
    ...Object.keys(mirrors).map(Number),
    ...puzzle.prisms,
  ]);

  const isAvailable = (index: number): boolean =>
    !occupied.has(index) && !puzzle.blockers.includes(index);

  const firstVisit = firstVisitSegmentIndex(trace);

  if (prismIndex < 0) {
    const lastIndex = trace.segments.length - 1;
    const lastSegment = trace.segments[lastIndex];
    if (!lastSegment) return null;
    const pool = unique(
      segmentCells(lastSegment).filter(
        (cell) => firstVisit.get(cell) === lastIndex && isAvailable(cell)
      )
    );
    if (pool.length < 3) return null;
    return shuffle(rng, pool).slice(0, 3).sort((a, b) => a - b);
  }

  const incomingIndex = prismIncomingSegmentIndex(trace, prismIndex);
  if (incomingIndex < 0) return null;

  const branchPool: number[] = [];
  for (let i = incomingIndex + 1; i < trace.segments.length; i++) {
    const segment = trace.segments[i];
    if (!segment) continue;
    for (const cell of segmentCells(segment)) {
      if (firstVisit.get(cell) === i && isAvailable(cell)) {
        branchPool.push(cell);
      }
    }
  }

  const pool = unique(branchPool);
  if (pool.length < 3) return null;
  return shuffle(rng, pool).slice(0, 3).sort((a, b) => a - b);
}

function chooseBlockers(
  rng: () => number,
  puzzle: DailyPuzzle,
  mirrors: MirrorMap,
  targets: number[],
  trace: TraceResult,
  count: number
): number[] | null {
  const visited = new Set<number>();
  for (const segment of trace.segments) {
    for (const cell of segmentCells(segment)) visited.add(cell);
  }

  const occupied = new Set<number>([
    puzzle.emitter.index,
    ...Object.keys(mirrors).map(Number),
    ...puzzle.prisms,
    ...targets,
  ]);

  const available: number[] = [];
  for (let index = 0; index < 36; index++) {
    if (!visited.has(index) && !occupied.has(index)) available.push(index);
  }

  if (available.length < count) return null;
  return shuffle(rng, available).slice(0, count).sort((a, b) => a - b);
}

function boardSignature(puzzle: DailyPuzzle): string {
  const blockers = [...puzzle.blockers].sort((a, b) => a - b).join('.');
  const targets = [...puzzle.targets].sort((a, b) => a - b).join('.');
  const prisms = [...puzzle.prisms].sort((a, b) => a - b).join('.');
  return `${puzzle.emitter.index}:${puzzle.emitter.dir}|${blockers}|${targets}|${prisms}`;
}

function constructedSolution(mirrors: MirrorMap): Array<{ index: number; mirror: MirrorType }> {
  return Object.keys(mirrors)
    .map(Number)
    .sort((a, b) => a - b)
    .map((index) => {
      const mirror = mirrors[index];
      if (!mirror) throw new Error(`Missing mirror at ${index}`);
      return { index, mirror };
    });
}

function constructCandidate(
  rng: () => number,
  id: number,
  tier: Tier,
  par: number,
  blockerCount: number
): DailyPuzzle | null {
  const emitter = pickEmitter(rng);
  let puzzle = makeBasePuzzle(emitter);

  const mirrors = buildMirrors(rng, puzzle, par);
  if (!mirrors) return fail('build-mirrors');

  let prismIndex = -1;
  if (tier > 1) {
    let trace = traceRays(puzzle, mirrors);
    const prism = choosePrism(rng, puzzle, mirrors, trace);
    if (!prism) return fail('choose-prism');
    prismIndex = prism.index;
    puzzle = { ...puzzle, prisms: [prismIndex] };
    trace = prism.trace;
  }

  const trace = traceRays(puzzle, mirrors);
  const targets = chooseTargets(rng, puzzle, mirrors, prismIndex, trace);
  if (!targets || targets.length !== 3) return fail('choose-targets');

  const blockers = chooseBlockers(rng, puzzle, mirrors, targets, trace, blockerCount);
  if (!blockers) return fail('choose-blockers');

  puzzle = {
    ...puzzle,
    id,
    tier,
    blockers,
    targets,
    par,
    budget: par + 1,
  };

  const built = traceRays(puzzle, mirrors);
  if (!built.solved) return fail('built-unsolved');
  if (tier > 1 && (prismIndex < 0 || !isPrismHit(built, prismIndex))) {
    return fail('prism-not-hit');
  }

  const initialCells = getInitialBeamCells(puzzle);
  const hint = initialCells.find((index) => mirrors[index] !== undefined);
  if (hint === undefined) return fail('no-hint');

  const solution = constructedSolution(mirrors);
  if (solution.length !== par) return fail('solution-length');

  puzzle.parSolution = solution;
  puzzle.firstHintIndex = hint;

  const optimal = findOptimalSolution(puzzle, par);
  if (!optimal) return fail('no-solver-solution');
  if (optimal.par !== par) return fail(`solver-par-${optimal.par}`);

  return puzzle;
}

function main(): void {
  const rng = mulberry32(RNG_SEED);
  const seeds: DailyPuzzle[] = [];
  const signatures = new Set<string>();
  const startedAt = Date.now();
  let attempts = 0;

  for (let id = 1; id <= TOTAL_SEEDS; id++) {
    const tier = tierForDay(id - 1);
    const par = choosePar(rng, tier);
    const blockerCount = chooseBlockerCount(rng, tier);

    let accepted: DailyPuzzle | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_SEED; attempt++) {
      attempts++;
      const candidate = constructCandidate(rng, id, tier, par, blockerCount);
      if (!candidate) continue;
      const signature = boardSignature(candidate);
      if (signatures.has(signature)) continue;
      accepted = candidate;
      signatures.add(signature);
      break;
    }

    if (!accepted) {
      console.error('Failure breakdown:', Object.fromEntries(failureCounts));
      throw new Error(
        `Failed to generate seed ${id} (tier ${tier}, par ${par}) after ${MAX_ATTEMPTS_PER_SEED} attempts`
      );
    }

    seeds.push(accepted);
    if (id % 10 === 0 || id === TOTAL_SEEDS) {
      console.log(`  ${id}/${TOTAL_SEEDS} seeds accepted (${attempts} attempts)`);
    }
  }

  const outputPath = fileURLToPath(new URL('../src/shared/rayfold/seeds.json', import.meta.url));
  writeFileSync(outputPath, `${JSON.stringify(seeds, null, 2)}\n`, 'utf8');
  const elapsedMs = Date.now() - startedAt;
  console.log(`Generated ${seeds.length} verified seeds in ${elapsedMs} ms`);
  console.log(`Wrote ${outputPath}`);
  console.log(`Total construction attempts: ${attempts}`);
}

main();
