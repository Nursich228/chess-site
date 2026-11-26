import { bestMove, makeRules } from './corners-engine.js';

self.onmessage = (e) => {
  const { id, board, side, size, diag, maxDepth, timeMs, random, seen } = e.data;
  const R = makeRules(size, diag);
  const m = bestMove(board, side, R, { maxDepth, timeMs, random, seen: seen ? new Set(seen) : null });
  self.postMessage({ id, move: m });
};
