// Corners (уголки) on an 8x8 board. No dependencies.
// Board: array of 64, index = row*8+col, row 0 = rank 8 (top), col 0 = file a.
// 1 = white piece, -1 = black piece, 0 = empty. White starts in the bottom-left corner,
// black in the top-right corner. White moves first.
// A move is a step to a neighbouring empty square (vertically/horizontally, plus diagonally
// if `diag` is on) or a chain of jumps over neighbouring pieces of any colour.

export const FILES = 'abcdefgh';
export const sqName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
export const sqIndex = (n) => (8 - parseInt(n[1], 10)) * 8 + FILES.indexOf(n[0]);
export const LIMIT = 40; // by his 40th move a player must have left his own corner

const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const ALL8 = [...ORTHO, [-1, -1], [-1, 1], [1, -1], [1, 1]];

// Corner squares. size 9 -> 3x3, size 12 -> 4 wide x 3 tall.
export function homeSquares(side, size) {
  const w = size === 12 ? 4 : 3, h = 3, out = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const white = r >= 8 - h && c < w;            // bottom-left
    const black = r < h && c >= 8 - w;            // top-right
    if ((side === 1 && white) || (side === -1 && black)) out.push(r * 8 + c);
  }
  return out;
}

export function startBoard(size) {
  const b = new Array(64).fill(0);
  for (const i of homeSquares(1, size)) b[i] = 1;
  for (const i of homeSquares(-1, size)) b[i] = -1;
  return b;
}

// Game rules object: {size, diag}
export function makeRules(size = 9, diag = false) {
  const H = { 1: homeSquares(1, size), '-1': homeSquares(-1, size) };
  return { size, diag, dirs: diag ? ALL8 : ORTHO, home: (s) => H[s], target: (s) => H[-s] };
}

const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

// All legal moves of side: [{from, to, path}]
export function generateMoves(b, side, R) {
  const out = [];
  for (let i = 0; i < 64; i++) {
    if (b[i] !== side) continue;
    const r = Math.floor(i / 8), c = i % 8;
    const seen = new Set([i]);
    // steps
    for (const [dr, dc] of R.dirs) {
      const nr = r + dr, nc = c + dc;
      if (!inside(nr, nc)) continue;
      const t = nr * 8 + nc;
      if (b[t] === 0 && !seen.has(t)) { seen.add(t); out.push({ from: i, to: t, path: [i, t] }); }
    }
    // jumps (breadth first, so each destination gets the shortest chain)
    const queue = [[i]];
    const visited = new Set([i]);
    while (queue.length) {
      const path = queue.shift();
      const at = path[path.length - 1];
      const ar = Math.floor(at / 8), ac = at % 8;
      for (const [dr, dc] of R.dirs) {
        const mr = ar + dr, mc = ac + dc, lr = ar + 2 * dr, lc = ac + 2 * dc;
        if (!inside(lr, lc)) continue;
        const over = mr * 8 + mc, land = lr * 8 + lc;
        if (b[over] === 0 || over === i) continue; // the moving piece has left its square
        if (b[land] !== 0 && land !== i) continue;
        if (visited.has(land)) continue;
        visited.add(land);
        const np = [...path, land];
        queue.push(np);
        if (land !== i && !seen.has(land)) { seen.add(land); out.push({ from: i, to: land, path: np }); }
      }
    }
  }
  return out;
}

export function applyMove(b, m) {
  const nb = b.slice();
  nb[m.to] = nb[m.from];
  nb[m.from] = 0;
  return nb;
}

export const moveToString = (m) => m.path.map(sqName).join('-');

export const filled = (b, side, R) => R.target(side).every((i) => b[i] === side);
export const inHome = (b, side, R) => R.home(side).some((i) => b[i] === side);

// State after a move. g = {board, side (to move), moves: {1: n, -1: n}, finished: {1: bool, -1: bool}}
// returns {over, winner (1, -1, 0 = draw), reason}
export function status(g, R) {
  const { board } = g;
  const wDone = filled(board, 1, R), bDone = filled(board, -1, R);
  const mw = g.moves[1], mb = g.moves[-1];
  if (wDone && bDone) return { over: true, winner: 0, reason: 'both' };
  if (bDone) return { over: true, winner: -1, reason: 'corner' };
  if (wDone) {
    if (mb >= mw) return { over: true, winner: 1, reason: 'corner' };
    return { over: false, lastChance: true }; // black gets one more move to draw
  }
  // stalling rule: after his LIMIT-th move a player may not keep pieces in his own corner
  if (mw >= LIMIT && inHome(board, 1, R)) return { over: true, winner: -1, reason: 'stall' };
  if (mb >= LIMIT && inHome(board, -1, R)) return { over: true, winner: 1, reason: 'stall' };
  if (mw + mb >= 400) return { over: true, winner: 0, reason: 'long' };
  return { over: false };
}

