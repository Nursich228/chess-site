// Chess puzzles: puzzle of the day, themed trainers, random by level. Data: Lichess puzzle DB (CC0).
import { Chess } from './chess.js';
import { Board } from './board.js';
import { T, $, sound, prefs } from './common.js';
import { explainPuzzle, explainHtml } from './pz-explain.js';

const BASE = new URL('./', import.meta.url).href;
const box = $('.tool[data-pool]');
const POOL = box.dataset.pool;           // 'daily' or a theme key
const ANALYZE = box.dataset.analyze;
const LEVEL = { easy: [0, 1299], medium: [1300, 1799], hard: [1800, 4000] };
const tpl = (s, o) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => o[k]);

let DB = null, P = null, g = null, moves = [], step = 0, solver = 'w', busy = false, done = false, helped = false, EX = null;
const files = {};   // loaded puzzle files: theme pools, daily list and three level files
async function file(name) { if (!files[name]) files[name] = fetch(BASE + 'pz/' + name + '.json').then((r) => r.json()); return files[name]; }
let order = [], orderPos = 0, mode = POOL;   // mode: daily | theme | level:<name>

const board = new Board($('#board'), {
  pieceUrl: (c) => `${BASE}pieces/${c}.svg`,
  canDrag: (sq) => { if (!g || busy || done) return false; const p = g.get(sq); return !!p && p.color === g.turn() && g.turn() === solver; },
  targets: (sq) => g.moves({ square: sq, verbose: true }).map((m) => m.to),
  onMove: (f, t) => tryMove(f, t),
});

function posMap() { const m = {}; g.board().forEach((r) => r.forEach((p) => { if (p) m[p.square] = p.color + p.type; })); return m; }
function show(last) {
  board.setPosition(posMap());
  const h = {};
  if (last) { h[last.from] = 'last'; h[last.to] = 'last'; }
  if (g.inCheck()) { const k = g.board().flat().find((p) => p && p.type === 'k' && p.color === g.turn()); if (k) h[k.square] = (h[k.square] ? h[k.square] + ' ' : '') + 'check'; }
  board.setHighlights(h);
  $('#pzAnalyze').href = ANALYZE + '?fen=' + encodeURIComponent(g.fen());
}
const status = (t, cls = '') => { const el = $('#pzStatus'); el.textContent = t; el.className = 'pz-status ' + cls; };
const yourMove = () => status(solver === 'w' ? T.pz_move_w : T.pz_move_b);

function playUci(u) {
  const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
  sound(m.captured ? 'capture' : g.inCheck() ? 'check' : 'move');
  show(m);
  return m;
}

function load(idx) {
  const [id, fen, mv, rating, themes] = DB.p[idx];
  try { EX = explainPuzzle(fen, mv.split(' '), themes, T); } catch { EX = null; }
  const box = $('#pzExplain'); if (box) { box.hidden = true; box.innerHTML = ''; }
  P = { id, idx, rating, themes };
  g = new Chess(fen); moves = mv.split(' '); step = 0; done = false; helped = false; busy = true;
  solver = g.turn() === 'w' ? 'b' : 'w';
  board.setOrientation(solver === 'w' ? 'white' : 'black');
  show(null);
  const th = (themes || '').split(' ').filter(Boolean).map((k) => T['th_' + k + '_name']).filter(Boolean);
  $('#pzInfo').textContent = `${T.pz_rating}: ${rating}` + (th.length ? ' · ' + th.join(', ') : '');
  status('…');
  setTimeout(() => { playUci(moves[0]); step = 1; busy = false; yourMove(); }, 650);
  stats();
}

