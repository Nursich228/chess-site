// Russian checkers (8x8) rules + search engine. No dependencies.
// Board: array of 64, index = row*8+col, row 0 = rank 8 (top), col 0 = file a.
// Pieces: 1 white man, 2 white king, -1 black man, -2 black king, 0 empty.
// White starts at the bottom and moves up (row decreasing). White moves first.

export const FILES = 'abcdefgh';
export const sqName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
export const sqIndex = (n) => (8 - parseInt(n[1], 10)) * 8 + FILES.indexOf(n[0]);
export const isDark = (i) => ((Math.floor(i / 8) + (i % 8)) % 2) === 1;

const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const NONE = [];

export function startBoard() {
  const b = new Array(64).fill(0);
  for (let i = 0; i < 64; i++) {
    if (!isDark(i)) continue;
    const r = Math.floor(i / 8);
    if (r <= 2) b[i] = -1;
    else if (r >= 5) b[i] = 1;
  }
  return b;
}

const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

// Generate all legal moves for side (1 = white, -1 = black).
export function generateMoves(board, side) {
  const caps = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p * side <= 0) continue;
    const isKing = Math.abs(p) === 2;
    if (!captureOptions(board, side, i, isKing, NONE).length) continue;
    const b = board.slice();
    b[i] = 0; // piece lifted while capturing
    captureDfs(b, side, i, isKing, [i], [], caps, i, isKing);
  }
  if (caps.length) return caps;
  const moves = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p * side <= 0) continue;
    const r = Math.floor(i / 8), c = i % 8;
    if (Math.abs(p) === 1) {
      const dr = side === 1 ? -1 : 1;
      for (const dc of [-1, 1]) {
        const nr = r + dr, nc = c + dc;
        if (inside(nr, nc) && board[nr * 8 + nc] === 0) {
          const to = nr * 8 + nc;
          moves.push({ from: i, to, path: [i, to], captured: [], promote: (side === 1 && nr === 0) || (side === -1 && nr === 7) });
        }
      }
    } else {
      for (const [dr, dc] of DIRS) {
        let nr = r + dr, nc = c + dc;
        while (inside(nr, nc) && board[nr * 8 + nc] === 0) {
          const to = nr * 8 + nc;
          moves.push({ from: i, to, path: [i, to], captured: [], promote: false });
          nr += dr; nc += dc;
        }
      }
    }
  }
  return moves;
}

// Find capture continuations from square sq. `captured` holds squares already jumped
// (pieces stay on board until the move ends: "Turkish strike" rule).
function captureOptions(b, side, sq, isKing, captured) {
  const out = []; // {over, land, king}
  const r = Math.floor(sq / 8), c = sq % 8;
  for (const [dr, dc] of DIRS) {
    if (!isKing) {
      const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
      if (!inside(lr, lc)) continue;
      const m = mr * 8 + mc, l = lr * 8 + lc;
      if (b[m] * side < 0 && !captured.includes(m) && b[l] === 0) {
        const promo = (side === 1 && lr === 0) || (side === -1 && lr === 7);
        out.push({ over: m, lands: [l], promo });
      }
    } else {
      let nr = r + dr, nc = c + dc;
      while (inside(nr, nc) && b[nr * 8 + nc] === 0) { nr += dr; nc += dc; }
      if (!inside(nr, nc)) continue;
      const m = nr * 8 + nc;
      if (b[m] * side >= 0 || captured.includes(m)) continue;
      const lands = [];
      let lr = nr + dr, lc = nc + dc;
      while (inside(lr, lc) && b[lr * 8 + lc] === 0) { lands.push(lr * 8 + lc); lr += dr; lc += dc; }
      if (lands.length) out.push({ over: m, lands, promo: false });
    }
  }
  return out;
}

function captureDfs(b, side, sq, isKing, path, captured, result, origin, startKing) {
  const opts = captureOptions(b, side, sq, isKing, captured);
  if (!opts.length) {
    if (captured.length) {
      result.push({ from: origin, to: sq, path: path.slice(), captured: captured.slice(), promote: !startKing && isKing });
    }
    return;
  }
  for (const o of opts) {
    const nowKing = isKing || o.promo;
    const cap2 = captured.concat(o.over);
    // Russian rule: if some landing square lets the capture continue, only those squares are allowed.
    let lands = o.lands;
    if (lands.length > 1) {
      const cont = lands.filter((l) => captureOptions(b, side, l, nowKing, cap2).length > 0);
      if (cont.length) lands = cont;
    }
    for (const l of lands) {
      path.push(l);
      captureDfs(b, side, l, nowKing, path, cap2, result, origin, startKing);
      path.pop();
    }
  }
}

export function applyMove(board, m) {
  const b = board.slice();
  let p = b[m.from];
  b[m.from] = 0;
  for (const c of m.captured) b[c] = 0;
  if (m.promote) p = p > 0 ? 2 : -2;
  b[m.to] = p;
  return b;
}

export function moveToString(m) {
  const sep = m.captured.length ? ':' : '-';
  return m.path.map(sqName).join(sep);
}

// Position string: "W:Wc3,Ke1:Bd6,Kh8"  (side to move first)
export function toPosString(board, side) {
  const w = [], bl = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const s = (Math.abs(p) === 2 ? 'K' : '') + sqName(i);
    (p > 0 ? w : bl).push(s);
  }
  return `${side === 1 ? 'W' : 'B'}:W${w.join(',')}:B${bl.join(',')}`;
}

