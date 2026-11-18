// Opening page: step through the opening line on a read-only board.
import { Chess } from './chess.js';
import { Board } from './board.js';
import { $, $$ } from './common.js';

const BASE = new URL('./', import.meta.url).href;
const uci = JSON.parse($('#opData').textContent).uci;
const fens = [new Chess().fen()];
const lasts = [null];
{
  const g = new Chess();
  for (const u of uci) { const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }); fens.push(g.fen()); lasts.push(m); }
}
let ply = uci.length;
const board = new Board($('#board'), { pieceUrl: (c) => `${BASE}pieces/${c}.svg` });

function show() {
  const g = new Chess(fens[ply]); const map = {};
  g.board().forEach((r) => r.forEach((p) => { if (p) map[p.square] = p.color + p.type; }));
  board.setPosition(map);
  const h = {}; const m = lasts[ply];
  if (m) { h[m.from] = 'last'; h[m.to] = 'last'; }
  board.setHighlights(h);
  $$('#opMoves .ply').forEach((b) => b.classList.toggle('on', +b.dataset.ply === ply));
}
const go = (p) => { ply = Math.max(0, Math.min(uci.length, p)); show(); };
$$('[data-op]').forEach((b) => b.addEventListener('click', () => {
  const a = b.dataset.op;
  if (a === 'first') go(0); else if (a === 'prev') go(ply - 1); else if (a === 'next') go(ply + 1); else if (a === 'last') go(uci.length); else if (a === 'flip') board.flip();
}));
$$('#opMoves .ply').forEach((b) => b.addEventListener('click', () => go(+b.dataset.ply)));
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowLeft') go(ply - 1); else if (e.key === 'ArrowRight') go(ply + 1);
});
show();
