// Card counter: mark cards that left the game or are in your hand; see what is still in play.
import { T, $, $$, toast, prefs, sound } from './common.js';

const SUIT_SYM = ['♠', '♣', '♦', '♥'];
const SUIT_NAMES = (T.cd_suits || 'spades,clubs,diamonds,hearts').split(',');
const RANKS = (T.cd_ranks || '2,3,4,5,6,7,8,9,10,J,Q,K,A').split(',');
const RANK_NAMES = (T.cd_rank_names || '').split(',');
const RED = (s) => s === 2 || s === 3;

const saved = prefs.get('cards', null);
const state = Object.assign({ deck: 36, trump: null, mode: 'gone', marks: {} }, saved || {});
let history = [];
let resetArmed = false;
const selected = new Set(); // cards picked for the discard pile

const firstRank = () => ({ 24: 7, 36: 4, 52: 0 }[state.deck] ?? 4); // 24 starts at the nine, 36 at the six
const ranks = () => { const r = []; for (let i = 12; i >= firstRank(); i--) r.push(i); return r; }; // high to low
const id = (r, s) => r + '-' + s;
const suitOrder = () => (state.trump === null ? [0, 1, 2, 3] : [state.trump, ...[0, 1, 2, 3].filter((s) => s !== state.trump)]);

function save() { prefs.set('cards', state); }

function counts() {
  let gone = 0, mine = 0, total = 0;
  const perSuit = [0, 0, 0, 0];
  for (const s of [0, 1, 2, 3]) for (const r of ranks()) {
    total++;
    const m = state.marks[id(r, s)];
    if (m === 'gone') gone++;
    else if (m === 'mine') mine++;
    else perSuit[s]++;
  }
  return { gone, mine, unknown: total - gone - mine, perSuit, total };
}

