// Card memory trainer: (1) remember a set of cards and find them again,
// (2) watch cards leave the game like in Durak and answer what is gone and what is still in play.
import { T, $, $$, prefs, sound } from './common.js';

const SUIT = ['♠', '♣', '♦', '♥'];
const RANKS = (T.cd_ranks || '2,3,4,5,6,7,8,9,10,J,Q,K,A').split(',');
const SUIT_NAMES = (T.cd_suits || 'spades,clubs,diamonds,hearts').split(',');
const SPEED = { slow: 2.2, normal: 1.4, fast: 0.8 };
const tpl = (s, o) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
const red = (s) => s >= 2;
const parse = (c) => c.split('-').map(Number);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const st = {
  ex: prefs.get('mem-ex', 'flash'),
  deck: prefs.get('mem-deck', 36),
  speed: prefs.get('mem-speed', 'normal'),
  level: prefs.get('mem-level', { flash: 3, stream: 1 }),
  best: prefs.get('mem-best', { flash: 3, stream: 1 }),
  streak: 0, round: null, timer: null,
};
const save = () => { prefs.set('mem-level', st.level); prefs.set('mem-best', st.best); };
const ranks = () => { const r = []; for (let i = st.deck === 36 ? 4 : 0; i <= 12; i++) r.push(i); return r; };
const fullDeck = () => { const d = []; for (const s of [0, 1, 2, 3]) for (const r of ranks()) d.push(r + '-' + s); return d; };

function cardEl(c, cls = '') {
  const [r, s] = parse(c);
  const el = document.createElement('div');
  el.className = 'mem-card ' + (red(s) ? 'red ' : '') + cls;
  el.innerHTML = `<span class="r">${RANKS[r]}</span><span class="s">${SUIT[s]}</span>`;
  el.setAttribute('aria-label', `${RANKS[r]} ${SUIT_NAMES[s]}`);
  return el;
}
function back() { const el = document.createElement('div'); el.className = 'mem-card back'; el.setAttribute('aria-hidden', 'true'); return el; }
const label = (c) => { const [r, s] = parse(c); return RANKS[r] + SUIT[s]; };

function stats() {
  $('#memStats').textContent = tpl(T.mem_stats, { level: st.level[st.ex], best: st.best[st.ex], streak: st.streak });
}
function result(text, cls = '') { const el = $('#memResult'); el.textContent = text; el.className = 'mem-result ' + cls; }
function stopTimer() { clearInterval(st.timer); st.timer = null; $('#memTimer').hidden = true; }
function runTimer(sec, done) {
  stopTimer();
  const bar = $('#memTimer'); const fill = $('span', bar);
  bar.hidden = false;
  const t0 = performance.now();
  st.timer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
    fill.style.width = (100 - k * 100) + '%';
    if (k >= 1) { stopTimer(); done(); }
  }, 50);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// grid of all cards to pick from
function pickGrid(cards, max, onChange) {
  const grid = $('#memPick');
  grid.innerHTML = ''; grid.hidden = false;
  grid.dataset.deck = st.deck;
  const chosen = new Set();
  const bySuit = [0, 1, 2, 3].map((s) => cards.filter((c) => parse(c)[1] === s)).filter((x) => x.length);
  for (const list of bySuit) {
    const row = document.createElement('div'); row.className = 'mem-row';
    for (const c of list) {
      const [r, s] = parse(c);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mem-pick-card' + (red(s) ? ' red' : ''); b.dataset.card = c;
      b.innerHTML = `<span class="r">${RANKS[r]}</span><span class="s">${SUIT[s]}</span>`;
      b.setAttribute('aria-pressed', 'false');
      b.onclick = () => {
        if (st.round?.checked) return;
        if (chosen.has(c)) chosen.delete(c); else if (chosen.size < max) chosen.add(c);
        b.setAttribute('aria-pressed', String(chosen.has(c)));
        b.classList.toggle('sel', chosen.has(c));
        onChange(chosen);
      };
      row.appendChild(b);
    }
    grid.appendChild(row);
  }
  return chosen;
}
function markGrid(right, chosen) {
  $$('#memPick .mem-pick-card').forEach((b) => {
    const c = b.dataset.card;
    if (right.has(c) && chosen.has(c)) b.classList.add('ok');
    else if (right.has(c)) b.classList.add('miss');
    else if (chosen.has(c)) b.classList.add('bad');
  });
}
function levelUp(ok, partial) {
  const ex = st.ex;
  if (ok) { st.level[ex] = Math.min(ex === 'flash' ? 14 : 10, st.level[ex] + 1); st.streak++; sound('check'); }
  else if (!partial) { st.level[ex] = Math.max(ex === 'flash' ? 2 : 1, st.level[ex] - 1); st.streak = 0; sound('end'); }
  else st.streak = 0;
  st.best[ex] = Math.max(st.best[ex], st.level[ex]);
  save(); stats();
}

