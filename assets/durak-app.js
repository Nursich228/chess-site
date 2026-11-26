import * as D from './durak-engine.js';
import { T, $, $$, sound, toast, prefs } from './common.js';

const LANG = document.documentElement.lang || 'en';
const S = {
  ru: { your_attack: 'Ваш ход: положите карту', your_throw: 'Подкиньте карту или нажмите «Бито»', your_defend: 'Отбивайтесь, переведите или возьмите', your_give: 'Подкиньте ещё или нажмите «Пусть берёт»',
    cpu: 'Компьютер думает…', cpu_attacks: 'Компьютер ходит', cpu_beat: 'Компьютер отбился', cpu_threw: 'Компьютер подкинул', cpu_transfer: 'Компьютер перевёл на вас!', cpu_take: 'Компьютер берёт карты',
    you_transfer: 'Вы перевели ход на компьютер', bito: 'Бито', you_took: 'Вы взяли карты', cpu_took: 'Компьютер взял карты',
    win: 'Вы выиграли! Дураком остался компьютер', lose: 'Вы остались в дураках', draw: 'Ничья: карты кончились у обоих',
    take: 'Беру', done: 'Бито', give: 'Пусть берёт', transfer: 'Перевести',
    bad_throw: 'Подкидывать можно только карты того же достоинства, что уже на столе', bad_limit: 'Больше карт подкинуть нельзя', bad_beat: 'Этой картой не побить ни одну карту', not_turn: 'Сейчас ход компьютера',
    pick_target: 'Выберите, какую карту побить', deck: 'Колода', out: 'Бито', cpu_name: 'Компьютер', you: 'Вы', trump: 'Козырь', none_out: 'Пока ничего не вышло', first_you: 'У вас младший козырь — вы ходите первым', first_cpu: 'У компьютера младший козырь — он ходит первым' },
  en: { your_attack: 'Your turn: lead a card', your_throw: 'Add a card or press “Done”', your_defend: 'Beat the cards, transfer or take them', your_give: 'Add more cards or press “Let him take”',
    cpu: 'Computer is thinking…', cpu_attacks: 'The computer leads', cpu_beat: 'The computer beat your card', cpu_threw: 'The computer added a card', cpu_transfer: 'The computer transferred the attack to you!', cpu_take: 'The computer takes the cards',
    you_transfer: 'You transferred the attack to the computer', bito: 'Discarded', you_took: 'You took the cards', cpu_took: 'The computer took the cards',
    win: 'You win! The computer is the durak', lose: 'You are the durak', draw: 'Draw: both ran out of cards',
    take: 'Take', done: 'Done', give: 'Let him take', transfer: 'Transfer',
    bad_throw: 'You can only add cards of a rank already on the table', bad_limit: 'No more cards can be added', bad_beat: 'This card cannot beat any card on the table', not_turn: 'It is the computer’s turn',
    pick_target: 'Choose which card to beat', deck: 'Deck', out: 'Discard', cpu_name: 'Computer', you: 'You', trump: 'Trump', none_out: 'Nothing discarded yet', first_you: 'You hold the lowest trump, so you lead first', first_cpu: 'The computer holds the lowest trump, so it leads first' },
  es: { your_attack: 'Tu turno: juega una carta', your_throw: 'Añade una carta o pulsa «Descartar»', your_defend: 'Defiéndete, transfiere o recoge', your_give: 'Añade más cartas o pulsa «Que recoja»',
    cpu: 'La computadora está pensando…', cpu_attacks: 'La computadora ataca', cpu_beat: 'La computadora se defendió', cpu_threw: 'La computadora añadió una carta', cpu_transfer: '¡La computadora te transfirió el ataque!', cpu_take: 'La computadora recoge las cartas',
    you_transfer: 'Transferiste el ataque a la computadora', bito: 'Descartadas', you_took: 'Recogiste las cartas', cpu_took: 'La computadora recogió las cartas',
    win: '¡Has ganado! La computadora es el durak', lose: 'Te has quedado de durak', draw: 'Empate: los dos se quedaron sin cartas',
    take: 'Recoger', done: 'Descartar', give: 'Que recoja', transfer: 'Transferir',
    bad_throw: 'Solo puedes añadir cartas del mismo valor que las de la mesa', bad_limit: 'Ya no se pueden añadir más cartas', bad_beat: 'Esta carta no gana a ninguna de la mesa', not_turn: 'Es el turno de la computadora',
    pick_target: 'Elige qué carta cubrir', deck: 'Mazo', out: 'Descarte', cpu_name: 'Computadora', you: 'Tú', trump: 'Triunfo', none_out: 'Aún no hay descartes', first_you: 'Tienes el triunfo más bajo: empiezas tú', first_cpu: 'La computadora tiene el triunfo más bajo: empieza ella' },
  fr: { your_attack: 'À vous : posez une carte', your_throw: 'Ajoutez une carte ou appuyez sur « Défaussé »', your_defend: 'Couvrez, transférez ou ramassez', your_give: 'Ajoutez des cartes ou appuyez sur « Qu’il ramasse »',
    cpu: "L'ordinateur réfléchit…", cpu_attacks: "L'ordinateur attaque", cpu_beat: "L'ordinateur s'est défendu", cpu_threw: "L'ordinateur a ajouté une carte", cpu_transfer: "L'ordinateur vous a transféré l'attaque !", cpu_take: "L'ordinateur ramasse les cartes",
    you_transfer: "Vous avez transféré l'attaque à l'ordinateur", bito: 'Défaussé', you_took: 'Vous avez ramassé les cartes', cpu_took: "L'ordinateur a ramassé les cartes",
    win: "Vous avez gagné ! L'ordinateur est le durak", lose: 'Vous êtes le durak', draw: 'Égalité : plus de cartes des deux côtés',
    take: 'Ramasser', done: 'Défaussé', give: 'Qu’il ramasse', transfer: 'Transférer',
    bad_throw: 'On ne peut ajouter que des cartes de même valeur que celles sur la table', bad_limit: 'Impossible d’ajouter plus de cartes', bad_beat: 'Cette carte ne couvre aucune carte de la table', not_turn: "C'est au tour de l'ordinateur",
    pick_target: 'Choisissez la carte à couvrir', deck: 'Pioche', out: 'Défausse', cpu_name: 'Ordinateur', you: 'Vous', trump: 'Atout', none_out: 'Rien de défaussé pour le moment', first_you: 'Vous avez le plus petit atout : vous commencez', first_cpu: "L'ordinateur a le plus petit atout : il commence" },
  de: { your_attack: 'Du bist dran: Lege eine Karte', your_throw: 'Lege eine Karte nach oder tippe auf „Abgelegt“', your_defend: 'Stich, schieb weiter oder nimm auf', your_give: 'Lege nach oder tippe auf „Soll nehmen“',
    cpu: 'Der Computer denkt nach…', cpu_attacks: 'Der Computer greift an', cpu_beat: 'Der Computer hat gestochen', cpu_threw: 'Der Computer hat nachgelegt', cpu_transfer: 'Der Computer hat den Angriff an dich weitergeschoben!', cpu_take: 'Der Computer nimmt die Karten',
    you_transfer: 'Du hast den Angriff an den Computer weitergeschoben', bito: 'Abgelegt', you_took: 'Du hast die Karten genommen', cpu_took: 'Der Computer hat die Karten genommen',
    win: 'Du hast gewonnen! Der Computer ist der Durak', lose: 'Du bist der Durak', draw: 'Unentschieden: beide haben keine Karten mehr',
    take: 'Nehmen', done: 'Abgelegt', give: 'Soll nehmen', transfer: 'Weiterschieben',
    bad_throw: 'Nachlegen darf man nur Karten mit einem Wert, der schon auf dem Tisch liegt', bad_limit: 'Es dürfen keine Karten mehr nachgelegt werden', bad_beat: 'Mit dieser Karte kann man keine Karte stechen', not_turn: 'Der Computer ist dran',
    pick_target: 'Wähle, welche Karte du stechen willst', deck: 'Stapel', out: 'Abgelegt', cpu_name: 'Computer', you: 'Du', trump: 'Trumpf', none_out: 'Noch nichts abgelegt', first_you: 'Du hast den niedrigsten Trumpf und spielst zuerst aus', first_cpu: 'Der Computer hat den niedrigsten Trumpf und spielt zuerst aus' },
}[LANG] || {};