function render() {
  // setup controls
  $$('[data-deck]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.deck === state.deck)));
  $$('[data-trump]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.trump === '' ? null : +b.dataset.trump) === state.trump)));
  $$('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  document.body.dataset.cdMode = state.mode;

  const c = counts();
  $('#cdUnknown').textContent = c.unknown;
  $('#cdGone').textContent = c.gone;
  $('#cdMine').textContent = c.mine;
  $('#cdBar').style.setProperty('--gone', (c.gone / c.total * 100) + '%');
  $('#cdBar').style.setProperty('--mine', (c.mine / c.total * 100) + '%');

  const grid = $('#cdGrid');
  grid.dataset.deck = state.deck;
  grid.innerHTML = '';
  for (const s of suitOrder()) {
    const row = document.createElement('div');
    row.className = 'cd-row' + (s === state.trump ? ' trump' : '') + (RED(s) ? ' red' : '');
    row.innerHTML = `<div class="cd-suit"><span class="sym" aria-hidden="true">${SUIT_SYM[s]}</span><span class="nm">${SUIT_NAMES[s]}${s === state.trump ? ' · ' + T.cd_trump : ''}</span><span class="left">${T.cd_left.replace('{n}', c.perSuit[s])}</span></div><div class="cd-cards"></div>`;
    const box = $('.cd-cards', row);
    for (const r of ranks()) {
      const m = state.marks[id(r, s)] || 'in';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cd-card ' + m + (selected.has(id(r, s)) ? ' sel' : '');
      b.dataset.card = id(r, s);
      b.setAttribute('aria-label', `${RANK_NAMES[r] || RANKS[r]} ${SUIT_NAMES[s]} — ${T['cd_state_' + m]}`);
      b.setAttribute('aria-pressed', String(m !== 'in'));
      b.innerHTML = `<span class="rk">${RANKS[r]}</span><span class="st" aria-hidden="true">${SUIT_SYM[s]}</span>`;
      box.appendChild(b);
    }
    grid.appendChild(row);
  }
  renderWatch();
  const pile = $('#cdPile');
  pile.hidden = state.mode !== 'pile';
  const send = $('#cdPileSend');
  send.textContent = T.cd_pile_send.replace('{n}', selected.size);
  send.disabled = selected.size === 0;
}

function renderWatch() {
  const unknown = (r, s) => !state.marks[id(r, s)];
  const chip = (r, s) => `<span class="chip${RED(s) ? ' red' : ''}">${RANKS[r]}${SUIT_SYM[s]}</span>`;
  const rows = [];
  if (state.trump !== null) {
    const top = ranks().filter((r) => unknown(r, state.trump)).slice(0, 5);
    rows.push(`<div><span class="lbl">${T.cd_top_trumps}</span>${top.length ? top.map((r) => chip(r, state.trump)).join('') : `<span class="muted">${T.cd_none}</span>`}</div>`);
  }
  const aces = [0, 1, 2, 3].filter((s) => s !== state.trump && unknown(12, s));
  rows.push(`<div><span class="lbl">${T.cd_aces}</span>${aces.length ? aces.map((s) => chip(12, s)).join('') : `<span class="muted">${T.cd_none}</span>`}</div>`);
  const tens = [0, 1, 2, 3].filter((s) => s !== state.trump && unknown(8, s));
  rows.push(`<div><span class="lbl">${T.cd_tens}</span>${tens.length ? tens.map((s) => chip(8, s)).join('') : `<span class="muted">${T.cd_none}</span>`}</div>`);
  $('#cdWatch').innerHTML = rows.join('');
}

function toggleSelect(cardId) {
  if (state.marks[cardId] === 'gone') { setMarkTo(cardId, null); return; }
  if (selected.has(cardId)) selected.delete(cardId); else selected.add(cardId);
  render();
  $(`[data-card="${cardId}"]`)?.focus({ preventScroll: true });
}
function setMarkTo(cardId, next) {
  history.push({ cardId, before: state.marks[cardId] || null });
  if (next) state.marks[cardId] = next; else delete state.marks[cardId];
  save(); render();
}

function setMark(cardId) {
  const before = state.marks[cardId] || null;
  const next = before === state.mode ? null : state.mode;
  history.push({ cardId, before });
  if (history.length > 300) history.shift();
  if (next) state.marks[cardId] = next; else delete state.marks[cardId];
  save();
  sound(next === 'gone' ? 'capture' : 'move');
  render();
  const btn = $(`[data-card="${cardId}"]`);
  if (btn) btn.focus({ preventScroll: true });
}

$('#cdGrid').addEventListener('click', (e) => {
  const b = e.target.closest('.cd-card');
  if (!b) return;
  if (state.mode === 'pile') toggleSelect(b.dataset.card);
  else setMark(b.dataset.card);
});
$$('[data-deck]').forEach((b) => b.addEventListener('click', () => {
  if (state.deck === +b.dataset.deck) return;
  state.deck = +b.dataset.deck;
  // drop marks on ranks that are not in the smaller deck
  for (const k of Object.keys(state.marks)) if (+k.split('-')[0] < firstRank()) delete state.marks[k];
  history = []; save(); render();
}));
$$('[data-trump]').forEach((b) => b.addEventListener('click', () => {
  state.trump = b.dataset.trump === '' ? null : +b.dataset.trump;
  save(); render();
}));
$$('[data-mode]').forEach((b) => b.addEventListener('click', () => { state.mode = b.dataset.mode; if (state.mode !== 'pile') selected.clear(); save(); render(); }));
$('#cdPileSend').addEventListener('click', () => {
  if (!selected.size) return;
  const batch = [...selected].map((cardId) => ({ cardId, before: state.marks[cardId] || null }));
  history.push({ batch });
  for (const c of selected) state.marks[c] = 'gone';
  selected.clear();
  save(); sound('capture'); render();
});
$('#cdPileCancel').addEventListener('click', () => { selected.clear(); render(); });
$('#cdUndo').addEventListener('click', () => {
  const h = history.pop();
  if (!h) return;
  for (const x of (h.batch || [h])) { if (x.before) state.marks[x.cardId] = x.before; else delete state.marks[x.cardId]; }
  save(); render();
});
const resetBtn = $('#cdReset');
resetBtn.addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    resetBtn.textContent = T.cd_reset_confirm;
    resetBtn.classList.add('armed');
    setTimeout(() => { resetArmed = false; resetBtn.textContent = T.cd_reset; resetBtn.classList.remove('armed'); }, 3500);
    return;
  }
  resetArmed = false;
  resetBtn.textContent = T.cd_reset;
  resetBtn.classList.remove('armed');
  state.marks = {}; history = []; selected.clear(); save(); render();
  sound('end');
});

render();
