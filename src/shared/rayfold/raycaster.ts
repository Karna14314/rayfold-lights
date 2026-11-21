import {
  CELL_COUNT,
  GRID_SIZE,
  type BeamColor,
  type DailyPuzzle,
  type Dir,
  type MirrorMap,
  type MirrorType,
  type Segment,
  type TraceResult,
} from './types.ts';

type Delta = { dr: number; dc: number };

/** The raycaster never reads `parSolution`, so client puzzles can be traced directly. */
export type TraceablePuzzle = Omit<DailyPuzzle, 'parSolution'>;

const DELTAS: Record<Dir, Delta> = {
  N: { dr: -1, dc: 0 },
  E: { dr: 0, dc: 1 },
  S: { dr: 1, dc: 0 },
  W: { dr: 0, dc: -1 },
};

const SLASH: Record<Dir, Dir> = { N: 'E', E: 'N', S: 'W', W: 'S' };
const BACKSLASH: Record<Dir, Dir> = { N: 'W', E: 'S', S: 'E', W: 'N' };

export function cellIndex(row: number, col: number): number {
  return row * GRID_SIZE + col;
}

export function cellRow(index: number): number {
  return Math.floor(index / GRID_SIZE);
}

export function cellCol(index: number): number {
  return index % GRID_SIZE;
}

export function reflectDirection(dir: Dir, mirror: MirrorType): Dir {
  return mirror === '/' ? SLASH[dir] : BACKSLASH[dir];
}

function splitDirections(dir: Dir): [Dir, Dir] {
  return dir === 'N' || dir === 'S' ? ['E', 'W'] : ['N', 'S'];
}

function isInside(row: number, col: number): boolean {
  return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;
}

/**
 * Cells on the emitter's straight, mirror-free opening beam. Targets are
 * transparent; blockers and prisms stop the walk. Used for Move-1 onboarding.
 */
export function getInitialBeamCells(puzzle: TraceablePuzzle): number[] {
  const blockers = new Set(puzzle.blockers);
  const prisms = new Set(puzzle.prisms);
  const cells: number[] = [];
  let row = cellRow(puzzle.emitter.index);
  let col = cellCol(puzzle.emitter.index);

  while (true) {
    const delta = DELTAS[puzzle.emitter.dir];
    const nextRow = row + delta.dr;
    const nextCol = col + delta.dc;
    if (!isInside(nextRow, nextCol)) break;

    const nextIndex = cellIndex(nextRow, nextCol);
    if (nextIndex === puzzle.emitter.index) break;
    if (blockers.has(nextIndex)) break;

    cells.push(nextIndex);
    if (prisms.has(nextIndex)) break;

    row = nextRow;
    col = nextCol;
  }

  return cells;
}

type Ray = {
  row: number;
  col: number;
  dir: Dir;
  color: BeamColor;
  startRow: number;
  startCol: number;
};

/**
 * Trace the emitter through the current mirrors, structures, and prisms.
 * Every active ray is explored; prism children are queued after the parent.
 */
export function traceRays(
  puzzle: TraceablePuzzle,
  mirrors: MirrorMap
): TraceResult {
  const emitterIndex = puzzle.emitter.index;
  const blockers = new Set(puzzle.blockers);
  const targets = new Set(puzzle.targets);
  const prisms = new Set(puzzle.prisms);
  const mirrorIndices = new Set(Object.keys(mirrors).map(Number));

  const visited = new Set<string>();
  const litTargets = new Set<number>();
  const activeEmpty = new Set<number>();
  const segments: Segment[] = [];
  const queue: Ray[] = [
    {
      row: cellRow(emitterIndex),
      col: cellCol(emitterIndex),
      dir: puzzle.emitter.dir,
      color: 'amber',
      startRow: cellRow(emitterIndex),
      startCol: cellCol(emitterIndex),
    },
  ];

  let bounces = 0;

  const pushSegment = (
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    color: BeamColor
  ): void => {
    if (fromRow === toRow && fromCol === toCol) return;
    segments.push({ fromRow, fromCol, toRow, toCol, color });
  };

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
    const ray = queue[queueIndex];
    if (!ray) continue;

    const startKey = `${cellIndex(ray.row, ray.col)}:${ray.dir}:${ray.color}`;
    if (visited.has(startKey)) continue;
    visited.add(startKey);

    let row = ray.row;
    let col = ray.col;
    let dir = ray.dir;
    let startRow = ray.startRow;
    let startCol = ray.startCol;

    while (true) {
      const delta = DELTAS[dir];
      const nextRow = row + delta.dr;
      const nextCol = col + delta.dc;

      if (!isInside(nextRow, nextCol)) {
        pushSegment(startRow, startCol, row, col, ray.color);
        break;
      }

      const nextIndex = cellIndex(nextRow, nextCol);
      const stateKey = `${nextIndex}:${dir}:${ray.color}`;

      if (visited.has(stateKey)) {
        pushSegment(startRow, startCol, nextRow, nextCol, ray.color);
        break;
      }
      visited.add(stateKey);

      if (nextIndex === emitterIndex) {
        pushSegment(startRow, startCol, nextRow, nextCol, ray.color);
        break;
      }

      if (blockers.has(nextIndex)) {
        pushSegment(startRow, startCol, nextRow, nextCol, ray.color);
        break;
      }

      if (prisms.has(nextIndex)) {
        pushSegment(startRow, startCol, nextRow, nextCol, ray.color);
        bounces++;
        const [firstDir, secondDir] = splitDirections(dir);
        queue.push({
          row: nextRow,
          col: nextCol,
          dir: firstDir,
          color: 'cyan',
          startRow: nextRow,
          startCol: nextCol,
        });
        queue.push({
          row: nextRow,
          col: nextCol,
          dir: secondDir,
          color: 'magenta',
          startRow: nextRow,
          startCol: nextCol,
        });
        break;
      }

      if (mirrorIndices.has(nextIndex)) {
        const mirror = mirrors[nextIndex];
        if (!mirror) {
          pushSegment(startRow, startCol, nextRow, nextCol, ray.color);
          break;
        }
        pushSegment(startRow, startCol, nextRow, nextCol, ray.color);
        bounces++;
        dir = reflectDirection(dir, mirror);
        row = nextRow;
        col = nextCol;
        startRow = nextRow;
        startCol = nextCol;
        continue;
      }

      if (targets.has(nextIndex)) {
        litTargets.add(nextIndex);
      } else {
        activeEmpty.add(nextIndex);
      }

      row = nextRow;
      col = nextCol;
    }
  }

  const lit = Array.from(litTargets).sort((a, b) => a - b);
  return {
    segments,
    litTargets: lit,
    solved: lit.length === puzzle.targets.length,
    mirrorCount: Object.keys(mirrors).length,
    bounces,
    activeEmptyCells: Array.from(activeEmpty).sort((a, b) => a - b),
  };
}

export function isInsideBoard(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < CELL_COUNT;
}