const RANKS = (T.cd_ranks || '2,3,4,5,6,7,8,9,10,J,Q,K,A').split(',').slice(4);
const cardHtml = (c, cls = '', attrs = '') => {
  const su = D.suitOf(c);
  return `<span class="mem-card dk-c${su >= 2 ? ' red' : ''}${cls ? ' ' + cls : ''}" ${attrs}><span class="r">${RANKS[D.rankOf(c)]}</span><span class="s">${D.SUITS[su]}</span></span>`;
};

let g = null, level = prefs.get('dkLevel', 2), sel = null, busy = false, msg = '';
const score = prefs.get('dkScore', { w: 0, l: 0, d: 0 });

function sortHand(h) {
  const tr = g.trump;
  const key = (c) => (D.suitOf(c) === tr ? 100 : D.suitOf(c) * 10) + D.rankOf(c);
  return h.slice().sort((a, b) => key(a) - key(b));
}

function render() {
  // opponent
  const opp = g.hands[1].length;
  $('#oppHand').innerHTML = Array.from({ length: opp }, () => '<span class="mem-card back dk-c"></span>').join('');
  $('#oppCount').textContent = opp;
  fan($('#oppHand'));
  // deck & trump
  $('#deckCount').textContent = g.deck.length;
  $('#trumpCard').innerHTML = g.deck.length ? cardHtml(g.trumpCard) : `<span class="dk-suit${g.trump >= 2 ? ' red' : ''}" title="${S.trump}">${D.SUITS[g.trump]}</span>`;
  $('#deckPile').hidden = g.deck.length <= 1;
  $('#outCount').textContent = g.discard.length;
  $('#outBox').hidden = !g.discard.length;
  // table
  const targets = sel !== null ? D.legal(g, 0).filter((m) => m.type === 'beat' && m.card === sel).map((m) => m.target) : [];
  $('#table').innerHTML = g.table.map((p, i) => `<div class="dk-pair${targets.includes(i) ? ' target' : ''}" data-i="${i}">${cardHtml(p.a, 'a')}${p.d !== null ? cardHtml(p.d, 'd') : ''}</div>`).join('');
  $$('#table .dk-pair').forEach((el) => { el.onclick = () => clickTable(+el.dataset.i); });
  // my hand
  const myTurn = D.toAct(g) === 0 && !busy;
  const playable = new Set(myTurn ? D.legal(g, 0).filter((m) => m.card !== undefined).map((m) => m.card) : []);
  $('#myHand').innerHTML = sortHand(g.hands[0]).map((c) => cardHtml(c, (playable.has(c) ? 'can' : '') + (c === sel ? ' sel' : '') + (D.suitOf(c) === g.trump ? ' trump' : ''), `data-c="${c}" role="button" tabindex="0"`)).join('');
  $$('#myHand .dk-c').forEach((el) => {
    el.onclick = () => clickCard(+el.dataset.c);
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickCard(+el.dataset.c); } };
  });
  fan($('#myHand'));
  // buttons
  const L = myTurn ? D.legal(g, 0) : [];
  const take = $('#btnTake'), done = $('#btnDone'), tr = $('#btnTransfer');
  take.hidden = !L.some((m) => m.type === 'take');
  done.hidden = !L.some((m) => m.type === 'done');
  done.textContent = g.taking ? S.give : S.done;
  tr.hidden = !(sel !== null && L.some((m) => m.type === 'transfer' && m.card === sel));
  // status
  const st = $('#playStatus');
  if (g.over) {
    st.textContent = g.loser === -1 ? S.draw : g.loser === 1 ? S.win : S.lose;
  } else if (busy || D.toAct(g) === 1) st.textContent = S.cpu;
  else if (g.attacker === 0) st.textContent = !g.table.length ? S.your_attack : g.taking ? S.your_give : S.your_throw;
  else st.textContent = sel !== null ? S.pick_target : S.your_defend;
  $('#dkMsg').textContent = msg;
  $('#score').innerHTML = `${S.you} <b>${score.w}</b> : <b>${score.l}</b> ${S.cpu_name}`;
  $('#outCards').innerHTML = g.discard.length ? sortHand(g.discard).map((c) => cardHtml(c, 'mini')).join('') : `<p class="muted">${S.none_out}</p>`;
}

