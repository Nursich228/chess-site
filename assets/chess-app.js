import { Chess } from './chess.js';
import { Board } from './board.js';
import { Engine } from './engine.js';
import { T, $, $$, sound, toast, copyText, prefs, onboard } from './common.js';

const MODE = document.body.dataset.tool; // analyze | best | play | import
const BASE = new URL('./', import.meta.url).href;
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FIG = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const engine = new Engine();
let hist = [{ fen: START }];
let ply = 0;
let analysisToken = 0;
let lastLines = [];
let reviewing = false;
let playState = { color: 'w', level: 3, thinking: false, over: false };

const fig = (san) => san.replace(/[KQRBN]/g, (c) => FIG[c]);
const cur = () => new Chess(hist[ply].fen);

// ---------- board ----------
const board = new Board($('#board'), {
  pieceUrl: (c) => `${BASE}pieces/${c}.svg`,
  canDrag: (sq) => {
    if (editing) return false;
    const g = cur();
    const p = g.get(sq);
    if (!p || p.color !== g.turn()) return false;
    if (MODE === 'play') return !playState.thinking && !playState.over && g.turn() === playState.color;
    return true;
  },
  targets: (sq) => cur().moves({ square: sq, verbose: true }).map((m) => m.to),
  onMove: (from, to) => userMove(from, to),
});

function posMap(g) {
  const map = {};
  g.board().forEach((row) => row.forEach((p) => { if (p) map[p.square] = p.color + p.type; }));
  return map;
}

async function userMove(from, to) {
  const g = cur();
  const legal = g.moves({ square: from, verbose: true }).filter((m) => m.to === to);
  if (!legal.length) return;
  let promotion;
  if (legal[0].promotion) promotion = await askPromotion(g.turn());
  pushMove({ from, to, promotion });
}

function pushMove(mv) {
  const g = cur();
  let m;
  try { m = g.move(mv); } catch { return false; }
  hist = hist.slice(0, ply + 1);
  const top = lastLines[0];
  const judgePrev = (MODE !== 'play' && top && top.pv[0] && top.depth >= 8) ? { best: top.pv[0], bestSan: top.san[0], sc: top.sc } : null;
  hist.push({ fen: g.fen(), san: m.san, uci: m.from + m.to + (m.promotion || ''), from: m.from, to: m.to, judgePrev, mover: m.color });
  ply++;
  sound(g.isCheck() ? 'check' : m.captured ? 'capture' : 'move');
  refresh();
  return true;
}

