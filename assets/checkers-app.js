import * as C from './checkers-engine.js';
import { Board } from './board.js';
import { T, $, $$, sound, toast, copyText, prefs, onboard } from './common.js';

const MODE = document.body.dataset.tool; // checkers | checkers-play
const BASE = new URL('./', import.meta.url).href;
const WIN = C.SCORE_WIN;

// ---------- engine worker (restartable so a new request cancels the old one) ----------
let worker = null, busy = false, jobId = 0, jobCb = null;
function newWorker() {
  worker = new Worker(new URL('./checkers-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { id, partial, result } = e.data;
    if (id !== jobId || !jobCb) return;
    if (!partial) busy = false;
    jobCb(result, partial);
  };
}
newWorker();
function think(board, side, opts, cb) {
  if (busy) { worker.terminate(); newWorker(); }
  busy = true;
  jobId++;
  jobCb = cb;
  worker.postMessage({ id: jobId, board, side, timeMs: opts.timeMs || 1500, maxDepth: opts.maxDepth || 30, multiPv: opts.multiPv || 3 });
}
function stopThinking() { if (busy) { worker.terminate(); newWorker(); busy = false; } jobId++; jobCb = null; }

// ---------- state ----------
let hist = [{ board: C.startBoard(), side: 1 }];
let ply = 0;
let lastLines = [];
let editing = false, editBoard = null, editTool = 1, editSide = 1;
const play = { color: 1, level: 3, thinking: false, over: false };

const cur = () => hist[ply];
const code = (p) => (p > 0 ? 'cw' : 'cb') + Math.abs(p);
function posMap(b) { const m = {}; b.forEach((p, i) => { if (p) m[C.sqName(i)] = code(p); }); return m; }

function legalFrom(sq) {
  const { board, side } = cur();
  return C.generateMoves(board, side).filter((m) => C.sqName(m.from) === sq);
}

const boardUi = new Board($('#board'), {
  pieceUrl: (c) => `${BASE}pieces/${c}.svg`,
  canDrag: (sq) => {
    if (editing) return false;
    const { board, side } = cur();
    const p = board[C.sqIndex(sq)];
    if (!p || Math.sign(p) !== side) return false;
    if (MODE === 'checkers-play') return !play.thinking && !play.over && side === play.color;
    return true;
  },
  targets: (sq) => [...new Set(legalFrom(sq).map((m) => C.sqName(m.to)))],
  onMove: (from, to) => {
    const ms = legalFrom(from).filter((m) => C.sqName(m.to) === to);
    if (ms.length) pushMove(ms.sort((a, b) => b.captured.length - a.captured.length)[0]);
  },
});

function pushMove(m) {
  const { board, side } = cur();
  const nb = C.applyMove(board, m);
  hist = hist.slice(0, ply + 1);
  const top = lastLines[0];
  const judgePrev = (MODE !== 'checkers-play' && top && top.depth >= 4) ? { best: C.moveToString(top.move), score: top.score } : null;
  hist.push({ board: nb, side: -side, move: m, text: C.moveToString(m), judgePrev });
  ply++;
  sound(m.captured.length ? 'capture' : 'move');
  refresh();
}

// ---------- rendering ----------
function refresh() {
  const { board, side, move } = cur();
  boardUi.setPosition(editing ? posMap(editBoard) : posMap(board));
  const h = {};
  if (move && !editing) {
    move.path.forEach((s) => { h[C.sqName(s)] = 'last'; });
    move.captured.forEach((s) => { h[C.sqName(s)] = 'last'; });
  }
  if (!editing) {
    const ms = C.generateMoves(board, side);
    if (ms.length && ms[0].captured.length) for (const m of ms) h[C.sqName(m.from)] = (h[C.sqName(m.from)] ? h[C.sqName(m.from)] + ' ' : '') + 'hint';
  }
  boardUi.setHighlights(h);
  boardUi.setArrows([]);
  const pos = $('#pos');
  if (pos && document.activeElement !== pos) pos.value = C.toPosString(board, side);
  $$('input[name=turn]').forEach((r) => { r.checked = +r.value === side; });
  renderMoves();
  showJudge(cur().judgeText);
  const over = C.generateMoves(board, side).length === 0;
  const st = $('#status');
  if (st) st.textContent = over ? (side === 1 ? T.ck_black_wins : T.ck_white_wins) : (side === 1 ? T.white_to_move : T.black_to_move);
  if (over) sound('end');
  if (MODE === 'checkers-play') { playTurn(); return; }
  analyse();
}

function renderMoves() {
  const box = $('#moves');
  if (!box) return;
  if (hist.length < 2) { box.innerHTML = `<p class="muted">${T.no_moves}</p>`; return; }
  let html = '', num = 1;
  const firstBlack = hist[0].side === -1;
  for (let i = 1; i < hist.length; i++) {
    const isWhite = firstBlack ? i % 2 === 0 : i % 2 === 1;
    if (isWhite || i === 1) html += `<span class="mnum">${num}.${!isWhite ? '..' : ''}</span>`;
    html += `<button type="button" class="mv${i === ply ? ' on' : ''}${hist[i].cls ? ' ' + hist[i].cls : ''}" data-ply="${i}">${hist[i].text}</button>`;
    if (!isWhite) num++;
  }
  box.innerHTML = html;
  $$('.mv', box).forEach((b) => b.onclick = () => goTo(+b.dataset.ply));
  $('.mv.on', box)?.scrollIntoView({ block: 'nearest' });
}

function goTo(i) {
  if (MODE === 'checkers-play') return;
  ply = Math.max(0, Math.min(hist.length - 1, i));
  refresh();
}

// ---------- evaluation display ----------
function whiteScore(score, side) { return score * side; }
function fmt(sw) {
  if (Math.abs(sw) > WIN - 1000) {
    const plies = WIN - Math.abs(sw);
    return (sw > 0 ? '+' : '−') + 'W' + Math.ceil(plies / 2);
  }
  const v = sw / 100;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
}
function setEvalBar(sw) {
  const bar = $('#evalbar');
  if (!bar) return;
  let pct = 50;
  if (sw !== null) pct = Math.abs(sw) > WIN - 1000 ? (sw > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-0.006 * sw)) - 1);
  $('.evalfill', bar).style.height = pct + '%';
  $('.evaltext', bar).textContent = sw === null ? '0.0' : fmt(sw).replace('+', '');
  bar.classList.toggle('black-better', pct < 50);
}