// overlap cards so that a hand always fits its row
function fan(el) {
  const n = el.children.length;
  if (!n) return;
  const w = el.clientWidth, cw = el.children[0].getBoundingClientRect().width || 64;
  const gap = n > 1 ? Math.min(6, (w - cw) / (n - 1) - cw) : 0;
  el.style.setProperty('--ov', Math.min(6, gap) + 'px');
}

function boutNote(before) {
  if (!g.boutEnd || g.boutEnd === before) return '';
  const b = g.boutEnd;
  return b.taken ? (b.defender === 0 ? S.you_took : S.cpu_took) : S.bito;
}

function doAct(p, a) {
  const before = g.boutEnd;
  D.act(g, p, a);
  sound(a.type === 'take' || a.type === 'done' ? 'capture' : 'move');
  const note = boutNote(before);
  if (p === 1) {
    msg = { attack: g.table.length > 1 ? S.cpu_threw : S.cpu_attacks, beat: S.cpu_beat, transfer: S.cpu_transfer, take: S.cpu_take, done: '' }[a.type] || '';
    if (a.type === 'attack' && !note && g.table.length === 1) msg = S.cpu_attacks;
  } else msg = a.type === 'transfer' ? S.you_transfer : '';
  if (note) msg = note;
  sel = null;
  if (g.over) finish();
  render();
  next();
}

