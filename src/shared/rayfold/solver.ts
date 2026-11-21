import { traceRays } from './raycaster.ts';
import type {
  DailyPuzzle,
  MirrorMap,
  MirrorPlacement,
  MirrorType,
  SolveResult,
} from './types.ts';

function canonicalKey(mirrors: MirrorMap): string {
  return Object.keys(mirrors)
    .map(Number)
    .sort((a, b) => a - b)
    .map((index) => `${index}:${mirrors[index]}`)
    .join(',');
}

function toPlacements(mirrors: MirrorMap): MirrorPlacement[] {
  return Object.keys(mirrors)
    .map(Number)
    .sort((a, b) => a - b)
    .map((index) => {
      const mirror = mirrors[index];
      if (!mirror) throw new Error(`Missing mirror at ${index}`);
      return { index, mirror };
    });
}

/**
 * Iterative-deepening DFS. Each node traces the live beam and only branches on
 * open cells the beam actually crosses, so mirror permutations never explode
 * across all 36 tiles. Canonical configurations are memoized per depth.
 */
export function findOptimalSolution(
  puzzle: DailyPuzzle,
  maxMirrors: number
): SolveResult | null {
  for (let limit = 1; limit <= maxMirrors; limit++) {
    const seenByDepth = new Map<number, Set<string>>();

    const search = (mirrors: MirrorMap, depth: number): MirrorPlacement[] | null => {
      const trace = traceRays(puzzle, mirrors);
      if (trace.solved) return toPlacements(mirrors);
      if (depth >= limit) return null;

      const key = canonicalKey(mirrors);
      let seen = seenByDepth.get(depth);
      if (!seen) {
        seen = new Set<string>();
        seenByDepth.set(depth, seen);
      }
      if (seen.has(key)) return null;
      seen.add(key);

      for (const index of trace.activeEmptyCells) {
        const mirrorOptions: MirrorType[] = ['/', '\\'];
        for (const mirror of mirrorOptions) {
          const nextMirrors: MirrorMap = { ...mirrors, [index]: mirror };
          const found = search(nextMirrors, depth + 1);
          if (found) return found;
        }
      }

      return null;
    };

    const solution = search({}, 0);
    if (solution) {
      return { par: solution.length, solution };
    }
  }

  return null;
}