const timeEl = $('#thinkTime');
const multiEl = $('#multiPv');
const arrowsEl = $('#arrowsToggle');
if (timeEl) { timeEl.value = prefs.get('ckTime', 2); $('#thinkVal').textContent = timeEl.value; timeEl.oninput = () => { $('#thinkVal').textContent = timeEl.value; }; timeEl.onchange = () => { prefs.set('ckTime', +timeEl.value); analyse(); }; }
if (multiEl) { multiEl.value = prefs.get('multipv', 3); multiEl.onchange = () => { prefs.set('multipv', +multiEl.value); analyse(); }; }
if (arrowsEl) { arrowsEl.checked = prefs.get('arrows', true); arrowsEl.onchange = () => { prefs.set('arrows', arrowsEl.checked); drawArrows(); }; }

function analyse() {
  if (editing) return;
  const { board, side } = cur();
  const box = $('#lines');
  if (!C.generateMoves(board, side).length) { stopThinking(); setEvalBar(side === 1 ? -WIN : WIN); if (box) box.innerHTML = `<p class="muted">${$('#status').textContent}</p>`; lastLines = []; return; }
  if (box) box.innerHTML = `<p class="muted">${T.thinking}</p>`;
  const why = $('#stripWhy'); if (why) why.hidden = true;
  const snapshot = cur();
  think(board, side, { timeMs: (timeEl ? +timeEl.value : 2) * 1000, multiPv: multiEl ? +multiEl.value : 3 }, (res, partial) => {
    if (cur() !== snapshot || !res) return;
    paint(res, side);
    if (!partial) { judgeLastMove(); showWhy(); }
  });
}

