// Step-by-step explanation of a puzzle solution: what each move does, why it is the best move
// and what makes it hard to find. Works for any puzzle line (Lichess format: the first move is
// the opponent's, then the solver and the opponent alternate). Texts come from the T dictionary.
import { Chess } from './chess.js';

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const FILES = 'abcdefgh';
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fill = (s, o) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const opp = (c) => (c === 'w' ? 'b' : 'w');
const FIG = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };
export const fig = (san) => san.replace(/[KQRBN]/g, (c) => FIG[c]);

function uciMove(g, u) {
  return g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
}
function sq(f, r) { return f >= 0 && f < 8 && r >= 1 && r <= 8 ? FILES[f] + r : null; }
function coords(s) { return [FILES.indexOf(s[0]), +s[1]]; }

const DIRS = {
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
};
DIRS.q = DIRS.r.concat(DIRS.b);

// Pieces of colour `c` attacked by the piece standing on `from` (after the move).
function attackedBy(g, from) {
  const p = g.get(from);
  if (!p) return [];
  const out = [];
  for (const row of g.board()) for (const x of row) {
    if (x && x.color !== p.color && g.attackers(x.square, p.color).includes(from)) out.push(x);
  }
  return out;
}

// Along each line of a slider on `from`: first enemy piece, then the next piece behind it.
function lineHits(g, from) {
  const p = g.get(from);
  if (!p || !DIRS[p.type]) return [];
  const [f0, r0] = coords(from);
  const hits = [];
  for (const [df, dr] of DIRS[p.type]) {
    let f = f0 + df, r = r0 + dr, first = null;
    while (sq(f, r)) {
      const here = sq(f, r);
      const x = g.get(here) && { ...g.get(here), square: here };
      if (x) {
        if (!first) { if (x.color === p.color) break; first = x; } else { hits.push([first, x]); break; }
      }
      f += df; r += dr;
    }
  }
  return hits;
}

function material(g, color) {
  let s = 0;
  for (const row of g.board()) for (const x of row) if (x && x.type !== 'k') s += (x.color === color ? 1 : -1) * VAL[x.type];
  return s;
}

function list(names, T) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' ' + T.pzx_and + ' ' + names[names.length - 1];
}

// Mate in one for side `c` in position `fen` if it were their move (used to describe quiet threats).
function threatsAfter(g, c) {
  const parts = g.fen().split(' ');
  parts[1] = c; parts[3] = '-';
  let t;
  try { t = new Chess(parts.join(' ')); } catch { return null; }
  if (t.isCheck && t.isCheck()) return null;
  const moves = t.moves({ verbose: true });
  for (const m of moves) {
    t.move(m);
    const mate = t.isCheckmate();
    t.undo();
    if (mate) return { mate: true, san: m.san };
  }
  let best = null;
  for (const m of moves) {
    if (!m.captured) continue;
    const v = VAL[m.captured];
    const defended = t.attackers(m.to, opp(c)).length > 0;
    if ((!defended && v >= 3) || v > VAL[m.piece]) if (!best || v > VAL[best.captured]) best = m;
  }
  return best ? { take: best } : null;
}

