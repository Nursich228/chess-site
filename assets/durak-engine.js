// Transfer durak (переводной дурак) for two players: rules + computer opponent. No dependencies.
// Cards: 0..35, suit = floor(c / 9) (0 ♠, 1 ♣, 2 ♦, 3 ♥), rank = c % 9 (0 = six … 8 = ace).
// Player 0 is the human, player 1 the computer.

export const suitOf = (c) => Math.floor(c / 9);
export const rankOf = (c) => c % 9;
export const SUITS = '♠♣♦♥';

export function shuffled(rng = Math.random) {
  const d = Array.from({ length: 36 }, (_, i) => i);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

// deck: cards are drawn with pop(); deck[0] is the face-up trump card at the bottom.
export function newGame(rng = Math.random, firstAttacker = null) {
  const deck = shuffled(rng);
  const hands = [[], []];
  for (let k = 0; k < 6; k++) { hands[0].push(deck.pop()); hands[1].push(deck.pop()); }
  const trumpCard = deck[0], trump = suitOf(trumpCard);
  let attacker = firstAttacker;
  if (attacker === null) {
    const low = (h) => Math.min(...h.filter((c) => suitOf(c) === trump).map(rankOf), 99);
    const a = low(hands[0]), b = low(hands[1]);
    attacker = a === b ? (rng() < 0.5 ? 0 : 1) : (a < b ? 0 : 1);
  }
  const g = {
    deck, trump, trumpCard, hands, table: [], discard: [],
    attacker, defender: 1 - attacker, limit: 6, taking: false,
    known: [[], []],             // cards everyone saw going into a player's hand (picked up from the table)
    trumpTo: null,               // who drew the face-up trump
    over: false, loser: null,    // loser: 0, 1, or -1 for a draw
    last: null,                  // last action, for messages
  };
  startBout(g);
  return g;
}

function startBout(g) {
  g.table = []; g.taking = false;
  g.limit = Math.min(6, g.hands[g.defender].length);
}

export const beats = (a, d, trump) =>
  (suitOf(d) === suitOf(a) && rankOf(d) > rankOf(a)) || (suitOf(d) === trump && suitOf(a) !== trump);

const tableRanks = (g) => new Set(g.table.flatMap((p) => (p.d === null ? [rankOf(p.a)] : [rankOf(p.a), rankOf(p.d)])));
const unbeaten = (g) => g.table.map((p, i) => (p.d === null ? i : -1)).filter((i) => i >= 0);

// who has to act now
export function toAct(g) {
  if (g.over) return null;
  if (g.taking || !g.table.length) return g.attacker;
  return unbeaten(g).length ? g.defender : g.attacker;
}

export function canThrow(g, c) {
  if (!g.table.length) return true;
  return g.table.length < g.limit && tableRanks(g).has(rankOf(c));
}

export function canTransfer(g, c) {
  if (g.taking || !g.table.length || g.table.some((p) => p.d !== null)) return false;
  const r = rankOf(g.table[0].a);
  if (rankOf(c) !== r) return false;
  const next = g.attacker; // with two players the attack goes back to the attacker
  return g.hands[next].length >= g.table.length + 1 && g.table.length + 1 <= 6;
}

// all legal actions of player p: {type: 'attack'|'beat'|'transfer'|'take'|'done', card, target}
export function legal(g, p) {
  const out = [];
  if (toAct(g) !== p) return out;
  const hand = g.hands[p];
  if (p === g.attacker) {
    for (const c of hand) if (canThrow(g, c)) out.push({ type: 'attack', card: c });
    if (g.table.length) out.push({ type: 'done' });
  } else {
    const ub = unbeaten(g);
    for (const c of hand) {
      for (const i of ub) if (beats(g.table[i].a, c, g.trump)) out.push({ type: 'beat', card: c, target: i });
      if (canTransfer(g, c)) out.push({ type: 'transfer', card: c });
    }
    out.push({ type: 'take' });
  }
  return out;
}

const removeCard = (h, c) => { const i = h.indexOf(c); if (i < 0) throw new Error('no card ' + c); h.splice(i, 1); };

// apply an action (mutates g). Returns g.
export function act(g, p, a) {
  if (toAct(g) !== p) throw new Error('not your turn');
  g.last = { p, ...a };
  if (a.type === 'attack') {
    if (!canThrow(g, a.card)) throw new Error('cannot throw');
    removeCard(g.hands[p], a.card);
    g.table.push({ a: a.card, d: null });
  } else if (a.type === 'beat') {
    const pair = g.table[a.target];
    if (!pair || pair.d !== null || !beats(pair.a, a.card, g.trump)) throw new Error('cannot beat');
    removeCard(g.hands[p], a.card);
    pair.d = a.card;
  } else if (a.type === 'transfer') {
    if (!canTransfer(g, a.card)) throw new Error('cannot transfer');
    removeCard(g.hands[p], a.card);
    g.table.push({ a: a.card, d: null });
    [g.attacker, g.defender] = [g.defender, g.attacker];
    g.limit = Math.min(6, g.hands[g.defender].length);
  } else if (a.type === 'take') {
    g.taking = true;
  } else if (a.type === 'done') {
    endBout(g, g.taking);
    return g;
  }
  autoEnd(g);
  return g;
}

// end the bout automatically when nothing more can happen
function autoEnd(g) {
  if (g.over || !g.table.length) return;
  const att = g.attacker;
  const nothingToThrow = !g.hands[att].some((c) => canThrow(g, c));
  if (g.taking) { if (nothingToThrow) endBout(g, true); return; }
  if (!unbeaten(g).length && (nothingToThrow || !g.hands[g.defender].length)) endBout(g, false);
}

function endBout(g, taken) {
  const cards = g.table.flatMap((p) => (p.d === null ? [p.a] : [p.a, p.d]));
  if (taken) { g.hands[g.defender].push(...cards); g.known[g.defender].push(...cards); }
  else g.discard.push(...cards);
  g.boutEnd = { taken, cards, defender: g.defender };
  // draw: attacker first, then defender
  for (const p of [g.attacker, g.defender]) {
    while (g.hands[p].length < 6 && g.deck.length) {
      const c = g.deck.pop();
      if (c === g.trumpCard) { g.trumpTo = p; g.known[p].push(c); }
      g.hands[p].push(c);
    }
  }
  // known cards that were played no longer count as known
  for (const p of [0, 1]) g.known[p] = g.known[p].filter((c) => g.hands[p].includes(c));
  if (!g.deck.length) {
    const e0 = !g.hands[0].length, e1 = !g.hands[1].length;
    if (e0 || e1) { g.over = true; g.loser = e0 && e1 ? -1 : (e0 ? 1 : 0); g.table = []; return; }
  }
  if (!taken) [g.attacker, g.defender] = [g.defender, g.attacker];
  startBout(g);
}

// ---------------- computer player ----------------
const val = (c, trump) => rankOf(c) + (suitOf(c) === trump ? 10 : 0);

// cards whose location is unknown to player p
function unknownFor(g, p) {
  const seen = new Set([...g.hands[p], ...g.discard, ...g.table.flatMap((x) => (x.d === null ? [x.a] : [x.a, x.d]))]);
  if (g.deck.length) seen.add(g.trumpCard);
  return Array.from({ length: 36 }, (_, i) => i).filter((c) => !seen.has(c));
}

// level: 1 easy, 2 normal, 3 hard
export function botAction(g, p, level = 2, rng = Math.random) {
  if (level === 2 && rng() < 0.2) level = 1; // the middle level makes small slips
  const moves = legal(g, p);
  if (!moves.length) return null;
  const T = g.trump, hand = g.hands[p], opp = 1 - p;
  const v = (c) => val(c, T);
  const endgame = g.deck.length === 0;
  // what the opponent may hold (hard: exact when the deck is empty)
  const oppMay = level >= 3 ? (endgame ? unknownFor(g, p) : [...new Set([...g.known[opp], ...unknownFor(g, p)])]) : null;
  const oppCanBeat = (c) => !oppMay || oppMay.some((x) => beats(c, x, T));

  if (p === g.attacker) {
    const throws = moves.filter((m) => m.type === 'attack');
    if (!g.table.length) {
      if (level === 1 && rng() < 0.35) return throws[Math.floor(rng() * throws.length)];
      const count = (r) => hand.filter((c) => rankOf(c) === r && suitOf(c) !== T).length;
      let best = null, bs = Infinity;
      for (const m of throws) {
        let s = v(m.card) - (suitOf(m.card) !== T ? (count(rankOf(m.card)) - 1) * 1.5 : 0);
        if (level >= 3 && endgame && !oppCanBeat(m.card)) s -= 30; // they cannot beat it
        if (s < bs) { bs = s; best = m; }
      }
      return best;
    }
    if (!throws.length) return { type: 'done' };
    const pick = (ok) => { const c = throws.filter((m) => ok(m.card)).sort((a, b) => v(a.card) - v(b.card)); return c[0] || null; };
    if (level === 1) return rng() < 0.5 ? throws[0] : { type: 'done' };
    if (g.taking) return pick((c) => suitOf(c) !== T && (endgame || rankOf(c) <= 6)) || { type: 'done' };
    const m = endgame
      ? pick((c) => suitOf(c) !== T || hand.length <= 2)
      : pick((c) => suitOf(c) !== T && rankOf(c) <= (g.deck.length > 8 ? 4 : 6));
    return m || { type: 'done' };
  }

  // defending
  const ub = g.table.map((x, i) => (x.d === null ? i : -1)).filter((i) => i >= 0);
  const transfers = moves.filter((m) => m.type === 'transfer');
  if (level === 1) {
    if (transfers.length && rng() < 0.5) return transfers[0];
    const b = moves.filter((m) => m.type === 'beat');
    return b.length && rng() < 0.85 ? b[0] : { type: 'take' };
  }
  // plan: beat every unbeaten card with the cheapest card (strongest attack card first)
  const order = ub.slice().sort((a, b) => v(g.table[b].a) - v(g.table[a].a));
  const used = new Set(), plan = [];
  for (const i of order) {
    const opts = hand.filter((c) => !used.has(c) && beats(g.table[i].a, c, T)).sort((a, b) => v(a) - v(b));
    if (!opts.length) { plan.length = 0; break; }
    used.add(opts[0]); plan.push({ type: 'beat', card: opts[0], target: i });
  }
  const cheapTransfer = transfers.filter((m) => suitOf(m.card) !== T || rankOf(m.card) <= 1).sort((a, b) => v(a.card) - v(b.card))[0];
  if (cheapTransfer && (suitOf(cheapTransfer.card) !== T || !plan.length)) return cheapTransfer;
  if (!plan.length) return transfers.sort((a, b) => v(a.card) - v(b.card))[0] || { type: 'take' };
  const cost = plan.reduce((s, m) => s + v(m.card), 0);
  const bigTrumps = plan.filter((m) => suitOf(m.card) === T && rankOf(m.card) >= 5).length;
  const tableLow = g.table.every((x) => suitOf(x.a) !== T && rankOf(x.a) <= 3);
  if (!endgame && g.deck.length > 6 && bigTrumps && tableLow && g.table.length <= 2 && hand.length <= 7) return { type: 'take' };
  return plan[0];
}