function paint(res, side) {
  lastLines = res.lines.map((l) => ({ ...l, depth: res.depth, sw: whiteScore(l.score, side) }));
  if (!lastLines.length) return;
  const sb = $('#stripBest');
  if (sb) sb.innerHTML = `${C.moveToString(lastLines[0].move)} <span class="score">${fmt(lastLines[0].sw)}</span>`;
  setEvalBar(lastLines[0].sw);
  const d = $('#engineDepth'); if (d) d.textContent = res.depth;
  const best = $('#bestMove'); if (best) best.innerHTML = `<b>${C.moveToString(lastLines[0].move)}</b> <span class="score">${fmt(lastLines[0].sw)}</span>`;
  const box = $('#lines');
  if (box) {
    box.innerHTML = lastLines.map((l, i) => `<button type="button" class="line" data-i="${i}"><span class="score ${l.sw >= 0 ? 'w' : 'b'}">${fmt(l.sw)}</span><span class="pv">${l.pv.map((m, j) => j === 0 ? `<b>${C.moveToString(m)}</b>` : C.moveToString(m)).join(' ')}</span></button>`).join('');
    $$('.line', box).forEach((b) => b.onclick = () => pushMove(lastLines[+b.dataset.i].move));
  }
  drawArrows();
}

function drawArrows() {
  if (arrowsEl && !arrowsEl.checked) { boardUi.setArrows([]); return; }
  const colors = ['var(--arrow-best)', 'var(--arrow-2)', 'var(--arrow-3)'];
  const arrows = lastLines.map((l, i) => ({ path: l.move.path.map(C.sqName), color: colors[i], width: i ? 11 : 17, opacity: i ? 0.7 : 0.9 })).reverse();
  boardUi.setArrows(arrows);
}

// ---------- judging the player's own move ----------
function showJudge(text) {
  const el = $('#stripJudge');
  if (!el) return;
  el.hidden = !text;
  el.innerHTML = text || '';
}
function judgeLastMove() {
  const h = cur();
  if (!h.judgePrev || h.judged || !lastLines[0]) return;
  h.judged = true;
  const clamp = (v) => Math.max(-2000, Math.min(2000, v));
  const before = clamp(h.judgePrev.score);           // mover's view before the move
  const after = clamp(-lastLines[0].score);          // mover's view after the move
  const loss = Math.max(0, before - after);
  let label, cls = '';
  if (h.text === h.judgePrev.best) { label = T.jm_best; cls = 'best'; }
  else if (loss >= 150) { label = T.jm_blunder; cls = 'blunder'; }
  else if (loss >= 80) { label = T.jm_mistake; cls = 'mistake'; }
  else if (loss >= 40) { label = T.jm_inacc; cls = 'inacc'; }
  else label = T.jm_good;
  let text = `<span class="jm ${cls || 'good'}">${T.jm_move.replace('{san}', h.text)} ${label}</span>`;
  if (cls && cls !== 'best') text += ` ${T.jm_better.replace('{m}', '<b>' + h.judgePrev.best + '</b>')}`;
  h.judgeText = text;
  h.cls = cls;
  showJudge(text);
  renderMoves();
}

// ---------- coach ----------
function explainLines() {
  const l = lastLines[0], m = l.move;
  const p = [];
  p.push(T.ck_ex_move.replace('{m}', C.moveToString(m)));
  if (m.captured.length) p.push(T.ck_ex_capture.replace('{n}', m.captured.length));
  if (m.promote) p.push(T.ck_ex_king);
  const after = C.applyMove(cur().board, m);
  const reply = C.generateMoves(after, -cur().side);
  if (!reply.length) p.push(T.ck_ex_wins_now);
  else if (reply[0].captured.length) p.push(T.ck_ex_forces);
  const sw = l.sw;
  if (Math.abs(sw) > WIN - 1000) p.push((sw > 0 ? T.ck_win_white : T.ck_win_black).replace('{n}', Math.ceil((WIN - Math.abs(sw)) / 2)));
  else {
    const a = Math.abs(sw) / 100, side = sw > 0 ? T.side_white : T.side_black;
    p.push((a < 0.3 ? T.ev_equal : a < 1 ? T.ev_slight : a < 2.5 ? T.ev_clear : T.ev_winning).replace('{side}', side) + '.');
  }
  return p;
}
function explain() {
  const out = $('#coachOut');
  if (!lastLines.length) { out.innerHTML = `<p class="muted">${T.wait_engine}</p>`; return; }
  out.innerHTML = explainLines().map((s) => `<p>${s}</p>`).join('');
}
function showWhy() {
  const box = $('#stripWhy');
  if (!box) return;
  const parts = lastLines.length ? explainLines().slice(1) : [];
  box.hidden = !parts.length;
  $('#stripWhyText').textContent = parts.join(' ');
}
function threats() {
  const out = $('#coachOut');
  const { board, side } = cur();
  const opp = C.generateMoves(board, -side);
  const lines = [];
  const mine = C.generateMoves(board, side);
  if (mine.length && mine[0].captured.length) lines.push(T.ck_th_must);
  if (opp.length && opp[0].captured.length) {
    const max = Math.max(...opp.map((m) => m.captured.length));
    const m = opp.find((x) => x.captured.length === max);
    lines.push(T.ck_th_threat.replace('{m}', C.moveToString(m)).replace('{n}', max));
  }
  if (!lines.length) lines.push(T.th_none);
  out.innerHTML = lines.map((s) => `<p>${s}</p>`).join('');
}
$('#coachExplain') && ($('#coachExplain').onclick = explain);
$('#coachThreats') && ($('#coachThreats').onclick = threats);