function askPromotion(color) {
  return new Promise((resolve) => {
    const dlg = $('#promoDialog');
    const box = $('.promo-choices', dlg);
    box.innerHTML = '';
    for (const p of ['q', 'r', 'b', 'n']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<img src="${BASE}pieces/${color}${p}.svg" alt="${p}">`;
      b.onclick = () => { dlg.close(); resolve(p); };
      box.appendChild(b);
    }
    dlg.onclose = () => resolve('q');
    dlg.showModal();
  });
}

// ---------- refresh ----------
function refresh() {
  const g = cur();
  board.setPosition(editing ? editPos : posMap(g));
  const h = {};
  const last = hist[ply];
  if (last.from && !editing) { h[last.from] = 'last'; h[last.to] = 'last'; }
  if (g.isCheck() && !editing) {
    const k = g.board().flat().find((p) => p && p.type === 'k' && p.color === g.turn());
    if (k) h[k.square] = (h[k.square] ? h[k.square] + ' ' : '') + 'check';
  }
  board.setHighlights(h);
  board.setArrows([]);
  const fenInput = $('#fen');
  if (fenInput && document.activeElement !== fenInput) fenInput.value = hist[ply].fen;
  $$('input[name=turn]').forEach((r) => { r.checked = r.value === g.turn(); });
  renderMoves();
  updateGameStatus(g);
  showJudge(hist[ply].judgeText);
  showOpening();
  if (MODE === 'play') { playTurn(); return; }
  if (MODE === 'best') { clearBestCard(); runAnalysis(); return; }
  runAnalysis();
}

function updateGameStatus(g) {
  const el = $('#status');
  if (!el) return;
  let s = '';
  if (g.isCheckmate()) s = g.turn() === 'w' ? T.mate_black_wins : T.mate_white_wins;
  else if (g.isStalemate()) s = T.stalemate;
  else if (g.isThreefoldRepetition()) s = T.threefold;
  else if (g.isInsufficientMaterial()) s = T.insufficient;
  else if (g.isDraw()) s = T.draw;
  else s = g.turn() === 'w' ? T.white_to_move : T.black_to_move;
  el.textContent = s;
  if (g.isGameOver()) sound('end');
}

// ---------- move list ----------
function renderMoves() {
  const box = $('#moves');
  if (!box) return;
  if (hist.length < 2) { box.innerHTML = `<p class="muted">${T.no_moves}</p>`; return; }
  const startFen = hist[0].fen.split(' ');
  let num = parseInt(startFen[5], 10) || 1;
  let blackFirst = startFen[1] === 'b';
  let html = '';
  for (let i = 1; i < hist.length; i++) {
    const isWhite = blackFirst ? (i % 2 === 0) : (i % 2 === 1);
    if (isWhite || i === 1) html += `<span class="mnum">${num}.${!isWhite ? '..' : ''}</span>`;
    const cls = hist[i].cls ? ' ' + hist[i].cls : '';
    const mark = hist[i].mark ? `<sup>${hist[i].mark}</sup>` : '';
    html += `<button type="button" class="mv${i === ply ? ' on' : ''}${cls}" data-ply="${i}">${fig(hist[i].san)}${mark}</button>`;
    if (!isWhite) num++;
  }
  box.innerHTML = html;
  $$('.mv', box).forEach((b) => b.onclick = () => goTo(parseInt(b.dataset.ply, 10)));
  const on = $('.mv.on', box);
  if (on) on.scrollIntoView({ block: 'nearest' });
}

function goTo(i) {
  if (MODE === 'play') return;
  ply = Math.max(0, Math.min(hist.length - 1, i));
  refresh();
}

// ---------- analysis ----------
const depthEl = $('#depthRange');
const multiEl = $('#multiPv');
const arrowsEl = $('#arrowsToggle');
if (depthEl) {
  depthEl.value = prefs.get('depth', MODE === 'best' ? 18 : 16);
  $('#depthVal').textContent = depthEl.value;
  depthEl.oninput = () => { $('#depthVal').textContent = depthEl.value; };
  depthEl.onchange = () => { prefs.set('depth', +depthEl.value); runAnalysis(); };
}
if (multiEl) { multiEl.value = prefs.get('multipv', 3); multiEl.onchange = () => { prefs.set('multipv', +multiEl.value); runAnalysis(); }; }
if (arrowsEl) { arrowsEl.checked = prefs.get('arrows', true); arrowsEl.onchange = () => { prefs.set('arrows', arrowsEl.checked); drawLineArrows(); }; }

function whiteScore(info, turn) {
  const s = turn === 'w' ? 1 : -1;
  return { cp: info.cp !== null ? info.cp * s : null, mate: info.mate !== null ? info.mate * s : null };
}

function fmtScore(sc) {
  if (sc.mate !== null) return (sc.mate > 0 ? '+' : '−') + 'M' + Math.abs(sc.mate);
  const v = sc.cp / 100;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
}

function setEvalBar(sc) {
  const bar = $('#evalbar');
  if (!bar) return;
  let pct;
  if (!sc) pct = 50;
  else if (sc.mate !== null) pct = sc.mate > 0 ? 100 : 0;
  else pct = 50 + 50 * (2 / (1 + Math.exp(-0.004 * sc.cp)) - 1);
  $('.evalfill', bar).style.height = pct + '%';
  $('.evaltext', bar).textContent = sc ? fmtScore(sc).replace('+', '') : '0.0';
  bar.classList.toggle('black-better', pct < 50);
}

function pvToSan(fen, uciList, max = 10) {
  const g = new Chess(fen);
  const out = [];
  for (const u of uciList.slice(0, max)) {
    try { const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); out.push(m.san); } catch { break; }
  }
  return out;
}

function runAnalysis() {
  if (editing || reviewing) return;
  const g = cur();
  const fen = hist[ply].fen;
  const token = ++analysisToken;
  lastLines = [];
  const linesBox = $('#lines');
  if (g.isGameOver()) {
    engine.stop();
    setEvalBar(g.isCheckmate() ? { cp: null, mate: g.turn() === 'w' ? -0 : 0 } : { cp: 0, mate: null });
    if (g.isCheckmate()) setEvalBar({ cp: g.turn() === 'w' ? -10000 : 10000, mate: null });
    if (linesBox) linesBox.innerHTML = `<p class="muted">${$('#status')?.textContent || ''}</p>`;
    return;
  }
  if (linesBox) linesBox.innerHTML = `<p class="muted">${T.thinking}</p>`;
  hideWhy();
  const depth = depthEl ? +depthEl.value : 16;
  const multipv = MODE === 'best' ? 1 : (multiEl ? +multiEl.value : 1);
  let lastPaint = 0;
  engine.analyse(fen, {
    depth, multipv,
    onInfo: (info, all) => {
      if (token !== analysisToken) return;
      const now = performance.now();
      if (now - lastPaint < 120 && info.depth < depth) return;
      lastPaint = now;
      paintLines(fen, g.turn(), Object.values(all).sort((a, b) => a.multipv - b.multipv), info.depth);
    },
  }).then((res) => {
    if (!res || token !== analysisToken) return;
    paintLines(fen, g.turn(), res.lines, depth, true);
    if (MODE === 'best') fillBestCard(fen, g.turn(), res.lines[0]);
  });
}

function paintLines(fen, turn, lines, depth, done) {
  lastLines = lines.map((l) => ({ ...l, sc: whiteScore(l, turn), san: pvToSan(fen, l.pv) }));
  if (!lastLines.length) return;
  const sb = $('#stripBest');
  if (sb && lastLines[0].san[0]) sb.innerHTML = `${fig(lastLines[0].san[0])} <span class="score">${fmtScore(lastLines[0].sc)}</span>`;
  if (done) { judgeLastMove(); showWhy(fen, lastLines[0]); }
  setEvalBar(lastLines[0].sc);
  const dEl = $('#engineDepth');
  if (dEl) dEl.textContent = depth;
  const best = $('#bestMove');
  if (best && lastLines[0].san[0]) best.innerHTML = `<b>${fig(lastLines[0].san[0])}</b> <span class="score">${fmtScore(lastLines[0].sc)}</span>`;
  const box = $('#lines');
  if (box) {
    box.innerHTML = lastLines.map((l, i) => `
      <button type="button" class="line" data-i="${i}">
        <span class="score ${l.sc.mate !== null ? (l.sc.mate > 0 ? 'w' : 'b') : (l.sc.cp >= 0 ? 'w' : 'b')}">${fmtScore(l.sc)}</span>
        <span class="pv">${l.san.map((s, j) => j === 0 ? `<b>${fig(s)}</b>` : fig(s)).join(' ')}</span>
      </button>`).join('');
    $$('.line', box).forEach((b) => b.onclick = () => {
      const l = lastLines[+b.dataset.i];
      if (l && l.pv[0]) pushMove({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), promotion: l.pv[0][4] });
    });
  }
  drawLineArrows();
}

function drawLineArrows() {
  if (arrowsEl && !arrowsEl.checked) { board.setArrows([]); return; }
  const colors = ['var(--arrow-best)', 'var(--arrow-2)', 'var(--arrow-3)'];
  const arrows = [];
  lastLines.slice().reverse().forEach((l) => {
    const i = lastLines.indexOf(l);
    if (l.pv[0]) arrows.push({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), color: colors[i], width: i === 0 ? 17 : 11, opacity: i === 0 ? 0.9 : 0.7 });
  });
  board.setArrows(arrows);
}

// ---------- best move page ----------
function clearBestCard() {
  const c = $('#bestCard');
  if (!c) return;
  c.classList.add('pending');
  $('#bestSan').textContent = '…';
  $('#bestEval').textContent = '';
  $('#bestLine').textContent = T.thinking;
  $('#bestWhy').textContent = '';
}
function fillBestCard(fen, turn, line) {
  const c = $('#bestCard');
  if (!c || !line) return;
  const sc = whiteScore(line, turn);
  const san = pvToSan(fen, line.pv);
  c.classList.remove('pending');
  $('#bestSan').textContent = fig(san[0] || '—');
  $('#bestEval').textContent = fmtScore(sc);
  $('#bestLine').textContent = san.slice(0, 8).map(fig).join(' ');
  $('#bestWhy').textContent = explainMove(fen, line.pv[0], sc).join(' ');
}

// ---------- coach: explanations in plain words ----------
const PNAME = () => ({ p: T.p_pawn, n: T.p_knight, b: T.p_bishop, r: T.p_rook, q: T.p_queen, k: T.p_king });

function evalWords(sc) {
  if (sc.mate !== null) return (sc.mate > 0 ? T.ev_mate_white : T.ev_mate_black).replace('{n}', Math.abs(sc.mate));
  const v = sc.cp / 100, a = Math.abs(v);
  const side = v > 0 ? T.side_white : T.side_black;
  if (a < 0.3) return T.ev_equal;
  if (a < 1) return T.ev_slight.replace('{side}', side);
  if (a < 2.5) return T.ev_clear.replace('{side}', side);
  return T.ev_winning.replace('{side}', side);
}

function explainMove(fen, uci, sc) {
  if (!uci) return [];
  const names = PNAME();
  const g = new Chess(fen);
  let m;
  try { m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { return []; }
  const out = [];
  out.push(T.ex_move.replace('{san}', fig(m.san)).replace('{piece}', names[m.piece]));
  if (g.isCheckmate()) { out.push(T.ex_mate); return out; }
  if (m.isKingsideCastle() || m.isQueensideCastle()) out.push(T.ex_castle);
  if (m.captured) out.push(T.ex_capture.replace('{p}', names[m.captured]));
  if (m.promotion) out.push(T.ex_promo.replace('{p}', names[m.promotion]));
  if (g.isCheck()) out.push(T.ex_check);
  // what does the moved piece attack now?
  const targets = [];
  for (const row of g.board()) for (const p of row) {
    if (p && p.color !== m.color && p.type !== 'p' && VALUE[p.type] >= VALUE[m.piece] - 0 && g.attackers(p.square, m.color).includes(m.to)) targets.push(p);
  }
  const bigTargets = targets.filter((p) => p.type === 'k' || VALUE[p.type] >= 3);
  if (bigTargets.length >= 2) out.push(T.ex_fork.replace('{list}', bigTargets.map((p) => names[p.type]).join(', ')));
  else if (bigTargets.length === 1 && bigTargets[0].type !== 'k') out.push(T.ex_attack.replace('{p}', names[bigTargets[0].type]));
  const before = new Chess(fen);
  const moveNo = parseInt(fen.split(' ')[5], 10);
  if (moveNo <= 12 && ['n', 'b'].includes(m.piece) && (m.from[1] === '1' || m.from[1] === '8')) out.push(T.ex_develop);
  if (['d4', 'e4', 'd5', 'e5'].includes(m.to) && m.piece === 'p') out.push(T.ex_center);
  // sacrifice: piece lands on attacked, undefended square
  const attacked = g.attackers(m.to, m.color === 'w' ? 'b' : 'w').length > 0;
  const defended = g.attackers(m.to, m.color).length > 0;
  if (attacked && !defended && VALUE[m.piece] >= 3 && !g.isCheck()) out.push(T.ex_sac);
  if (before.isCheck()) out.push(T.ex_escape);
  out.push(evalWords(sc) + '.');
  return out;
}

function hangingPieces(fen) {
  const g = new Chess(fen);
  const me = g.turn(), opp = me === 'w' ? 'b' : 'w';
  const res = [];
  for (const row of g.board()) for (const p of row) {
    if (!p || p.color !== me || p.type === 'k') continue;
    const att = g.attackers(p.square, opp);
    if (!att.length) continue;
    const def = g.attackers(p.square, me).length;
    const cheapest = Math.min(...att.map((s) => VALUE[g.get(s).type] || 0));
    if (!def || cheapest < VALUE[p.type]) res.push(p);
  }
  return res;
}

async function explainThreats() {
  const out = $('#coachOut');
  const fen = hist[ply].fen;
  const g = new Chess(fen);
  const names = PNAME();
  const lines = [];
  if (g.isGameOver()) { out.textContent = $('#status').textContent; return; }
  if (g.isCheck()) lines.push(T.th_in_check);
  const hang = hangingPieces(fen);
  if (hang.length) lines.push(T.th_hanging.replace('{list}', hang.map((p) => `${names[p.type]} ${p.square}`).join(', ')));
  if (!g.isCheck()) {
    out.innerHTML = `<p class="muted">${T.thinking}</p>`;
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-';
    const nullFen = parts.join(' ');
    let ok = true;
    try { new Chess(nullFen); } catch { ok = false; }
    if (ok) {
      const res = await engine.analyse(nullFen, { depth: 12, multipv: 1 });
      if (res && res.lines[0]) {
        const l = res.lines[0];
        const san = pvToSan(nullFen, l.pv, 3);
        const ng = new Chess(nullFen);
        let mv = null;
        try { mv = ng.move(san[0]); } catch { /* ignore */ }
        if (l.mate !== null && l.mate > 0) lines.push(T.th_mate.replace('{san}', fig(san[0])).replace('{n}', l.mate));
        else if (mv && (mv.captured || ng.isCheck() || (l.cp !== null && l.cp > 150))) {
          let txt = T.th_threat.replace('{san}', fig(san[0]));
          if (mv.captured) txt += ' ' + T.th_wins.replace('{p}', names[mv.captured]);
          lines.push(txt);
        }
        runAnalysis();
      }
    }
  }
  if (!lines.length) lines.push(T.th_none);
  out.innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
}

const explainBtn = $('#coachExplain');
if (explainBtn) explainBtn.onclick = () => {
  const out = $('#coachOut');
  if (!lastLines.length || !lastLines[0].pv[0]) { out.innerHTML = `<p class="muted">${T.wait_engine}</p>`; return; }
  const l = lastLines[0];
  out.innerHTML = explainMove(hist[ply].fen, l.pv[0], l.sc).map((s) => `<p>${s}</p>`).join('');
};
const threatBtn = $('#coachThreats');
if (threatBtn) threatBtn.onclick = () => explainThreats();

// ---------- one-line reason under the board ----------
function showWhy(fen, line) {
  const box = $('#stripWhy');
  if (!box) return;
  const parts = line && line.pv[0] ? explainMove(fen, line.pv[0], line.sc).slice(1) : [];
  box.hidden = !parts.length;
  // keep it short: up to two reasons plus the overall assessment
  const reasons = parts.slice(0, -1).slice(0, 2);
  $('#stripWhyText').textContent = [...reasons, parts[parts.length - 1]].filter(Boolean).join(' ');
}
function hideWhy() { const b = $('#stripWhy'); if (b) b.hidden = true; }

// ---------- judging the player's own move ----------
function showJudge(text) {
  const el = $('#stripJudge');
  if (!el) return;
  el.hidden = !text;
  el.innerHTML = text || '';
}
function judgeLastMove() {
  const h = hist[ply];
  if (!h || !h.judgePrev || h.judged || !lastLines[0]) return;
  h.judged = true;
  const p = h.judgePrev;
  const s = h.mover === 'w' ? 1 : -1;
  const before = winPct(s * scoreToCp(p.sc)), after = winPct(s * scoreToCp(lastLines[0].sc));
  const drop = Math.max(0, before - after);
  let label, cls = '', mark = '';
  if (h.uci === p.best) { label = T.jm_best; cls = 'best'; }
  else if (drop >= 30) { label = T.jm_blunder; cls = 'blunder'; mark = '??'; }
  else if (drop >= 20) { label = T.jm_mistake; cls = 'mistake'; mark = '?'; }
  else if (drop >= 10) { label = T.jm_inacc; cls = 'inacc'; mark = '?!'; }
  else label = T.jm_good;
  h.cls = cls; h.mark = mark;
  let text = `<span class="jm ${cls || 'good'}">${T.jm_move.replace('{san}', fig(h.san))} ${label}</span>`;
  if (mark) text += ` ${T.jm_better.replace('{m}', '<b>' + fig(p.bestSan) + '</b>')}`;
  h.judgeText = text;
  showJudge(text);
  renderMoves();
}

// ---------- opening names (Lichess chess-openings, CC0) ----------
let openings = null, openingsLoading = null;
function loadOpenings() {
  if (!openingsLoading) openingsLoading = fetch(BASE + 'openings.json').then((r) => r.json()).then((d) => { openings = d; }).catch(() => { openings = {}; });
  return openingsLoading;
}
function translateOpening(name) {
  const OPN = window.OPN || {};
  const [family, ...rest] = name.split(': ');
  const tr = OPN[family];
  if (!tr) return name;
  return rest.length ? `${tr} · ${rest.join(': ')}` : tr;
}
async function showOpening() {
  const box = $('#opening');
  if (!box) return;
  if (!openings) await loadOpenings();
  let found = null;
  for (let i = ply; i >= 0 && !found; i--) {
    const key = hist[i].fen.split(' ').slice(0, 4).join(' ');
    if (openings[key]) found = openings[key];
  }
  box.hidden = !found;
  if (found) $('#openingName').textContent = `${found[0]} ${translateOpening(found[1])}`;
}

// ---------- share a position ----------
async function sharePosition(param, value) {
  const url = location.origin + location.pathname + '?' + param + '=' + encodeURIComponent(value);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ url, title: document.title }); return; } catch { /* fall back to copying */ }
  }
  try { await navigator.clipboard.writeText(url); toast(T.link_copied, 3500); }
  catch { prompt('', url); }
}

// ---------- toolbar ----------
function act(name) {
  switch (name) {
    case 'flip': board.flip(); drawLineArrows(); break;
    case 'undo':
      if (MODE === 'play') { playUndo(); break; }
      goTo(ply - 1); break;
    case 'redo': goTo(ply + 1); break;
    case 'first': goTo(0); break;
    case 'last': goTo(hist.length - 1); break;
    case 'start': loadFen(START); break;
    case 'clear': startEditor(true); break;
    case 'edit': startEditor(false); break;
    case 'copyfen': copyText(hist[ply].fen); break;
    case 'copypgn': copyText(toPgn()); break;
    case 'pgn': $('#pgnDialog').showModal(); break;
    case 'share': sharePosition('fen', hist[ply].fen); break;
    default:
  }
}
$$('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog')) return;
  if (e.key === 'ArrowLeft') goTo(ply - 1);
  else if (e.key === 'ArrowRight') goTo(ply + 1);
  else if (e.key === 'f') act('flip');
});

function toPgn() {
  const g = new Chess(hist[0].fen);
  for (let i = 1; i < hist.length; i++) g.move(hist[i].san);
  return g.pgn();
}

export function loadFen(fen) {
  try { new Chess(fen); } catch { toast(T.bad_fen); return false; }
  hist = [{ fen }];
  ply = 0;
  if (editing) stopEditor(false);
  refresh();
  return true;
}

function loadPgn(text) {
  const g = new Chess();
  try { g.loadPgn(text.trim()); } catch { toast(T.bad_pgn); return false; }
  const moves = g.history({ verbose: true });
  const head = g.getHeaders();
  const start = head.FEN || START;
  hist = [{ fen: start }];
  for (const m of moves) hist.push({ fen: m.after, san: m.san, uci: m.from + m.to + (m.promotion || ''), from: m.from, to: m.to });
  ply = hist.length - 1;
  if (MODE === 'import') { ply = 0; showGameHeader(head); }
  refresh();
  return true;
}

const fenBtn = $('#fenLoad');
if (fenBtn) fenBtn.onclick = () => loadFen($('#fen').value.trim());
const fenInput = $('#fen');
if (fenInput) fenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadFen(fenInput.value.trim()); });
const pgnApply = $('#pgnApply');
if (pgnApply) pgnApply.onclick = () => { if (loadPgn($('#pgnText').value)) $('#pgnDialog').close(); };

$$('input[name=turn]').forEach((r) => r.addEventListener('change', () => {
  if (editing) { editTurn = r.value; return; }
  const parts = hist[ply].fen.split(' ');
  parts[1] = r.value; parts[3] = '-';
  const f = parts.join(' ');
  try { new Chess(f); loadFen(f); } catch { toast(T.bad_turn); refresh(); }
}));

document.addEventListener('paste', (e) => {
  if (e.target.closest('input, textarea')) return;
  const text = (e.clipboardData || window.clipboardData).getData('text').trim();
  if (!text) return;
  if (/^[1-8pnbrqkPNBRQK/]+\s+[wb]\b/.test(text)) loadFen(text);
  else if (/\d\.\s*\S/.test(text)) loadPgn(text);
});

// ---------- board editor ----------
let editing = false, editPos = {}, editTool = 'wp', editTurn = 'w';
function startEditor(clear) {
  if (MODE === 'play') return;
  engine.stop();
  analysisToken++;
  editing = true;
  editPos = clear ? {} : posMap(cur());
  editTurn = cur().turn();
  document.body.classList.add('editing');
  const panel = $('#editorPanel');
  if (panel) panel.hidden = false;
  board.opts.onSquare = (sq, phase) => {
    if (editTool === 'x') delete editPos[sq];
    else if (phase === 'down' && editPos[sq] === editTool) delete editPos[sq];
    else editPos[sq] = editTool;
    if (editTool[1] === 'k') for (const [s, c] of Object.entries(editPos)) if (c === editTool && s !== sq) delete editPos[s];
    board.setPosition(editPos);
    syncCastling();
  };
  board.setArrows([]);
  board.setHighlights({});
  board.setPosition(editPos);
  const rights = clear ? '' : hist[ply].fen.split(' ')[2];
  ['K', 'Q', 'k', 'q'].forEach((k) => { const el = $('#c' + k); if (el) el.checked = rights.includes(k); });
  $$('input[name=turn]').forEach((r) => { r.checked = r.value === editTurn; });
  syncCastling();
  setEvalBar(null);
}
function syncCastling() {
  const can = { K: editPos.e1 === 'wk' && editPos.h1 === 'wr', Q: editPos.e1 === 'wk' && editPos.a1 === 'wr', k: editPos.e8 === 'bk' && editPos.h8 === 'br', q: editPos.e8 === 'bk' && editPos.a8 === 'br' };
  for (const [k, ok] of Object.entries(can)) {
    const el = $('#c' + k);
    if (!el) continue;
    el.disabled = !ok;
    if (!ok) el.checked = false;
  }
}
function editorFen() {
  let rows = [];
  for (let r = 8; r >= 1; r--) {
    let row = '', empty = 0;
    for (const f of 'abcdefgh') {
      const c = editPos[f + r];
      if (!c) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += c[0] === 'w' ? c[1].toUpperCase() : c[1];
    }
    if (empty) row += empty;
    rows.push(row);
  }
  let castle = ['K', 'Q', 'k', 'q'].filter((k) => $('#c' + k)?.checked).join('') || '-';
  return `${rows.join('/')} ${editTurn} ${castle} - 0 1`;
}
function stopEditor(apply) {
  if (apply) {
    const fen = editorFen();
    const wk = Object.values(editPos).filter((c) => c === 'wk').length, bk = Object.values(editPos).filter((c) => c === 'bk').length;
    if (wk !== 1 || bk !== 1) { toast(T.need_kings); return; }
    try { new Chess(fen); } catch { toast(T.bad_position); return; }
    const test = new Chess(fen);
    const opp = editTurn === 'w' ? 'b' : 'w';
    const oppKing = Object.entries(editPos).find(([, c]) => c === opp + 'k')[0];
    if (test.attackers(oppKing, editTurn).length) { toast(T.bad_check); return; }
    editing = false;
    board.opts.onSquare = null;
    document.body.classList.remove('editing');
    $('#editorPanel').hidden = true;
    hist = [{ fen }]; ply = 0;
    refresh();
    return;
  }
  editing = false;
  board.opts.onSquare = null;
  document.body.classList.remove('editing');
  const p = $('#editorPanel');
  if (p) p.hidden = true;
}
$$('.spare').forEach((b) => b.addEventListener('click', () => {
  editTool = b.dataset.p;
  $$('.spare').forEach((x) => x.classList.toggle('on', x === b));
}));
const edDone = $('#edDone'); if (edDone) edDone.onclick = () => stopEditor(true);
const edCancel = $('#edCancel'); if (edCancel) edCancel.onclick = () => { stopEditor(false); refresh(); };
const edStart = $('#edStart'); if (edStart) edStart.onclick = () => { editPos = posMap(new Chess()); board.setPosition(editPos); syncCastling(); ['K', 'Q', 'k', 'q'].forEach((k) => { const el = $('#c' + k); if (el) el.checked = true; }); };
const edClear = $('#edClear'); if (edClear) edClear.onclick = () => { editPos = {}; board.setPosition(editPos); syncCastling(); };

// ---------- play vs computer ----------
const LEVELS = [
  { skill: 0, depth: 1, movetime: 60 },
  { skill: 4, depth: 4, movetime: 150 },
  { skill: 9, depth: 8, movetime: 300 },
  { skill: 15, depth: 12, movetime: 700 },
  { skill: 20, depth: 18, movetime: 1500 },
];
function setPlayStatus(txt) { const el = $('#playStatus'); if (el) el.textContent = txt; }

async function playTurn() {
  const g = cur();
  playState.over = g.isGameOver();
  if (playState.over) { setPlayStatus($('#status').textContent); setEvalBar(null); return; }
  if (g.turn() === playState.color) { setPlayStatus(T.your_move); return; }
  playState.thinking = true;
  setPlayStatus(T.computer_thinking);
  const lv = LEVELS[playState.level - 1];
  const fen = hist[ply].fen;
  const token = ++analysisToken;
  const res = await engine.analyse(fen, { depth: lv.depth, movetime: lv.movetime, skill: lv.skill, multipv: 1 });
  if (!res || token !== analysisToken || hist[ply].fen !== fen) return;
  playState.thinking = false;
  const u = res.bestmove;
  if (u && u !== '(none)') {
    await new Promise((r) => setTimeout(r, 200));
    pushMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  }
}
function newGame() {
  analysisToken++;
  engine.stop();
  const c = prefs.get('playColor', 'w');
  playState.color = c === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : c;
  playState.thinking = false;
  board.setOrientation(playState.color === 'w' ? 'white' : 'black');
  hist = [{ fen: START }]; ply = 0;
  refresh();
}
function playUndo() {
  analysisToken++;
  engine.stop();
  playState.thinking = false;
  let back = cur().turn() === playState.color ? 2 : 1;
  ply = Math.max(0, ply - back);
  hist = hist.slice(0, ply + 1);
  refresh();
}
if (MODE === 'play') {
  playState.level = prefs.get('playLevel', 3);
  $$('[data-level]').forEach((b) => {
    b.classList.toggle('on', +b.dataset.level === playState.level);
    b.onclick = () => { playState.level = +b.dataset.level; prefs.set('playLevel', playState.level); $$('[data-level]').forEach((x) => x.classList.toggle('on', x === b)); };
  });
  $$('[data-color]').forEach((b) => {
    b.classList.toggle('on', b.dataset.color === prefs.get('playColor', 'w'));
    b.onclick = () => { prefs.set('playColor', b.dataset.color); $$('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); newGame(); };
  });
  $('#newGame').onclick = newGame;
  $('#hintBtn').onclick = async () => {
    if (playState.thinking || playState.over) return;
    const fen = hist[ply].fen;
    const res = await engine.analyse(fen, { depth: 14, multipv: 1 });
    if (res && res.bestmove && hist[ply].fen === fen) board.setArrows([{ from: res.bestmove.slice(0, 2), to: res.bestmove.slice(2, 4), color: 'var(--arrow-best)' }]);
  };
}

// ---------- import & review ----------
function showGameHeader(h) {
  const el = $('#gameHead');
  if (!el) return;
  el.hidden = false;
  const ok = (v) => v && !/^\?+[?.]*$/.test(v);
  const names = ok(h.White) || ok(h.Black) ? `${ok(h.White) ? h.White : '?'} – ${ok(h.Black) ? h.Black : '?'}` : '';
  el.textContent = [names, ok(h.Result) && h.Result !== '*' ? h.Result : '', ok(h.Date) ? '(' + h.Date + ')' : ''].filter(Boolean).join('  ');
  el.hidden = !el.textContent;
  for (let i = 1; i < hist.length; i++) { delete hist[i].cls; delete hist[i].mark; }
  const rb = $('#reviewBtn'); if (rb) rb.hidden = false;
  $('#reviewOut') && ($('#reviewOut').innerHTML = '');
}

async function fetchGames() {
  const src = $('input[name=src]:checked').value;
  const user = $('#username').value.trim();
  const list = $('#gamesList');
  if (!user) { toast(T.need_user); return; }
  list.innerHTML = `<p class="muted">${T.loading}</p>`;
  let games = [];
  try {
    if (src === 'lichess') {
      const r = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=12&pgnInJson=true&opening=true`, { headers: { Accept: 'application/x-ndjson' } });
      if (!r.ok) throw new Error(r.status);
      const txt = await r.text();
      games = txt.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((g) => ({
        white: g.players.white.user?.name || 'AI', black: g.players.black.user?.name || 'AI',
        result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
        date: new Date(g.createdAt).toLocaleDateString(), speed: g.speed, pgn: g.pgn,
      }));
    } else {
      const r = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`);
      if (!r.ok) throw new Error(r.status);
      const arch = (await r.json()).archives || [];
      for (let i = arch.length - 1; i >= 0 && games.length < 12; i--) {
        const m = await (await fetch(arch[i])).json();
        const gs = (m.games || []).filter((g) => g.rules === 'chess').reverse();
        for (const g of gs) {
          if (games.length >= 12) break;
          const res = g.white.result === 'win' ? '1-0' : g.black.result === 'win' ? '0-1' : '½-½';
          games.push({ white: g.white.username, black: g.black.username, result: res, date: new Date(g.end_time * 1000).toLocaleDateString(), speed: g.time_class, pgn: g.pgn });
        }
      }
    }
  } catch {
    list.innerHTML = `<p class="err">${T.fetch_failed}</p>`;
    return;
  }
  if (!games.length) { list.innerHTML = `<p class="muted">${T.no_games}</p>`; return; }
  list.innerHTML = games.map((g, i) => `<button type="button" class="game" data-i="${i}"><span>${g.white} – ${g.black}</span><span class="res">${g.result}</span><span class="muted">${g.date} · ${g.speed || ''}</span></button>`).join('');
  $$('.game', list).forEach((b) => b.onclick = () => {
    $$('.game', list).forEach((x) => x.classList.toggle('on', x === b));
    loadPgn(games[+b.dataset.i].pgn);
    $('#reviewArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
const scoreToCp = (sc) => sc.mate !== null ? (sc.mate > 0 ? 10000 - sc.mate * 10 : -10000 - sc.mate * 10) : sc.cp;

async function reviewGame() {
  if (hist.length < 2) return;
  reviewing = true;
  analysisToken++;
  const btn = $('#reviewBtn');
  btn.disabled = true;
  const out = $('#reviewOut');
  const evals = [];
  for (let i = 0; i < hist.length; i++) {
    out.innerHTML = `<p class="muted">${T.reviewing.replace('{n}', i + 1).replace('{t}', hist.length)}</p><div class="progress"><span style="width:${(i / hist.length) * 100}%"></span></div>`;
    const g = new Chess(hist[i].fen);
    if (g.isCheckmate()) { evals.push({ cp: g.turn() === 'w' ? -10000 : 10000, best: null }); continue; }
    if (g.isGameOver()) { evals.push({ cp: 0, best: null }); continue; }
    const res = await engine.analyse(hist[i].fen, { depth: 12, movetime: 600, multipv: 1 });
    if (!res) { reviewing = false; btn.disabled = false; return; }
    const sc = whiteScore(res.lines[0] || { cp: 0, mate: null }, g.turn());
    evals.push({ cp: scoreToCp(sc), best: res.bestmove });
  }
  const loss = { w: [], b: [] };
  const counts = { w: { inacc: 0, mistake: 0, blunder: 0 }, b: { inacc: 0, mistake: 0, blunder: 0 } };
  for (let i = 1; i < hist.length; i++) {
    const mover = new Chess(hist[i - 1].fen).turn();
    const s = mover === 'w' ? 1 : -1;
    const before = winPct(s * evals[i - 1].cp), after = winPct(s * evals[i].cp);
    const drop = Math.max(0, before - after);
    loss[mover].push(drop);
    hist[i].eval = evals[i].cp;
    delete hist[i].cls; delete hist[i].mark;
    if (hist[i].uci === evals[i - 1].best) { hist[i].cls = 'best'; }
    else if (drop >= 30) { hist[i].cls = 'blunder'; hist[i].mark = '??'; counts[mover].blunder++; }
    else if (drop >= 20) { hist[i].cls = 'mistake'; hist[i].mark = '?'; counts[mover].mistake++; }
    else if (drop >= 10) { hist[i].cls = 'inacc'; hist[i].mark = '?!'; counts[mover].inacc++; }
  }
  const acc = (arr) => arr.length ? Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * (arr.reduce((a, b) => a + b, 0) / arr.length)) - 3.1669)) : 100;
  const row = (c) => `<tr><th>${c === 'w' ? T.side_white_cap : T.side_black_cap}</th><td><b>${acc(loss[c]).toFixed(1)}%</b></td><td>${counts[c].inacc}</td><td>${counts[c].mistake}</td><td>${counts[c].blunder}</td></tr>`;
  out.innerHTML = `<table class="acc"><thead><tr><th></th><th>${T.accuracy}</th><th class="inacc">?! ${T.inaccuracies}</th><th class="mistake">? ${T.mistakes}</th><th class="blunder">?? ${T.blunders}</th></tr></thead><tbody>${row('w')}${row('b')}</tbody></table>${graphSvg(evals)}`;
  $$('#reviewOut .gpt').forEach((p) => p.onclick = () => goTo(+p.dataset.i));
  reviewing = false;
  btn.disabled = false;
  renderMoves();
  runAnalysis();
}

function graphSvg(evals) {
  const W = 600, H = 120;
  const n = evals.length;
  const pts = evals.map((e, i) => [n > 1 ? (i / (n - 1)) * W : 0, H - (winPct(e.cp) / 100) * H]);
  const area = `M0,${H} ` + pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${W},${H} Z`;
  const dots = pts.map((p, i) => {
    const c = hist[i]?.cls;
    if (!['blunder', 'mistake'].includes(c)) return '';
    return `<circle class="gdot ${c}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4"/>`;
  }).join('');
  const hits = pts.map((p, i) => `<rect class="gpt" data-i="${i}" x="${(p[0] - W / n / 2).toFixed(1)}" y="0" width="${(W / n).toFixed(1)}" height="${H}"/>`).join('');
  return `<svg class="graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${T.graph_label}"><rect width="${W}" height="${H}" class="gbg"/><path d="${area}" class="garea"/><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="gmid"/>${dots}${hits}</svg>`;
}

if (MODE === 'import') {
  $('#fetchGames').onclick = fetchGames;
  $('#username').addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchGames(); });
  $('#reviewBtn').onclick = reviewGame;
  const pgnLoad = $('#pgnLoadInline');
  if (pgnLoad) pgnLoad.onclick = () => loadPgn($('#pgnInline').value);
}

const playBest = $('#playBest');
if (playBest) playBest.onclick = () => {
  const l = lastLines[0];
  if (l && l.pv[0]) pushMove({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), promotion: l.pv[0][4] });
  else toast(T.wait_engine);
};

// ---------- start ----------
const params = new URLSearchParams(location.search);
if (MODE === 'analyze' || MODE === 'best') setTimeout(onboard, 600);
if (MODE === 'play') newGame();
else if (params.get('fen')) { if (!loadFen(params.get('fen'))) refresh(); }
else refresh();
