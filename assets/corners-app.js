import * as K from './corners-engine.js';
import { Board } from './board.js';
import { $, $$, sound, prefs } from './common.js';

const LANG = document.documentElement.lang || 'en';
const S = {
  ru: { your_move: 'Ваш ход', thinking: 'Компьютер думает…', you_win: 'Вы победили!', cpu_win: 'Победил компьютер', draw: 'Ничья',
    r_corner: 'все шашки заняли чужой угол', r_both: 'оба игрока заняли углы за одинаковое число ходов', r_stall: 'после 40-го хода в своём углу осталась шашка', r_long: 'партия слишком затянулась',
    chance_you: 'Компьютер занял ваш угол. У вас последний ход: займите свой угол — и будет ничья.', chance_cpu: 'Вы заняли угол! У компьютера последний ход, чтобы свести вничью.',
    home_left: 'В своём углу осталось: {k} · ход {n} из 40', home_done: 'Все шашки вышли из своего угла · ход {n}', no_moves: 'Ходов пока нет', pass: 'пропуск' },
  en: { your_move: 'Your move', thinking: 'Computer is thinking…', you_win: 'You win!', cpu_win: 'The computer wins', draw: 'Draw',
    r_corner: 'all pieces reached the opposite corner', r_both: 'both players filled the corners in the same number of moves', r_stall: 'a piece was still in its own corner after move 40', r_long: 'the game went on too long',
    chance_you: 'The computer has filled your corner. You have one last move: fill its corner now for a draw.', chance_cpu: 'You filled the corner! The computer has one last move to draw.',
    home_left: 'Still in your own corner: {k} · move {n} of 40', home_done: 'All pieces have left your corner · move {n}', no_moves: 'No moves yet', pass: 'pass' },
  es: { your_move: 'Tu turno', thinking: 'La computadora está pensando…', you_win: '¡Has ganado!', cpu_win: 'Gana la computadora', draw: 'Tablas',
    r_corner: 'todas las piezas llegaron a la esquina contraria', r_both: 'ambos llenaron las esquinas en el mismo número de jugadas', r_stall: 'quedó una pieza en su propia esquina después de la jugada 40', r_long: 'la partida se alargó demasiado',
    chance_you: 'La computadora llenó tu esquina. Te queda una jugada: llena la suya ahora y serán tablas.', chance_cpu: '¡Llenaste la esquina! La computadora tiene una última jugada para empatar.',
    home_left: 'Aún en tu esquina: {k} · jugada {n} de 40', home_done: 'Todas las piezas salieron de tu esquina · jugada {n}', no_moves: 'Aún no hay jugadas', pass: 'pasa' },
  fr: { your_move: 'À vous de jouer', thinking: "L'ordinateur réfléchit…", you_win: 'Vous avez gagné !', cpu_win: "L'ordinateur gagne", draw: 'Partie nulle',
    r_corner: 'tous les pions ont atteint le coin opposé', r_both: 'les deux joueurs ont rempli les coins en autant de coups', r_stall: 'un pion était encore dans son propre coin après le 40e coup', r_long: 'la partie a duré trop longtemps',
    chance_you: "L'ordinateur a rempli votre coin. Il vous reste un coup : remplissez le sien pour faire nulle.", chance_cpu: "Vous avez rempli le coin ! L'ordinateur a un dernier coup pour égaliser.",
    home_left: 'Encore dans votre coin : {k} · coup {n} sur 40', home_done: 'Tous les pions ont quitté votre coin · coup {n}', no_moves: 'Aucun coup pour le moment', pass: 'passe' },
  de: { your_move: 'Du bist am Zug', thinking: 'Der Computer denkt nach…', you_win: 'Du hast gewonnen!', cpu_win: 'Der Computer gewinnt', draw: 'Remis',
    r_corner: 'alle Steine haben die gegenüberliegende Ecke erreicht', r_both: 'beide haben die Ecken in gleich vielen Zügen gefüllt', r_stall: 'nach dem 40. Zug stand noch ein Stein in der eigenen Ecke', r_long: 'die Partie dauerte zu lange',
    chance_you: 'Der Computer hat deine Ecke gefüllt. Du hast noch einen Zug: Fülle jetzt seine Ecke für ein Remis.', chance_cpu: 'Du hast die Ecke gefüllt! Der Computer hat noch einen Zug für ein Remis.',
    home_left: 'Noch in deiner Ecke: {k} · Zug {n} von 40', home_done: 'Alle Steine haben deine Ecke verlassen · Zug {n}', no_moves: 'Noch keine Züge', pass: 'Pass' },
}[LANG] || {};