// ---------- toolbar ----------
function act(n) {
  switch (n) {
    case 'flip': boardUi.flip(); drawArrows(); break;
    case 'undo': if (MODE === 'checkers-play') playUndo(); else goTo(ply - 1); break;
    case 'redo': goTo(ply + 1); break;
    case 'first': goTo(0); break;
    case 'last': goTo(hist.length - 1); break;
    case 'start': setPosition(C.startBoard(), 1); break;
    case 'clear': startEditor(true); break;
    case 'edit': startEditor(false); break;
    case 'copyfen': copyText(C.toPosString(cur().board, cur().side)); break;
    case 'share': {
      const url = location.origin + location.pathname + '?pos=' + encodeURIComponent(C.toPosString(cur().board, cur().side));
      (async () => {
        if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ url, title: document.title }); return; } catch { /* copy instead */ } }
        try { await navigator.clipboard.writeText(url); toast(T.link_copied, 3500); } catch { prompt('', url); }
      })();
      break;
    }
    default:
  }
}
$$('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog')) return;
  if (e.key === 'ArrowLeft') goTo(ply - 1);
  else if (e.key === 'ArrowRight') goTo(ply + 1);
});

function setPosition(board, side) {
  hist = [{ board, side }]; ply = 0;
  if (editing) stopEditor(false);
  refresh();
}
const posBtn = $('#posLoad');
if (posBtn) posBtn.onclick = () => {
  const p = C.fromPosString($('#pos').value);
  if (!p) { toast(T.bad_pos_ck); return; }
  setPosition(p.board, p.side);
};
$$('input[name=turn]').forEach((r) => r.addEventListener('change', () => {
  if (editing) { editSide = +r.value; return; }
  setPosition(cur().board.slice(), +r.value);
}));

const playBest = $('#playBest');
if (playBest) playBest.onclick = () => { if (lastLines[0]) pushMove(lastLines[0].move); else toast(T.wait_engine); };

// ---------- editor ----------
function startEditor(clear) {
  if (MODE === 'checkers-play') return;
  stopThinking();
  editing = true;
  editBoard = clear ? new Array(64).fill(0) : cur().board.slice();
  editSide = cur().side;
  document.body.classList.add('editing');
  $('#editorPanel').hidden = false;
  boardUi.opts.onSquare = (sq, phase) => {
    const i = C.sqIndex(sq);
    if (!C.isDark(i)) return;
    const row = Math.floor(i / 8);
    let t = editTool;
    if (t === 1 && row === 0) t = 2;
    if (t === -1 && row === 7) t = -2;
    if (editTool === 0 || (phase === 'down' && editBoard[i] === t)) editBoard[i] = 0;
    else editBoard[i] = t;
    boardUi.setPosition(posMap(editBoard));
  };
  boardUi.setArrows([]); boardUi.setHighlights({});
  boardUi.setPosition(posMap(editBoard));
  setEvalBar(null);
}
function stopEditor(apply) {
  editing = false;
  boardUi.opts.onSquare = null;
  document.body.classList.remove('editing');
  $('#editorPanel').hidden = true;
  if (apply) {
    hist = [{ board: editBoard.slice(), side: editSide }]; ply = 0;
  }
  refresh();
}
$$('.spare').forEach((b) => b.addEventListener('click', () => { editTool = +b.dataset.p; $$('.spare').forEach((x) => x.classList.toggle('on', x === b)); }));
$('#edDone') && ($('#edDone').onclick = () => {
  if (!editBoard.some((p) => p > 0) || !editBoard.some((p) => p < 0)) { toast(T.ck_need_both); return; }
  stopEditor(true);
});
$('#edCancel') && ($('#edCancel').onclick = () => stopEditor(false));
$('#edStart') && ($('#edStart').onclick = () => { editBoard = C.startBoard(); boardUi.setPosition(posMap(editBoard)); });
$('#edClear') && ($('#edClear').onclick = () => { editBoard = new Array(64).fill(0); boardUi.setPosition(posMap(editBoard)); });