// ---------- exercise 1: remember the cards ----------
function startFlash() {
  const n = st.level.flash;
  const cards = shuffle(fullDeck()).slice(0, n);
  st.round = { cards, checked: false };
  const stage = $('#memStage'); stage.innerHTML = '';
  $('#memQ').hidden = true; $('#memPick').hidden = true; $('#memCheck').hidden = true;
  result(tpl(T.mem_flash_look, { n }));
  cards.forEach((c, i) => { const el = cardEl(c, 'deal'); el.style.animationDelay = (i * 60) + 'ms'; stage.appendChild(el); });
  runTimer(n * SPEED[st.speed] + 1, () => {
    stage.innerHTML = ''; cards.forEach(() => stage.appendChild(back()));
    result(tpl(T.mem_flash_pick, { n }));
    const check = $('#memCheck'); check.hidden = false; check.disabled = true;
    const chosen = pickGrid(fullDeck(), n, (set) => { check.disabled = set.size !== n; });
    check.onclick = () => {
      if (st.round.checked) return;
      st.round.checked = true; check.hidden = true;
      const right = new Set(cards);
      const good = [...chosen].filter((c) => right.has(c)).length;
      markGrid(right, chosen);
      stage.innerHTML = ''; cards.forEach((c) => stage.appendChild(cardEl(c, chosen.has(c) ? 'ok' : 'miss')));
      const ok = good === n;
      result(ok ? tpl(T.mem_all_right, { n }) : tpl(T.mem_some_right, { good, n }), ok ? 'good' : 'bad');
      levelUp(ok, good >= n / 2);
      $('#memStart').textContent = T.mem_next;
    };
  });
}

