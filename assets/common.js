// Shared UI: theme, board style, sound, language menu, feedback form, toasts.
export const T = window.T || {};
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const store = {
  get(k, d) { try { const v = localStorage.getItem('cpt-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cpt-' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
export const prefs = store;

// ---- theme & board colours ----
function applyTheme() {
  const t = store.get('theme', 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  document.documentElement.setAttribute('data-board', store.get('board', 'slate'));
}
applyTheme();

// ---- sound ----
let actx = null;
export function sound(kind = 'move') {
  if (!store.get('sound', true)) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    const f = { move: 520, capture: 330, check: 760, end: 220 }[kind] || 520;
    o.type = kind === 'capture' ? 'triangle' : 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, actx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (kind === 'end' ? 0.5 : 0.12));
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + 0.55);
  } catch { /* audio not available */ }
}

// ---- toast ----
export function toast(msg, ms = 2600) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(T.copied || 'Copied'); }
  catch { prompt('', text); }
}

// ---- header menus ----
function initMenus() {
  const navBtn = $('#navToggle');
  if (navBtn) navBtn.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    navBtn.setAttribute('aria-expanded', open);
  });
  $$('[data-menu]').forEach((btn) => {
    const menu = $('#' + btn.dataset.menu);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !menu.classList.contains('open');
      $$('.menu.open').forEach((m) => m.classList.remove('open'));
      menu.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open);
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu') || e.target.closest('.menu [data-act]')) $$('.menu.open').forEach((m) => m.classList.remove('open'));
  });
  // settings menu
  const themeSel = $('#setTheme'), boardSel = $('#setBoard'), soundChk = $('#setSound');
  if (themeSel) { themeSel.value = store.get('theme', 'auto'); themeSel.onchange = () => { store.set('theme', themeSel.value); applyTheme(); }; }
  if (boardSel) { boardSel.value = store.get('board', 'slate'); boardSel.onchange = () => { store.set('board', boardSel.value); applyTheme(); }; }
  if (soundChk) { soundChk.checked = store.get('sound', true); soundChk.onchange = () => store.set('sound', soundChk.checked); }
  const largeChk = $('#setLarge');
  if (largeChk) {
    largeChk.checked = store.get('large', false);
    largeChk.onchange = () => {
      store.set('large', largeChk.checked);
      document.documentElement.toggleAttribute('data-large', largeChk.checked);
    };
  }
  // remember chosen language
  $$('.lang-list a').forEach((a) => a.addEventListener('click', () => store.set('lang', a.getAttribute('hreflang'))));
}

// Offer (never force) the visitor's browser language.
function suggestLanguage() {
  const here = document.documentElement.lang;
  if (store.get('lang', null) || store.get('langDismiss', false)) return;
  const want = (navigator.language || '').slice(0, 2);
  const link = $(`.lang-list a[hreflang="${want}"]`);
  if (!link || want === here) return;
  const bar = document.createElement('div');
  bar.className = 'lang-suggest';
  bar.innerHTML = `<a href="${link.href}">${link.dataset.offer}</a><button type="button" aria-label="×">×</button>`;
  bar.querySelector('button').onclick = () => { store.set('langDismiss', true); bar.remove(); };
  document.body.prepend(bar);
}

// ---- feedback form (works on the feedback page and in the floating dialog) ----
const FEEDBACK_ENDPOINT = window.FEEDBACK_ENDPOINT || '';
function initFeedback() {
  const dlg = $('#fbDialog');
  $$('[data-open-feedback]').forEach((b) => b.addEventListener('click', () => dlg && dlg.showModal()));
  $$('.fb-close').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('form.feedback').forEach((form) => {
    const stars = $$('.stars button', form);
    stars.forEach((s, i) => s.addEventListener('click', () => {
      form.rating.value = i + 1;
      stars.forEach((x, j) => x.classList.toggle('on', j <= i));
    }));
    const text = form.message, count = $('.count', form);
    if (text && count) text.addEventListener('input', () => { count.textContent = `${text.value.length} / 2000`; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.message && !data.rating) { toast(T.fb_empty); return; }
      data.page = location.pathname;
      data.lang = document.documentElement.lang;
      data._subject = 'Chess/Checkers feedback: ' + (data.kind || '');
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        const r = await fetch(FEEDBACK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
        if (!r.ok) throw new Error(r.status);
        form.hidden = true;
        $('.fb-thanks', form.parentElement).hidden = false;
      } catch {
        const mail = `mailto:${window.CONTACT_EMAIL}?subject=${encodeURIComponent(data._subject)}&body=${encodeURIComponent((data.rating ? '★' + data.rating + '\n' : '') + (data.message || ''))}`;
        toast(T.fb_error, 5000);
        location.href = mail;
      } finally { btn.disabled = false; }
    });
  });
}

// ---- first-visit tips over the board (shown once) ----
export function onboard() {
  if (store.get('onboarded', false)) return;
  const wrap = $('.board-wrap');
  if (!wrap) return;
  let step = 1;
  const box = document.createElement('div');
  box.className = 'ob';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', T.ob_title);
  wrap.appendChild(box);
  const finish = () => { store.set('onboarded', true); box.remove(); $$('.ob-glow').forEach((x) => x.classList.remove('ob-glow')); };
  const draw = () => {
    $$('.ob-glow').forEach((x) => x.classList.remove('ob-glow'));
    if (step === 3) $('#playBest')?.classList.add('ob-glow');
    if (step === 1) $('[data-act="edit"]')?.classList.add('ob-glow');
    const dots = [1, 2, 3].map((i) => `<span class="${i === step ? 'on' : ''}"></span>`).join('');
    box.innerHTML = `<div class="ob-card"><div class="ob-step">${T.ob_step.replace('{n}', step)}</div><div class="ob-num">${step}</div><p>${T['ob_' + step]}</p><div class="ob-dots">${dots}</div><div class="ob-btns"><button type="button" class="btn ghost ob-skip">${T.ob_skip}</button><button type="button" class="btn ob-next">${step < 3 ? T.ob_next : T.ob_done}</button></div></div>`;
    $('.ob-skip', box).onclick = finish;
    $('.ob-next', box).onclick = () => { if (step < 3) { step++; draw(); } else finish(); };
    $('.ob-next', box).focus({ preventScroll: true });
  };
  draw();
}

initMenus();
initFeedback();