// ---------- play vs computer ----------
const LEVELS = [
  { maxDepth: 1, timeMs: 150, random: 0.5 },
  { maxDepth: 3, timeMs: 300, random: 0.25 },
  { maxDepth: 5, timeMs: 600, random: 0.1 },
  { maxDepth: 8, timeMs: 1200, random: 0 },
  { maxDepth: 30, timeMs: 2500, random: 0 },
];
function setPlayStatus(t) { const el = $('#playStatus'); if (el) el.textContent = t; }
function playTurn() {
  const { board, side } = cur();
  play.over = C.generateMoves(board, side).length === 0;
  if (play.over) { setPlayStatus($('#status').textContent); return; }
  if (side === play.color) { setPlayStatus(T.your_move); return; }
  play.thinking = true;
  setPlayStatus(T.computer_thinking);
  const lv = LEVELS[play.level - 1];
  const snapshot = cur();
  const started = Date.now();
  think(board, side, { maxDepth: lv.maxDepth, timeMs: lv.timeMs, multiPv: 3 }, (res, partial) => {
    if (partial || cur() !== snapshot) return;
    play.thinking = false;
    let pick = res.lines[0];
    if (lv.random && res.lines.length > 1 && Math.random() < lv.random) pick = res.lines[1 + Math.floor(Math.random() * (res.lines.length - 1))];
    setTimeout(() => { if (cur() === snapshot) pushMove(pick.move); }, Math.max(0, 350 - (Date.now() - started)));
  });
}
function newGame() {
  stopThinking();
  const c = prefs.get('ckColor', 1);
  play.color = c === 0 ? (Math.random() < 0.5 ? 1 : -1) : c;
  play.thinking = false;
  boardUi.setOrientation(play.color === 1 ? 'white' : 'black');
  hist = [{ board: C.startBoard(), side: 1 }]; ply = 0;
  refresh();
}
function playUndo() {
  stopThinking();
  play.thinking = false;
  const back = cur().side === play.color ? 2 : 1;
  ply = Math.max(0, ply - back);
  hist = hist.slice(0, ply + 1);
  refresh();
}
if (MODE === 'checkers-play') {
  play.level = prefs.get('ckLevel', 3);
  $$('[data-level]').forEach((b) => {
    b.classList.toggle('on', +b.dataset.level === play.level);
    b.onclick = () => { play.level = +b.dataset.level; prefs.set('ckLevel', play.level); $$('[data-level]').forEach((x) => x.classList.toggle('on', x === b)); };
  });
  $$('[data-color]').forEach((b) => {
    const val = { w: 1, b: -1, r: 0 }[b.dataset.color];
    b.classList.toggle('on', val === prefs.get('ckColor', 1));
    b.onclick = () => { prefs.set('ckColor', val); $$('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); newGame(); };
  });
  $('#newGame').onclick = newGame;
  $('#hintBtn').onclick = () => {
    if (play.thinking || play.over) return;
    const { board, side } = cur();
    const snap = cur();
    think(board, side, { timeMs: 1200, multiPv: 1 }, (res, partial) => {
      if (partial || cur() !== snap || !res) return;
      boardUi.setArrows([{ path: res.lines[0].move.path.map(C.sqName), color: 'var(--arrow-best)' }]);
    });
  };
  newGame();
} else {
  const shared = new URLSearchParams(location.search).get('pos');
  const p = shared && C.fromPosString(shared);
  if (p) hist = [{ board: p.board, side: p.side }];
  refresh();
  setTimeout(onboard, 600);
}