const BASE = new URL('./', import.meta.url).href;
const LEVELS = [
  { maxDepth: 1, timeMs: 200, random: 0.6 },
  { maxDepth: 1, timeMs: 200, random: 0.25 },
  { maxDepth: 1, timeMs: 300, random: 0 },
  { maxDepth: 3, timeMs: 600, random: 0 },
  { maxDepth: 3, timeMs: 1500, random: 0 },
];

// ---------- worker ----------
let worker = null, jobId = 0, jobCb = null;
function newWorker() {
  worker = new Worker(new URL('./corners-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => { if (e.data.id === jobId && jobCb) { const cb = jobCb; jobCb = null; cb(e.data.move); } };
}
newWorker();
function think(board, side, lv, seen, cb) {
  if (jobCb) { worker.terminate(); newWorker(); }
  jobId++; jobCb = cb;
  worker.postMessage({ id: jobId, board, side, size: cfg.size, diag: cfg.diag, ...lv, seen });
}
function stopThinking() { if (jobCb) { worker.terminate(); newWorker(); } jobCb = null; jobId++; }

// ---------- state ----------
const cfg = { size: prefs.get('crSize', 9), diag: prefs.get('crDiag', false), color: 1, level: prefs.get('crLevel', 3) };
let R = K.makeRules(cfg.size, cfg.diag);
let hist = [];
let thinking = false, over = null;
const cur = () => hist[hist.length - 1];

const boardUi = new Board($('#board'), {
  pieceUrl: (c) => `${BASE}pieces/${c}.svg`,
  canDrag: (sq) => {
    const g = cur();
    return !thinking && !over && g.side === cfg.color && g.board[K.sqIndex(sq)] === cfg.color;
  },
  targets: (sq) => K.generateMoves(cur().board, cur().side, R).filter((m) => K.sqName(m.from) === sq).map((m) => K.sqName(m.to)),
  onMove: (from, to) => {
    const m = K.generateMoves(cur().board, cur().side, R).find((x) => K.sqName(x.from) === from && K.sqName(x.to) === to);
    if (m) push(m);
  },
});

function push(m) {
  const g = cur();
  const moves = { ...g.moves, [g.side]: g.moves[g.side] + 1 };
  const board = m ? K.applyMove(g.board, m) : g.board;
  hist.push({ board, side: -g.side, moves, move: m, mover: g.side });
  if (m) sound('move');
  refresh();
}

function posMap(b) { const o = {}; b.forEach((p, i) => { if (p) o[K.sqName(i)] = p > 0 ? 'cw1' : 'cb1'; }); return o; }

function refresh() {
  const g = cur();
  boardUi.setPosition(posMap(g.board));
  const h = {};
  for (const i of R.home(1)) h[K.sqName(i)] = 'goalw';
  for (const i of R.home(-1)) h[K.sqName(i)] = 'goalb';
  if (g.move) for (const s of g.move.path) h[K.sqName(s)] = (h[K.sqName(s)] ? h[K.sqName(s)] + ' ' : '') + 'last';
  boardUi.setHighlights(h);
  boardUi.setArrows(g.move && g.move.path.length > 2 ? [{ path: g.move.path.map(K.sqName), color: 'var(--arrow-2)', width: 9, opacity: 0.55 }] : []);
  renderMoves();
  const st = K.status(g, R);
  over = st.over ? st : null;
  const ps = $('#playStatus'), info = $('#status');
  if (over) {
    sound('end');
    ps.textContent = over.winner === 0 ? S.draw : over.winner === cfg.color ? S.you_win : S.cpu_win;
    info.textContent = S['r_' + over.reason] ? S['r_' + over.reason][0].toUpperCase() + S['r_' + over.reason].slice(1) + '.' : '';
    return;
  }
  const mine = g.moves[cfg.color];
  const left = R.home(cfg.color).filter((i) => g.board[i] === cfg.color).length;
  info.textContent = st.lastChance ? (cfg.color === -1 ? S.chance_you : S.chance_cpu)
    : (left ? S.home_left.replace('{k}', left).replace('{n}', mine) : S.home_done.replace('{n}', mine));
  if (g.side === cfg.color) {
    ps.textContent = S.your_move;
    if (!K.generateMoves(g.board, g.side, R).length) setTimeout(() => push(null), 400);
    return;
  }
  thinking = true;
  ps.textContent = S.thinking;
  const lv = LEVELS[cfg.level - 1];
  const seen = hist.filter((x) => x.mover === g.side).map((x) => x.board.join(''));
  const snap = g, t0 = Date.now();
  think(g.board, g.side, lv, seen, (m) => {
    if (cur() !== snap) return;
    setTimeout(() => { if (cur() !== snap) return; thinking = false; push(m); }, Math.max(0, 380 - (Date.now() - t0)));
  });
}

function renderMoves() {
  const box = $('#moves');
  if (hist.length < 2) { box.innerHTML = `<p class="muted">${S.no_moves}</p>`; return; }
  let html = '';
  for (let i = 1; i < hist.length; i++) {
    if (i % 2 === 1) html += `<span class="mnum">${(i + 1) / 2}.</span>`;
    const m = hist[i].move;
    html += `<span class="mv${i === hist.length - 1 ? ' on' : ''}">${m ? K.moveToString(m) : S.pass}</span>`;
  }
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

function newGame() {
  stopThinking(); thinking = false; over = null;
  R = K.makeRules(cfg.size, cfg.diag);
  const c = prefs.get('crColor', 1);
  cfg.color = c === 0 ? (Math.random() < 0.5 ? 1 : -1) : c;
  boardUi.setOrientation(cfg.color === 1 ? 'white' : 'black');
  hist = [{ board: K.startBoard(cfg.size), side: 1, moves: { 1: 0, '-1': 0 }, move: null }];
  refresh();
}

function undo() {
  stopThinking(); thinking = false;
  let i = hist.length - 1;
  while (i > 0 && hist[i].mover !== cfg.color) i--; // the player's last move
  hist = hist.slice(0, Math.max(1, i));
  refresh();
}

// ---------- controls ----------
function seg(attr, get, set) {
  $$(`[${attr}]`).forEach((b) => {
    b.classList.toggle('on', String(get()) === b.getAttribute(attr));
    b.onclick = () => { set(b.getAttribute(attr)); $$(`[${attr}]`).forEach((x) => x.classList.toggle('on', x === b)); };
  });
}
seg('data-level', () => cfg.level, (v) => { cfg.level = +v; prefs.set('crLevel', cfg.level); });
seg('data-color', () => ({ 1: 'w', '-1': 'b', 0: 'r' })[prefs.get('crColor', 1)], (v) => { prefs.set('crColor', { w: 1, b: -1, r: 0 }[v]); newGame(); });
seg('data-size', () => cfg.size, (v) => { cfg.size = +v; prefs.set('crSize', cfg.size); newGame(); });
const diagEl = $('#diag');
if (diagEl) { diagEl.checked = cfg.diag; diagEl.onchange = () => { cfg.diag = diagEl.checked; prefs.set('crDiag', cfg.diag); newGame(); }; }
$('#newGame').onclick = newGame;
$$('[data-act="undo"]').forEach((b) => { b.onclick = undo; });
$$('[data-act="flip"]').forEach((b) => { b.onclick = () => boardUi.flip(); });
$('#hintBtn').onclick = () => {
  const g = cur();
  if (thinking || over || g.side !== cfg.color) return;
  const m = K.bestMove(g.board, g.side, R, { maxDepth: 3, timeMs: 700 });
  if (m) boardUi.setArrows([{ path: m.path.map(K.sqName), color: 'var(--arrow-best)' }]);
};

newGame();