function tryMove(from, to) {
  if (busy || done) return;
  const exp = moves[step];
  const legal = g.moves({ square: from, verbose: true }).filter((m) => m.to === to);
  if (!legal.length) return;
  const promo = legal[0].promotion ? (exp.slice(0, 4) === from + to && exp[4] ? exp[4] : 'q') : undefined;
  const m = g.move({ from, to, promotion: promo });
  const uci = from + to + (promo || '');
  const ok = uci === exp || (step === moves.length - 1 && g.isCheckmate());
  if (!ok) {
    show(m); sound('end'); status(T.pz_wrong, 'bad');
    busy = true;
    setTimeout(() => { g.undo(); show(null); busy = false; }, 600);
    return;
  }
  sound(m.captured ? 'capture' : g.inCheck() ? 'check' : 'move');
  show(m); step++;
  if (step >= moves.length) return solved();
  const why = EX && EX.steps[step - 2] && EX.steps[step - 2].what.slice(1, 2).join(' ');
  status(T.pz_correct + (why ? ' — ' + why : ''), 'good'); busy = true;
  setTimeout(() => { playUci(moves[step]); step++; busy = false; yourMove(); }, 450);
}

function today() { return Math.floor((Date.now() + 5 * 3600e3) / 864e5); }

function showExplain() {
  const box = $('#pzExplain');
  if (!box || !EX) return;
  box.innerHTML = explainHtml(EX, T);
  box.hidden = false;
}
function solved() {
  done = true;
  showExplain();
  if (helped) { status(T.pz_shown, 'good'); return; }
  status(T.pz_solved_ex || T.pz_solved, 'good');
  const seen = prefs.get('pz-solved', []);
  if (!seen.includes(P.id)) { seen.push(P.id); prefs.set('pz-solved', seen.slice(-5000)); }
  if (mode === 'daily') {
    const days = prefs.get('pz-days', []);
    if (!days.includes(today())) { days.push(today()); prefs.set('pz-days', days.slice(-400)); }
    status((T.pz_solved_ex || T.pz_solved) + ' ' + T.pz_daily_done, 'good');
  }
  stats();
}

function stats() {
  const n = prefs.get('pz-solved', []).length;
  let txt = tpl(T.pz_count, { n });
  if (POOL === 'daily') {
    const days = new Set(prefs.get('pz-days', []));
    let d = today(); if (!days.has(d)) d--;
    let streak = 0; while (days.has(d)) { streak++; d--; }
    txt += ' · ' + tpl(T.pz_streak, { n: streak });
  }
  $('#pzStats').textContent = txt;
}

function hint() {
  if (done || busy || !moves[step]) return;
  helped = true;
  const h = {}; h[moves[step].slice(0, 2)] = 'hint';
  board.setHighlights(h);
}

function solution() {
  if (done || busy) return;
  helped = true; busy = true;
  const run = () => {
    if (step >= moves.length) { busy = false; solved(); return; }
    playUci(moves[step]); step++;
    setTimeout(run, 700);
  };
  run();
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function nextPuzzle() {
  if (mode.startsWith('level:')) {
    const name = mode.slice(6);
    DB = await file('lvl-' + name);
    $('#pzLabel').textContent = T['pz_' + name];
    return load(Math.floor(Math.random() * DB.p.length));
  }
  if (POOL === 'daily') { mode = 'level:medium'; return nextPuzzle(); }
  orderPos = (orderPos + 1) % order.length;
  load(order[orderPos]);
}

async function start() {
  DB = await file(POOL);
  if (POOL === 'daily') {
    const list = DB.p;
    const d = new Date(); const label = d.toLocaleDateString(document.documentElement.lang, { day: 'numeric', month: 'long' });
    $('#pzLabel').textContent = `${T.pz_daily} · ${label}`;
    load(today() % list.length);
  } else {
    const seen = new Set(prefs.get('pz-solved', []));
    order = shuffle(DB.p.map((_, i) => i));
    order.sort((a, b) => (seen.has(DB.p[a][0]) ? 1 : 0) - (seen.has(DB.p[b][0]) ? 1 : 0));
    load(order[0]);
  }
}

$('#pzHint').addEventListener('click', hint);
$('#pzSolution').addEventListener('click', solution);
$('#pzNext').addEventListener('click', nextPuzzle);
document.querySelector('[data-act="flip"]')?.addEventListener('click', () => board.flip());
document.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => { mode = 'level:' + b.dataset.level; nextPuzzle(); $('#board').scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
start();