export function fromPosString(str) {
  const parts = str.trim().toUpperCase().split(':');
  if (parts.length !== 3 || !/^[WB]$/.test(parts[0])) return null;
  const board = new Array(64).fill(0);
  for (const part of parts.slice(1)) {
    const color = part[0] === 'W' ? 1 : part[0] === 'B' ? -1 : 0;
    if (!color) return null;
    const list = part.slice(1).split(',').map((x) => x.trim()).filter(Boolean);
    for (let t of list) {
      let king = false;
      if (t[0] === 'K') { king = true; t = t.slice(1); }
      t = t.toLowerCase();
      if (!/^[a-h][1-8]$/.test(t)) return null;
      const i = sqIndex(t);
      if (!isDark(i)) return null;
      board[i] = color * (king ? 2 : 1);
    }
  }
  return { board, side: parts[0] === 'W' ? 1 : -1 };
}

// ---------- evaluation & search ----------
const MAN = 100, KING = 300, WIN = 100000;

export function evaluate(b) {
  // from white's point of view
  let s = 0, wm = 0, bm = 0, wk = 0, bk = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    const r = Math.floor(i / 8), c = i % 8;
    const center = (c >= 2 && c <= 5 && r >= 2 && r <= 5) ? 6 : 0;
    if (p === 1) { wm++; s += MAN + (7 - r) * 5 + center + (r === 7 ? 6 : 0); }
    else if (p === -1) { bm++; s -= MAN + r * 5 + center + (r === 0 ? 6 : 0); }
    else if (p === 2) { wk++; s += KING + ((r - c === 0 || r + c === 7) ? 15 : 0); }
    else if (p === -2) { bk++; s -= KING + ((r - c === 0 || r + c === 7) ? 15 : 0); }
  }
  return s;
}

export function gameResult(board, side) {
  return generateMoves(board, side).length === 0 ? -side : 0; // winner: 1 white, -1 black
}

function orderMoves(moves) {
  return moves.sort((a, b) => (b.captured.length - a.captured.length) || (b.promote - a.promote));
}

let nodes = 0, deadline = 0, stopped = false;

function negamax(b, side, depth, alpha, beta, ply) {
  if ((++nodes & 2047) === 0 && Date.now() > deadline) { stopped = true; }
  if (stopped) return 0;
  const moves = generateMoves(b, side);
  if (!moves.length) return -WIN + ply;
  const forced = moves[0].captured.length > 0;
  if (depth <= 0 && !forced) return side * evaluate(b);
  if (depth <= -8) return side * evaluate(b);
  orderMoves(moves);
  let best = -Infinity;
  for (const m of moves) {
    const v = -negamax(applyMove(b, m), -side, depth - 1, -beta, -alpha, ply + 1);
    if (stopped) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

// Analyse: returns {depth, lines:[{move, score, pv}]} sorted best first. score from side-to-move POV in centi-units.
export function analyse(board, side, { maxDepth = 12, timeMs = 1500, multiPv = 3, onDepth } = {}) {
  const rootMoves = orderMoves(generateMoves(board, side));
  if (!rootMoves.length) return { depth: 0, lines: [], result: -side };
  deadline = Date.now() + timeMs;
  stopped = false; nodes = 0;
  let last = null;
  let order = rootMoves.map((m) => ({ move: m, score: 0 }));
  for (let d = 1; d <= maxDepth; d++) {
    const scored = [];
    for (const item of order) {
      let alpha = -Infinity;
      if (scored.length >= multiPv) {
        const top = scored.map((x) => x.score).sort((a, b) => b - a);
        alpha = top[multiPv - 1];
      }
      const v = -negamax(applyMove(board, item.move), -side, d - 1, -Infinity, -alpha, 1);
      if (stopped) break;
      scored.push({ move: item.move, score: v });
    }
    if (stopped && d > 1) break;
    if (scored.length < order.length && d > 1) break;
    scored.sort((a, b) => b.score - a.score);
    order = scored.concat(order.filter((o) => !scored.some((x) => x.move === o.move)));
    last = { depth: d, lines: scored.slice(0, multiPv).map((s) => ({ ...s, pv: principal(board, side, s.move, Math.min(d, 6)) })) };
    if (onDepth) onDepth(last);
    if (Math.abs(scored[0].score) > WIN - 1000) break;
    if (rootMoves.length === 1 && d >= 3) break;
  }
  return last;
}

// cheap principal variation: greedy shallow search after the root move
function principal(board, side, first, len) {
  const pv = [first];
  let b = applyMove(board, first), s = -side;
  const saveDeadline = deadline, saveStopped = stopped;
  for (let k = 1; k < len; k++) {
    const moves = orderMoves(generateMoves(b, s));
    if (!moves.length) break;
    deadline = Date.now() + 40; stopped = false;
    let best = moves[0], bv = -Infinity;
    for (const m of moves) {
      const v = -negamax(applyMove(b, m), -s, 2, -Infinity, Infinity, 1);
      if (v > bv) { bv = v; best = m; }
    }
    pv.push(best);
    b = applyMove(b, best); s = -s;
  }
  deadline = saveDeadline; stopped = saveStopped;
  return pv;
}

export const SCORE_WIN = WIN;
