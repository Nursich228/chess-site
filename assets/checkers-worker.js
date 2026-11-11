import { analyse } from './checkers-engine.js';

self.onmessage = (e) => {
  const { id, board, side, timeMs, maxDepth, multiPv } = e.data;
  const res = analyse(board, side, {
    timeMs, maxDepth, multiPv,
    onDepth: (r) => self.postMessage({ id, partial: true, result: r }),
  });
  self.postMessage({ id, partial: false, result: res });
};
