import { analyse, setVariant } from './checkers-engine.js';

self.onmessage = (e) => {
  const { id, board, side, timeMs, maxDepth, multiPv, variant } = e.data;
  setVariant(variant);
  const res = analyse(board, side, {
    timeMs, maxDepth, multiPv,
    onDepth: (r) => self.postMessage({ id, partial: true, result: r }),
  });
  self.postMessage({ id, partial: false, result: res });
};