function finish() {
  if (g.loser === 1) score.w++; else if (g.loser === 0) score.l++; else score.d++;
  prefs.set('dkScore', score);
  sound('end');
}

function next() {
  if (g.over || D.toAct(g) !== 1) return;
  busy = true; render();
  setTimeout(() => {
    busy = false;
    const a = D.botAction(g, 1, level);
    if (a) doAct(1, a);
  }, 650);
}

function clickCard(c) {
  if (g.over) return;
  if (busy || D.toAct(g) !== 0) { toast(S.not_turn); return; }
  const acts = D.legal(g, 0).filter((m) => m.card === c);
  if (g.attacker === 0) {
    const a = acts.find((m) => m.type === 'attack');
    if (a) doAct(0, a);
    else toast(g.table.length >= g.limit ? S.bad_limit : S.bad_throw);
    return;
  }
  const beats = acts.filter((m) => m.type === 'beat');
  const tr = acts.find((m) => m.type === 'transfer');
  if (!beats.length && !tr) { toast(S.bad_beat); sel = null; render(); return; }
  if (beats.length === 1 && !tr) { doAct(0, beats[0]); return; }
  if (!beats.length && tr) { doAct(0, tr); return; }
  sel = sel === c ? null : c;
  render();
}

function clickTable(i) {
  if (sel === null) return;
  const a = D.legal(g, 0).find((m) => m.type === 'beat' && m.card === sel && m.target === i);
  if (a) doAct(0, a);
}

$('#btnTake').textContent = S.take;
$('#btnTransfer').textContent = S.transfer;
$('#btnTake').onclick = () => { if (!busy && D.toAct(g) === 0) doAct(0, { type: 'take' }); };
$('#btnDone').onclick = () => { if (!busy && D.toAct(g) === 0) doAct(0, { type: 'done' }); };
$('#btnTransfer').onclick = () => { if (sel !== null) doAct(0, { type: 'transfer', card: sel }); };

function newGame() {
  g = D.newGame();
  sel = null; busy = false;
  msg = g.attacker === 0 ? S.first_you : S.first_cpu;
  render();
  next();
}
$('#newGame').onclick = newGame;
$$('[data-level]').forEach((b) => {
  b.classList.toggle('on', +b.dataset.level === level);
  b.onclick = () => { level = +b.dataset.level; prefs.set('dkLevel', level); $$('[data-level]').forEach((x) => x.classList.toggle('on', x === b)); };
});
window.addEventListener('resize', () => { if (g) { fan($('#myHand')); fan($('#oppHand')); } });
newGame();