export function explainPuzzle(fen, moves, themes, T) {
  const g = new Chess(fen);
  const N = (t) => T['pzx_nom_' + t], A = (t) => T['pzx_acc_' + t];
  const first = uciMove(g, moves[0]);
  const solver = g.turn();
  const steps = [];
  const won = [], lost = [];
  const themeList = (themes || '').split(' ').filter(Boolean);
  let lineMates = false;
  // play the whole line once to know how it ends
  {
    const t = new Chess(g.fen());
    for (let i = 1; i < moves.length; i++) uciMove(t, moves[i]);
    lineMates = t.isCheckmate();
  }
  const startMat = material(g, solver);
  for (let i = 1; i < moves.length; i++) {
    const before = new Chess(g.fen());
    const wasCheck = before.isCheck();
    const m = uciMove(g, moves[i]);
    const mine = m.color === solver;
    const st = { who: mine ? 'you' : 'opp', san: fig(m.san), what: [], why: [], hard: [] };
    if (m.captured) (mine ? won : lost).push(m.captured);
    if (m.promotion) (mine ? won : lost).push('promo:' + m.promotion);
    if (!mine) {
      const replies = before.moves().length;
      if (m.captured) st.what.push(fill(T.pzx_opp_take, { victim: A(m.captured), sq: m.to }));
      else if (wasCheck) st.what.push(T.pzx_opp_check);
      if (replies === 1) st.what.push(T.pzx_opp_only);
      else st.what.push(T.pzx_opp_best);
      steps.push(st);
      continue;
    }
    // --- what the move does
    if (m.isKingsideCastle?.() || m.isQueensideCastle?.() || m.flags.includes('k') || m.flags.includes('q')) st.what.push(T.pzx_castle);
    else if (m.captured) st.what.push(cap(fill(T.pzx_capture, { piece: N(m.piece), victim: A(m.captured), to: m.to })));
    else st.what.push(cap(fill(T.pzx_move, { piece: N(m.piece), from: m.from, to: m.to })));
    if (m.promotion) st.what.push(fill(T.pzx_promo, { promo: T['pzx_pr_' + m.promotion] || A(m.promotion) }));
    const mate = g.isCheckmate();
    const check = g.isCheck();
    if (check) {
      const kingSq = g.board().flat().find((x) => x && x.type === 'k' && x.color !== solver).square;
      const checkers = g.attackers(kingSq, solver);
      if (mate) st.what.push(T.pzx_mate);
      else if (checkers.length >= 2) st.what.push(T.pzx_dcheck);
      else {
        if (!checkers.includes(m.to)) st.what.push(T.pzx_disc_check);
        const rep = g.moves();
        if (rep.length === 1) st.what.push(fill(T.pzx_check_only, { list: fig(rep[0]) }));
        else if (rep.length <= 3) st.what.push(fill(T.pzx_check_few, { list: rep.map(fig).join(', ') }));
        else st.what.push(T.pzx_check);
      }
    }
    if (!mate) {
      // fork: the moved piece hits two valuable or loose targets
      const targets = attackedBy(g, m.to).filter((x) => x.type === 'k' || VAL[x.type] > VAL[m.piece] || (VAL[x.type] >= 3 && !g.attackers(x.square, opp(solver)).length));
      if (targets.length >= 2) st.what.push(fill(T.pzx_fork, { piece: N(m.piece), list: list(targets.sort((a, b) => VAL[b.type] - VAL[a.type]).map((x) => A(x.type)), T) }));
      else {
        for (const [front, behind] of lineHits(g, m.to)) {
          if (front.color === solver || behind.color === solver) continue;
          if (front.type !== 'k' && (behind.type === 'k' || VAL[behind.type] > VAL[front.type])) {
            st.what.push(fill(T.pzx_pin, { victim: N(front.type), sq: front.square, behind: N(behind.type) })); break;
          }
          if ((front.type === 'k' || VAL[front.type] > VAL[behind.type]) && behind.type !== 'p' && !check) {
            st.what.push(fill(T.pzx_skewer, { front: N(front.type), behind: N(behind.type) })); break;
          }
        }
      }
      // sacrifice: the piece can simply be taken
      const attackers = g.attackers(m.to, opp(solver));
      const defenders = g.attackers(m.to, solver);
      const cheapest = attackers.length ? Math.min(...attackers.map((s) => VAL[g.get(s).type])) : 99;
      const gaveMore = VAL[m.piece] > (m.captured ? VAL[m.captured] : 0);
      const sac = m.piece !== 'k' && VAL[m.piece] >= 3 && attackers.length && gaveMore && (!defenders.length || cheapest < VAL[m.piece]);
      if (sac) { st.what.push(fill(T.pzx_sac, { sq: m.to })); st.hard.push(fill(T.pzx_hard_sac, { piece: A(m.piece) })); }
      if (!check && !m.captured && !m.promotion) {
        const th = threatsAfter(g, solver);
        if (th && th.mate) st.what.push(fill(T.pzx_threat_mate, { san: fig(th.san) }));
        else if (th && th.take && st.what.length < 2) st.what.push(fill(T.pzx_threat_take, { victim: A(th.take.captured) }));
        st.hard.push(T.pzx_hard_quiet);
      }
    }
    // --- why it is the best move
    const net = material(g, solver) - startMat;
    if (mate) st.why.push(T.pzx_why_mate_now);
    else if (lineMates) st.why.push(T.pzx_why_mate_soon);
    else if (m.promotion) st.why.push(T.pzx_why_promo);
    else if (themeList.includes('defensiveMove') || themeList.includes('equality')) st.why.push(T.pzx_why_save);
    else if (check || m.captured || st.what.length > 1) st.why.push(T.pzx_why_forcing);
    if (!mate && i === 1) st.why.push(T.pzx_why_only);
    // --- what makes it hard
    const [, r0] = coords(m.from), [, r1] = coords(m.to);
    const backward = solver === 'w' ? r1 < r0 : r1 > r0;
    if (backward && m.piece !== 'p' && !m.captured) st.hard.push(T.pzx_hard_back);
    if (m.piece === 'k' && !m.captured) st.hard.push(T.pzx_hard_king);
    if (m.promotion && m.promotion !== 'q') st.hard.push(T.pzx_hard_under);
    if (i === 1 && moves.length >= 6) st.hard.push(T.pzx_hard_long);
    if (!st.hard.length) st.hard.push(T.pzx_hard_none);
    st.net = net;
    steps.push(st);
  }
  // --- result of the whole line
  const named = (arr) => list(arr.map((x) => (x.startsWith('promo:') ? T.pzx_new_piece.replace('{p}', T['pzx_pr_' + x.slice(6)] || A(x.slice(6))) : A(x))), T);
  let result;
  const net = material(g, solver) - startMat;
  if (g.isCheckmate()) result = T.pzx_result_mate;
  else if (net > 0 && won.length) result = lost.length
    ? fill(T.pzx_result_trade, { gain: named(won), lost: named(lost), n: net })
    : fill(T.pzx_result_gain, { gain: named(won), n: net });
  else if (themeList.includes('equality') || themeList.includes('defensiveMove')) result = T.pzx_result_equal;
  else result = T.pzx_result_better;
  const shown = themeList.filter((k) => !(k === 'mate' && themeList.some((x) => x.startsWith('mateIn'))));
  const names = shown.map((k) => T['th_' + k + '_name']).filter(Boolean);
  return {
    intro: fill(T.pzx_start, { san: fig(first.san) }) + (names.length ? ' ' + fill(T.pzx_themes, { list: names.join(', ') }) : ''),
    steps, result,
  };
}

// HTML for the explanation panel.
export function explainHtml(ex, T) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let n = 0;
  const items = ex.steps.map((s) => {
    if (s.who === 'opp') return `<li class="pzx-opp"><span class="pzx-who">${esc(T.pzx_lbl_opp)}</span> <b>${esc(s.san)}</b> — ${esc(s.what.join(' '))}</li>`;
    n++;
    return `<li class="pzx-you"><span class="pzx-who">${esc(T.pzx_lbl_you.replace('{n}', n))}</span> <b class="pzx-san">${esc(s.san)}</b>`
      + `<p><span class="pzx-k">${esc(T.pzx_lbl_what)}:</span> ${esc(s.what.join(' '))}</p>`
      + (s.why.length ? `<p><span class="pzx-k">${esc(T.pzx_lbl_why)}:</span> ${esc(s.why.join(' '))}</p>` : '')
      + `<p><span class="pzx-k">${esc(T.pzx_lbl_hard)}:</span> ${esc(s.hard.map(cap).join(' '))}</p></li>`;
  }).join('');
  return `<h3>${esc(T.pzx_title)}</h3><p class="muted">${esc(ex.intro)}</p><ol class="pzx-steps">${items}</ol><p class="pzx-result">${esc(ex.result)}</p>`;
}