// ---------- evaluation & search ----------
const dist = (a, b, diag) => {
  const dr = Math.abs(Math.floor(a / 8) - Math.floor(b / 8)), dc = Math.abs((a % 8) - (b % 8));
  return diag ? Math.max(dr, dc) : dr + dc;
};

// progress of side: lower is better (0 = all pieces home in the target corner)
function cost(b, side, R) {
  const tgt = R.target(side), home = R.home(side);
  const vertex = side === 1 ? 7 : 56; // h8 for white, a1 for black
  const free = tgt.filter((i) => b[i] !== side);
  let total = 0, worst = 0, inTarget = 0, atHome = 0;
  for (let i = 0; i < 64; i++) {
    if (b[i] !== side) continue;
    if (tgt.includes(i)) { inTarget++; total += dist(i, vertex, R.diag) * 0.35; continue; }
    if (home.includes(i)) atHome++;
    let d = 99;
    for (const t of free) { const x = dist(i, t, R.diag); if (x < d) d = x; }
    const dv = dist(i, vertex, R.diag);
    const v = d * 0.6 + dv * 0.4;
    total += v;
    if (v > worst) worst = v;
  }
  return total + worst * 1.5 + atHome * 4 - inTarget * 2;
}

export function evaluate(b, side, R) { return cost(b, -side, R) - cost(b, side, R); }

let deadline = 0, stopped = false, nodes = 0;
const WIN = 10000;

function search(b, side, depth, alpha, beta, R) {
  if ((++nodes & 1023) === 0 && Date.now() > deadline) stopped = true;
  if (stopped) return 0;
  if (filled(b, -side, R)) return -WIN - depth; // opponent just finished
  if (depth === 0) return evaluate(b, side, R);
  const moves = generateMoves(b, side, R);
  if (!moves.length) return -search(b, -side, depth - 1, -beta, -alpha, R);
  order(moves, b, side, R);
  let best = -Infinity;
  for (const m of moves.slice(0, depth >= 2 ? 24 : moves.length)) {
    const v = -search(applyMove(b, m), -side, depth - 1, -beta, -alpha, R);
    if (stopped) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function gain(m, side, R) {
  const vertex = side === 1 ? 7 : 56;
  return dist(m.from, vertex, R.diag) - dist(m.to, vertex, R.diag);
}
function order(moves, b, side, R) { return moves.sort((x, y) => gain(y, side, R) - gain(x, side, R)); }

// choose a move. opts: {maxDepth, timeMs, random, seen: Set of board keys to avoid}
export function bestMove(b, side, R, opts = {}) {
  const moves = order(generateMoves(b, side, R), b, side, R);
  if (!moves.length) return null;
  const { maxDepth = 2, timeMs = 800, random = 0, seen = null } = opts;
  deadline = Date.now() + timeMs; stopped = false; nodes = 0;
  let scored = moves.map((m) => ({ m, v: 0 }));
  for (let d = 1; d <= maxDepth; d++) {
    const cur = [];
    for (const s of scored) {
      const nb = applyMove(b, s.m);
      let v = filled(nb, side, R) ? WIN + 100 : -search(nb, -side, d - 1, -Infinity, Infinity, R);
      if (stopped && d > 1) break;
      if (seen && seen.has(nb.join(''))) v -= 3; // avoid going back and forth
      cur.push({ m: s.m, v });
    }
    if (stopped && d > 1) break;
    cur.sort((a, c) => c.v - a.v);
    scored = cur.concat(scored.filter((s) => !cur.some((c) => c.m === s.m)));
    if (stopped) break;
  }
  let pick = scored[0];
  if (random && scored.length > 1 && Math.random() < random) {
    const k = Math.min(scored.length, 5);
    pick = scored[1 + Math.floor(Math.random() * (k - 1))];
  }
  return pick.m;
}
