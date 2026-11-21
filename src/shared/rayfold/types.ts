export const GRID_SIZE = 6;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

export type Dir = 'N' | 'E' | 'S' | 'W';

export type MirrorType = '/' | '\\';

export type MirrorMap = Record<number, MirrorType>;

export type BeamColor = 'amber' | 'cyan' | 'magenta';

export type DailyPuzzle = {
  id: number;
  tier: 1 | 2 | 3;
  emitter: { index: number; dir: Dir };
  blockers: number[];
  targets: number[];
  prisms: number[];
  par: number;
  budget: number;
  parSolution: Array<{ index: number; mirror: MirrorType }>;
  firstHintIndex: number;
};

export type Segment = {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  color: BeamColor;
};

export type TraceResult = {
  segments: Segment[];
  litTargets: number[];
  solved: boolean;
  mirrorCount: number;
  bounces: number;
  activeEmptyCells: number[];
};

export type MirrorPlacement = {
  index: number;
  mirror: MirrorType;
};

export type SolveResult = {
  par: number;
  solution: MirrorPlacement[];
};
