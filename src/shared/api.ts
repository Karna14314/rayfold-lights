import type {
  DailyPuzzle,
  MirrorMap,
  MirrorPlacement,
  MirrorType,
} from './rayfold/types.ts';

/**
 * The puzzle payload sent to the browser. `parSolution` is deliberately
 * omitted so the answer never appears in the network response before solving.
 */
export type ClientPuzzle = Omit<DailyPuzzle, 'parSolution'>;

export type LeaderboardEntry = {
  username: string;
  mirrors: number;
  bounces: number;
  isCurrentUser: boolean;
};

export type InitResponse = {
  postId: string;
  utcDate: string;
  puzzleNumber: number;
  puzzle: ClientPuzzle;
  user: {
    username: string;
    streak: number;
    solvedToday: boolean;
    savedMirrors?: MirrorMap;
    bestMirrors?: number;
    bestBounces?: number;
  };
  community: {
    totalSolves: number;
    parSolves: number;
    leaderboard: LeaderboardEntry[];
    /** Only sent once the current user has solved today's puzzle. */
    heatmap?: Record<number, number>;
    /** Only sent once the current user has solved today's puzzle. */
    parSolution?: MirrorPlacement[];
  };
};

export type SubmitRequest = {
  mirrors: MirrorMap;
};

export type SubmitResponse = {
  solved: boolean;
  mirrors: number;
  par: number;
  bounces: number;
  beatPar: boolean;
  streak: number;
  shareText: string;
  parSolution: MirrorPlacement[];
  heatmap: Record<number, number>;
  leaderboard: LeaderboardEntry[];
};

export type HintRequest = {
  currentMirrors: MirrorMap;
};

export type HintResponse = {
  index: number;
  mirror: MirrorType;
} | null;

export type ShareResponse = {
  ok: boolean;
  postedAsComment: boolean;
  alreadyShared?: boolean;
  fallbackText: string;
};