// ---------- exercise 2: what has left the game (Durak) ----------
async function startStream() {
  const lv = st.level.stream;
  const deck = shuffle(fullDeck());
  const trump = Math.floor(Math.random() * 4);
  const count = Math.min(deck.length - 6, 6 + lv * 3);
  const gone = deck.slice(0, count);
  st.round = { gone, trump, checked: false };
  const stage = $('#memStage'); stage.innerHTML = '';
  $('#memQ').hidden = true; $('#memPick').hidden = true; $('#memCheck').hidden = true;
  $('#memStart').disabled = true;
  const chip = document.createElement('div'); chip.className = 'mem-trump' + (red(trump) ? ' red' : '');
  chip.textContent = tpl(T.mem_trump, { s: SUIT[trump], name: SUIT_NAMES[trump] });
  stage.appendChild(chip);
  const slot = document.createElement('div'); slot.className = 'mem-slot'; stage.appendChild(slot);
  const cnt = document.createElement('div'); cnt.className = 'mem-count muted'; stage.appendChild(cnt);
  result(T.mem_stream_watch);
  const per = SPEED[st.speed] * 700;
  for (let i = 0; i < gone.length; i++) {
    if (st.round?.gone !== gone) return; // a new round was started
    slot.innerHTML = ''; slot.appendChild(cardEl(gone[i], 'deal'));
    cnt.textContent = tpl(T.mem_gone_n, { n: i + 1, t: gone.length });
    sound('move');
    await wait(per);
  }
  slot.innerHTML = ''; slot.appendChild(back());
  $('#memStart').disabled = false;
  ask();
}
function ask() {
  const { gone, trump } = st.round;
  const q = $('#memQ'); q.hidden = false; q.innerHTML = '';
  const goneSet = new Set(gone);
  const kinds = ['trumpsLeft', 'countTrumps', 'yesno'];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const p = document.createElement('p'); p.className = 'mem-question';
  q.appendChild(p);
  const finish = (ok, partial, text) => {
    st.round.checked = true;
    result(text, ok ? 'good' : 'bad');
    levelUp(ok, partial);
    const rev = document.createElement('div'); rev.className = 'mem-review';
    rev.innerHTML = `<p class="muted">${T.mem_review}</p>`;
    const line = document.createElement('div'); line.className = 'mem-line';
    gone.forEach((c) => line.appendChild(cardEl(c, 'mini' + (parse(c)[1] === trump ? ' trump' : ''))));
    rev.appendChild(line); q.appendChild(rev);
    $('#memStart').textContent = T.mem_next;
  };
  if (kind === 'trumpsLeft') {
    const trumps = fullDeck().filter((c) => parse(c)[1] === trump);
    const left = new Set(trumps.filter((c) => !goneSet.has(c)));
    p.textContent = tpl(T.mem_q_trumps_left, { s: SUIT[trump] });
    const check = $('#memCheck'); check.hidden = false; check.disabled = false;
    const chosen = pickGrid(trumps, trumps.length, () => {});
    check.onclick = () => {
      if (st.round.checked) return;
      check.hidden = true;
      markGrid(left, chosen);
      const ok = left.size === chosen.size && [...left].every((c) => chosen.has(c));
      const good = [...chosen].filter((c) => left.has(c)).length;
      finish(ok, good >= left.size / 2 && chosen.size <= left.size + 1, ok ? T.mem_right : tpl(T.mem_left_was, { list: [...left].map(label).join(' ') || '—' }));
    };
  } else if (kind === 'countTrumps') {
    const n = gone.filter((c) => parse(c)[1] === trump).length;
    p.textContent = tpl(T.mem_q_count, { s: SUIT[trump] });
    const row = document.createElement('div'); row.className = 'mem-nums';
    const max = Math.min(9, ranks().length);
    for (let i = 0; i <= max; i++) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.textContent = i;
      b.onclick = () => {
        if (st.round.checked) return;
        b.classList.add(i === n ? 'ok' : 'bad');
        if (i !== n) row.children[n]?.classList.add('ok');
        finish(i === n, Math.abs(i - n) === 1, i === n ? T.mem_right : tpl(T.mem_count_was, { n }));
      };
      row.appendChild(b);
    }
    q.appendChild(row);
  } else {
    // three yes/no questions about single cards
    const ask3 = shuffle([...shuffle(gone.slice()).slice(0, 2), ...shuffle(fullDeck().filter((c) => !goneSet.has(c))).slice(0, 2)]).slice(0, 3);
    let idx = 0, good = 0;
    const box = document.createElement('div'); box.className = 'mem-yn'; q.appendChild(box);
    const next = () => {
      if (idx >= ask3.length) { finish(good === ask3.length, good >= 2, good === ask3.length ? T.mem_right : tpl(T.mem_some_right, { good, n: ask3.length })); return; }
      const c = ask3[idx];
      p.textContent = tpl(T.mem_q_was, { card: label(c) });
      box.innerHTML = '';
      box.appendChild(cardEl(c));
      for (const [txt, val] of [[T.mem_yes, true], [T.mem_no, false]]) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.textContent = txt;
        b.onclick = async () => {
          const right = goneSet.has(c) === val;
          if (right) good++;
          b.classList.add(right ? 'ok' : 'bad');
          await wait(450); idx++; next();
        };
        box.appendChild(b);
      }
    };
    next();
  }
}

// ---------- controls ----------
function start() {
  stopTimer();
  $('#memStart').textContent = T.mem_again;
  result('');
  if (st.ex === 'flash') startFlash(); else startStream();
}
function setEx(ex) {
  st.ex = ex; prefs.set('mem-ex', ex); st.round = null; stopTimer();
  $$('[data-ex]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ex === ex)));
  $('#memStage').innerHTML = `<p class="muted mem-intro">${ex === 'flash' ? T.mem_intro_flash : T.mem_intro_stream}</p>`;
  $('#memQ').hidden = true; $('#memPick').hidden = true; $('#memCheck').hidden = true;
  $('#memStart').textContent = T.mem_start; $('#memStart').disabled = false;
  result(''); stats();
}
$$('[data-ex]').forEach((b) => b.addEventListener('click', () => setEx(b.dataset.ex)));
$$('[data-mdeck]').forEach((b) => {
  b.setAttribute('aria-pressed', String(+b.dataset.mdeck === st.deck));
  b.addEventListener('click', () => { st.deck = +b.dataset.mdeck; prefs.set('mem-deck', st.deck); $$('[data-mdeck]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); setEx(st.ex); });
});
$$('[data-speed]').forEach((b) => {
  b.setAttribute('aria-pressed', String(b.dataset.speed === st.speed));
  b.addEventListener('click', () => { st.speed = b.dataset.speed; prefs.set('mem-speed', st.speed); $$('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
});
$('#memStart').addEventListener('click', start);
$('#memReset')?.addEventListener('click', () => { st.level = { flash: 3, stream: 1 }; st.streak = 0; save(); stats(); });
setEx(st.ex);
