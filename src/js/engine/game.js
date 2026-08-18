import {
  TERRITORIES,
  CONTINENTS,
  buildAdjacencyMap,
  TERRITORY_IDS,
  INITIAL_ARMIES_BY_PLAYERS,
} from '../data/map.js';
import { RELICS, RELIC_IDS } from '../data/relics.js';
import { CARDS, createCardDeck, getCard, isHandPlayable, isCombatCard, combatCardNeedsDiePick, riderBonus } from '../data/cards.js';
import {
  createClassicDeck,
  getClassicCard,
  isValidClassicSet,
  findClassicTradeSet,
  classicTradeValue,
  classicCardLogName,
  CLASSIC_HAND_LIMIT,
  isClassicCardId,
} from '../data/classic-cards.js';
import { EVENTS, createEventDeck } from '../data/events.js';
import { MISSIONS, MISSION_IDS, checkMission } from '../data/missions.js';
import { createRng } from './rng.js';
import {
  STACK_WINDOW_MS,
  initStackState,
  isStackLocked,
  canEndPhaseNow,
  openResponseWindow,
  resetWindowDeadline,
  pauseResponseWindow,
  resumeResponseWindow,
  windowRemainingMs,
  isWindowExpired,
  pushStackEntry,
  resolveStack,
  canStartCast,
  canRespondInstant,
  canCastCombat,
  isCounterCard,
} from './stack.js';
import {
  getChoiceLegalActions,
  resolveChoice,
  beginArcanaDraft,
  beginSurveilChoice,
  beginScryChoice,
  beginStealChoice,
  beginSabotageChoice,
  beginOmniscienceChoice,
  beginTurncoatChoice,
  beginDoubleMandateChoice,
  applySurveilImmediate,
  applyStealImmediate,
  applySabotageImmediate,
  applyOmniscienceImmediate,
  applyTurncoatImmediate,
  applyDoubleMandateImmediate,
  applyArcanaImmediate,
  autoResolveChoice,
} from './choices.js';

export const PHASES = ['setup', 'reinforce', 'attack', 'fortify', 'game_over'];
export const BASE_HAND_SIZE = 5;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export const PLAYER_SLOTS = [
  { id: 'P1', name: 'IA Blu', color: '#3b82f6' },
  { id: 'P2', name: 'IA Rossa', color: '#ef4444' },
  { id: 'P3', name: 'IA Verde', color: '#16a34a' },
  { id: 'P4', name: 'IA Gialla', color: '#ca8a04' },
  { id: 'P5', name: 'IA Viola', color: '#7c3aed' },
  { id: 'P6', name: 'IA Arancio', color: '#ea580c' },
];

const ADJACENCY = buildAdjacencyMap();

function clone(state) {
  return structuredClone(state);
}

function log(state, message, extra = {}) {
  state.log.push({ t: state.log.length, message, ...extra });
}

export function getPlayerTerritories(state, playerId) {
  return TERRITORY_IDS.filter((id) => state.territories[id].owner === playerId);
}

export function getAlivePlayerIds(state) {
  return (state.playerOrder || Object.keys(state.players)).filter(
    (id) => getPlayerTerritories(state, id).length > 0
  );
}

function nextAlivePlayerId(state, fromId) {
  const order = state.playerOrder || Object.keys(state.players);
  const start = Math.max(0, order.indexOf(fromId));
  for (let i = 1; i <= order.length; i++) {
    const id = order[(start + i) % order.length];
    if (getPlayerTerritories(state, id).length > 0) return id;
  }
  return fromId;
}

function nextSetupPlayerId(state, fromId) {
  const order = state.playerOrder || Object.keys(state.players);
  const start = Math.max(0, order.indexOf(fromId));
  for (let i = 1; i <= order.length; i++) {
    const id = order[(start + i) % order.length];
    if (state.players[id].setupRemaining > 0) return id;
  }
  return null;
}

export function getContinentBonus(state, playerId) {
  let bonus = 0;
  const mult = playerHasRelic(state, playerId, 'continent_bonus_multiplier')
    ? getRelicEffect(state, playerId).value ?? 1.5
    : 1;
  for (const cont of Object.values(CONTINENTS)) {
    if (cont.territories.every((id) => state.territories[id].owner === playerId)) {
      const b = mult === 1 ? cont.bonus : Math.floor(cont.bonus * mult);
      bonus += b;
    }
  }
  return bonus;
}

function getExtraFortifyLimit(state, playerId) {
  if (playerHasRelic(state, playerId, 'extra_fortify_moves')) {
    return getRelicEffect(state, playerId).value ?? 2;
  }
  if (playerHasRelic(state, playerId, 'extra_fortify_move')) {
    return getRelicEffect(state, playerId).value ?? 1;
  }
  return 0;
}

function canUseBastion(state, defenderId) {
  if (!playerHasRelic(state, defenderId, 'bastion_defense')) return false;
  const usedRound = state.players[defenderId].bastionUsedRound;
  return usedRound == null || usedRound !== state.round;
}

function aiShouldUseBastion(state, defenderId, toId, attackDice) {
  const armies = state.territories[toId]?.armies ?? 0;
  return armies <= 2 || attackDice >= 2;
}

/** Per-continent ownership for UI. */
export function getContinentStatus(state, playerId) {
  return Object.values(CONTINENTS).map((cont) => {
    const byOwner = {};
    for (const tid of cont.territories) {
      const owner = state.territories[tid].owner;
      byOwner[owner] = (byOwner[owner] || 0) + 1;
    }
    const owned = byOwner[playerId] || 0;
    const total = cont.territories.length;
    const complete = owned === total;
    return {
      id: cont.id,
      name: cont.name,
      bonus: cont.bonus,
      owned,
      total,
      complete,
      byOwner,
    };
  });
}

export function playerHasRelic(state, playerId, effectType) {
  if (state.vanillaMode) return false;
  return !!findRelicIdWithEffect(state, playerId, effectType);
}

export function getRelicEffect(state, playerId) {
  const relicId = state.players[playerId].relicId;
  return relicId ? RELICS[relicId].effect : null;
}

function playerRelicIds(state, playerId) {
  const p = state.players[playerId];
  return [p.relicId, ...(p.extraRelicIds || [])].filter(Boolean);
}

function findRelicIdWithEffect(state, playerId, effectType) {
  for (const id of playerRelicIds(state, playerId)) {
    if (RELICS[id]?.effect?.type === effectType) return id;
  }
  return null;
}

function getRelicEffectByType(state, playerId, effectType) {
  const id = findRelicIdWithEffect(state, playerId, effectType);
  return id ? RELICS[id].effect : null;
}

export function getActiveEvent(state) {
  if (state.vanillaMode || !state.activeEventId) return null;
  return EVENTS[state.activeEventId] ?? null;
}

export function isImmuneToHarm(state, playerId) {
  return playerHasRelic(state, playerId, 'immune_harm_events');
}

export function handLimit(state, playerId) {
  if (state.vanillaMode) return CLASSIC_HAND_LIMIT;
  let lim = BASE_HAND_SIZE;
  if (playerHasRelic(state, playerId, 'hand_size_bonus')) {
    lim += getRelicEffect(state, playerId).value;
  }
  return lim;
}

export function computeReinforcements(state, playerId) {
  const owned = getPlayerTerritories(state, playerId).length;
  const event = getActiveEvent(state);
  const harmImmune = event?.tag === 'harm' && isImmuneToHarm(state, playerId);

  let divisor = 3;
  if (event?.effect?.type === 'reinforce_divisor' && !(event.tag === 'harm' && harmImmune)) {
    divisor = event.effect.value;
  }

  let n = Math.max(3, Math.floor(owned / divisor));
  n += getContinentBonus(state, playerId);

  if (playerHasRelic(state, playerId, 'extra_reinforcement')) {
    n += getRelicEffect(state, playerId).value;
  }
  if (event?.effect?.type === 'extra_reinforcement') {
    if (!(event.tag === 'harm' && harmImmune)) n += event.effect.value;
  }
  return n;
}

export function areAdjacent(a, b) {
  return ADJACENCY[a]?.includes(b);
}

export function canFortifyBetween(state, from, to) {
  if (state.territories[from].owner !== state.territories[to].owner) return false;
  const event = getActiveEvent(state);
  if (event?.effect?.type === 'fortify_chain') {
    return isConnectedOwned(state, from, to, state.territories[from].owner);
  }
  return areAdjacent(from, to);
}

function isConnectedOwned(state, from, to, owner) {
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur === to) return true;
    for (const n of ADJACENCY[cur]) {
      if (seen.has(n)) continue;
      if (state.territories[n].owner !== owner) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return false;
}

function rollDice(count, rng) {
  const dice = [];
  for (let i = 0; i < count; i++) dice.push(1 + rng.int(6));
  return dice.sort((a, b) => b - a);
}

function applyDieBonus(value, bonus) {
  return Math.min(6, Math.max(1, value + bonus));
}

function ensureDeckHasCards(state) {
  if (state.cardDeck.length > 0) return;
  if (state.cardDiscard.length === 0) return;
  state.cardDeck = state.rng.shuffle(state.cardDiscard);
  state.cardDiscard = [];
}

function peekDeckTop(state, n) {
  ensureDeckHasCards(state);
  const k = Math.min(n, state.cardDeck.length);
  return state.cardDeck.slice(-k).reverse();
}

function takeDeckTop(state) {
  ensureDeckHasCards(state);
  if (state.cardDeck.length === 0) return null;
  return state.cardDeck.pop();
}

function putDeckBottom(state, cardId) {
  state.cardDeck.unshift(cardId);
}

function clearIsolationForPlayer(state, playerId) {
  for (const [tid, lock] of Object.entries(state.isolatedTerritories || {})) {
    if (lock.untilPlayerId === playerId) delete state.isolatedTerritories[tid];
  }
}

function isTerritoryIsolated(state, territoryId) {
  return !!state.isolatedTerritories?.[territoryId];
}

function pickOpponent(state, fromPlayerId, preferredId) {
  if (preferredId && preferredId !== fromPlayerId && state.players[preferredId]) return preferredId;
  const alive = getAlivePlayerIds(state).filter((id) => id !== fromPlayerId);
  if (!alive.length) return null;
  alive.sort((a, b) => state.players[b].hand.length - state.players[a].hand.length);
  return alive[0];
}

function applyRider(state, playerId, card, action) {
  if (!card.territoryId) return;
  if (state.territories[card.territoryId]?.owner !== playerId) return;
  const bonus = playerHasRelic(state, playerId, 'dominion_rider')
    ? getRelicEffectByType(state, playerId, 'dominion_rider').bonus ?? 3
    : 2;
  const tid = action.riderTerritoryId || action.territoryId || card.territoryId;
  if (state.territories[tid]?.owner === playerId) {
    state.territories[tid].armies += bonus;
    log(
      state,
      `Rider (${TERRITORIES[card.territoryId].name}): +${bonus} su ${TERRITORIES[tid].name}.`,
    );
  }
}

function drawCardsToHand(state, playerId, count) {
  for (let i = 0; i < count; i++) {
    const r = drawCard(state, playerId);
    if (r?.pendingScry) break;
    if (r?.cardId) log(state, `Pesci ${getCard(r.cardId).name}.`);
    else if (r?.needsDiscard) {
      state.pendingDrawAfterDiscard = true;
      log(state, 'Mano piena: scarta 1 carta per pescare.');
      break;
    } else break;
  }
}

function applyCombatCardEffect(state, card, attDice, defDice, isAttacker, dieIndex) {
  const dice = isAttacker ? attDice : defDice;
  const idx = dieIndex ?? 0;
  if (card.effect.type === 'die_bonus') {
    if (dice[idx] !== undefined) dice[idx] = applyDieBonus(dice[idx], card.effect.value);
  } else if (card.effect.type === 'reroll_low' || card.effect.type === 'att_reroll_low') {
    const ri = dieIndex ?? dice.length - 1;
    if (dice[ri] !== undefined) {
      dice[ri] = 1 + state.rng.int(6);
      dice.sort((a, b) => b - a);
    }
  } else if (card.effect.type === 'att_high_die_bonus') {
    attDice[0] = applyDieBonus(attDice[0], card.effect.value);
  }
}

function maxAttackDice(state, armies) {
  let max = Math.min(3, armies - 1);
  const event = getActiveEvent(state);
  if (event?.effect?.type === 'dice_cap') {
    const immune = event.tag === 'harm' && false; // attacker checked separately
    max = Math.min(max, event.effect.attack);
  }
  return Math.max(0, max);
}

function maxDefendDice(state, armies) {
  let max = Math.min(2, armies);
  const event = getActiveEvent(state);
  if (event?.effect?.type === 'dice_cap') {
    max = Math.min(max, event.effect.defend);
  }
  return Math.max(0, max);
}

function drawCard(state, playerId) {
  const p = state.players[playerId];
  const limit = handLimit(state, playerId);
  if (p.hand.length >= limit) {
    if (state.vanillaMode) return { needsTrade: true };
    if (state.cardDeck.length === 0) {
      if (state.cardDiscard.length === 0) return null;
      state.cardDeck = state.rng.shuffle(state.cardDiscard);
      state.cardDiscard = [];
    }
    return { needsDiscard: true };
  }

  if (state.vanillaMode) {
    if (state.cardDeck.length === 0) {
      if (state.cardDiscard.length === 0) return null;
      state.cardDeck = state.rng.shuffle(state.cardDiscard);
      state.cardDiscard = [];
    }
    const cardId = state.cardDeck.pop();
    p.hand.push(cardId);
    return { cardId };
  }

  if (state.cardDeck.length === 0) {
    if (state.cardDiscard.length === 0) return null;
    state.cardDeck = state.rng.shuffle(state.cardDiscard);
    state.cardDiscard = [];
  }

  if (playerHasRelic(state, playerId, 'draw_scry') && state.cardDeck.length > 0) {
    const topId = state.cardDeck[state.cardDeck.length - 1];
    if (state.players[playerId].isHuman) {
      beginScryChoice(state, playerId, topId, (msg) => log(state, msg));
      return { pendingScry: true };
    }
    const topCard = getCard(topId);
    log(state, `Veggente: cima del mazzo — ${topCard?.name || topId}.`);
    if (state.rng.int(100) < 35) {
      putDeckBottom(state, state.cardDeck.pop());
      log(state, 'Veggente (IA): carta messa in fondo.');
    }
  }

  const cardId = state.cardDeck.pop();
  p.hand.push(cardId);
  return { cardId };
}

function ensureStartTurnEffects(state) {
  const pid = state.currentPlayerId;
  const event = getActiveEvent(state);
  if (event?.effect?.type === 'start_turn_lose_army') {
    if (!(event.tag === 'harm' && isImmuneToHarm(state, pid))) {
      const candidates = getPlayerTerritories(state, pid).filter(
        (id) => state.territories[id].armies > 1
      );
      if (candidates.length) {
        const tid = state.rng.pick(candidates);
        state.territories[tid].armies -= 1;
        log(state, `Peste: ${TERRITORIES[tid].name} perde 1 armata.`);
      }
    }
  }
}

function beginPlayerTurn(state) {
  state.phase = 'reinforce';
  state.conqueredThisTurn = false;
  state.conquersThisTurn = 0;
  state.attacksThisTurn = 0;
  state.fortifyUsed = false;
  state.extraFortifyRemaining = 0;
  state.pendingCombatCard = null;
  state.pendingInvasion = null;
  state.mustAttackSatisfied = false;
  state.pendingRecycle = false;
  const pid = state.currentPlayerId;
  state.players[pid].redoubtUsedThisTurn = false;
  state.players[pid].aggressorUsesThisTurn = 0;
  state.players[pid].armiesLostThisTurn = 0;
  clearIsolationForPlayer(state, pid);
  state.extraFortifyRemaining = getExtraFortifyLimit(state, pid);
  state.reinforcementsRemaining = computeReinforcements(state, pid);
  ensureStartTurnEffects(state);
  const p = state.players[pid];
  log(state, `${p.name} — rinforzi: ${state.reinforcementsRemaining}.`);
  if (
    !state.vanillaMode &&
    playerHasRelic(state, pid, 'start_turn_recycle') &&
    p.hand.length > 0 &&
    state.cardDeck.length + state.cardDiscard.length > 0
  ) {
    state.pendingRecycle = true;
  }
  if (state.drawEveryTurn) {
    const result = drawCard(state, state.currentPlayerId);
    if (result?.needsDiscard) {
      state.pendingDrawAfterDiscard = true;
      log(state, 'Mano piena: scarta 1 carta per pescare.');
    } else if (result?.cardId) {
      log(state, `Pesci ${getCard(result.cardId).name}.`);
    }
  }
}

function revealEvent(state) {
  if (state.vanillaMode) return;
  if (state.eventDeck.length === 0) {
    state.eventDeck = createEventDeck(state.rng);
  }
  state.activeEventId = state.eventDeck.pop();
  const ev = EVENTS[state.activeEventId];
  log(state, `Evento globale: ${ev.name} — ${ev.description}`, { type: 'event' });
}

function checkVictory(state) {
  const alive = getAlivePlayerIds(state);
  if (alive.length === 1) {
    const winner = state.players[alive[0]];
    state.phase = 'game_over';
    state.winnerId = winner.id;
    log(state, `${winner.name} conquista il mondo!`, { type: 'victory' });
    return true;
  }

  for (const id of alive) {
    const p = state.players[id];
    if (checkMission(state, p.id)) {
      state.phase = 'game_over';
      state.winnerId = p.id;
      const mission = MISSIONS[p.missionId];
      log(state, `${p.name} completa l’obiettivo «${mission.name}»!`, { type: 'victory' });
      return true;
    }
  }
  return false;
}

/**
 * Create initial game state.
 * @param {{ seed?: number, humanId?: string, playerCount?: number, aiCount?: number, vanillaMode?: boolean, drawEveryTurn?: boolean, seats?: { id?: string, name?: string, isHuman?: boolean }[] }} opts
 */
export function createGame(opts = {}) {
  const vanillaMode = !!opts.vanillaMode;
  const drawEveryTurn = !vanillaMode && !!opts.drawEveryTurn;
  const rng = createRng(opts.seed ?? Date.now());
  const humanId = opts.humanId ?? 'P1';
  const seatSpecs = Array.isArray(opts.seats) && opts.seats.length ? opts.seats : null;
  const fromAi = opts.aiCount != null ? 1 + Number(opts.aiCount) : null;
  const playerCount = Math.min(
    MAX_PLAYERS,
    Math.max(MIN_PLAYERS, Number(seatSpecs?.length ?? opts.playerCount ?? fromAi ?? 2))
  );
  const playerOrder = PLAYER_SLOTS.slice(0, playerCount).map((s) => s.id);
  const startArmies = INITIAL_ARMIES_BY_PLAYERS[playerCount] ?? INITIAL_ARMIES_BY_PLAYERS[2];

  const players = {};
  for (let i = 0; i < playerCount; i++) {
    const slot = PLAYER_SLOTS[i];
    const spec = seatSpecs?.[i];
    const isHuman = spec ? !!spec.isHuman : slot.id === humanId;
    const name = spec?.name || (isHuman ? 'Tu' : slot.name);
    players[slot.id] = {
      id: slot.id,
      name,
      isHuman,
      color: slot.color,
      relicId: null,
      missionId: null,
      missionTargetId: null,
      hand: [],
      setupRemaining: 0,
      bastionUsedRound: null,
      redoubtUsedThisTurn: false,
      aggressorUsesThisTurn: 0,
      armiesLostThisTurn: 0,
      extraRelicIds: [],
    };
  }

  const relicPool = rng.shuffle(RELIC_IDS);
  const missionPool = rng.shuffle(MISSION_IDS);
  const othersOf = (pid) => playerOrder.filter((id) => id !== pid);

  playerOrder.forEach((pid, i) => {
    if (!vanillaMode) players[pid].relicId = relicPool[i];
    players[pid].missionId = missionPool[i];
    if (players[pid].missionId === 'eliminate_enemy') {
      const others = othersOf(pid);
      players[pid].missionTargetId = others.length ? rng.pick(others) : null;
    }
  });

  const missionDeck = missionPool.slice(playerCount);

  const shuffledTerr = rng.shuffle(TERRITORY_IDS);
  const territories = {};
  for (let i = 0; i < shuffledTerr.length; i++) {
    const id = shuffledTerr[i];
    const owner = playerOrder[i % playerCount];
    territories[id] = { id, owner, armies: 1 };
  }

  const terrState = { territories };
  for (const pid of playerOrder) {
    players[pid].setupRemaining = startArmies - getPlayerTerritories(terrState, pid).length;
  }

  const state = {
    version: 1,
    seed: rng.seed,
    rng,
    players,
    playerOrder,
    playerCount,
    territories,
    adjacency: ADJACENCY,
    currentPlayerId: playerOrder[0],
    round: 0,
    turnsInRound: 0,
    phase: 'setup',
    reinforcementsRemaining: 0,
    conqueredThisTurn: false,
    conquersThisTurn: 0,
    attacksThisTurn: 0,
    fortifyUsed: false,
    extraFortifyRemaining: 0,
    mustAttackSatisfied: false,
    pendingCombatCard: null,
    pendingInvasion: null,
    pendingBastion: null,
    pendingRecycle: false,
    isolatedTerritories: {},
    vanillaMode,
    drawEveryTurn,
    cardDeck: vanillaMode ? createClassicDeck(rng) : createCardDeck(rng),
    cardDiscard: [],
    classicTrades: 0,
    pendingClassicDraw: false,
    eventDeck: vanillaMode ? [] : createEventDeck(rng),
    activeEventId: null,
    winnerId: null,
    lastBattle: null,
    log: [],
    stack: [],
    responseWindow: null,
    pendingCast: null,
    combatContext: null,
    stackSeq: 0,
    missionDeck: vanillaMode ? [] : missionDeck,
    pendingChoice: null,
  };
  initStackState(state);

  const modeBits = [
    vanillaMode ? 'Classico' : 'Krisiko',
    drawEveryTurn ? 'pesca ogni turno' : null,
  ].filter(Boolean);
  log(state, `Partita iniziata (${playerCount} giocatori, seed ${state.seed}${modeBits.length ? ` · ${modeBits.join(' · ')}` : ''}).`);
  log(state, `Schieramento: 1 armata per territorio; ${startArmies} armate a testa, il resto a turni.`);
  for (const pid of playerOrder) {
    const p = players[pid];
    if (!vanillaMode && p.relicId) {
      log(state, `${p.name} reliquia: ${RELICS[p.relicId].name}. Obiettivo segreto assegnato.`);
    } else {
      log(state, `${p.name} obiettivo segreto assegnato.`);
    }
  }
  log(
    state,
    `Piazzamento: ${players[playerOrder[0]].name} — ${players[playerOrder[0]].setupRemaining} armate da schierare.`
  );
  return state;
}

/** Serialize without RNG function. */
export function serializeState(state) {
  const { rng, ...rest } = state;
  return JSON.parse(
    JSON.stringify({
      ...rest,
      seed: state.seed,
      rngState: typeof rng?.getState === 'function' ? rng.getState() : undefined,
    })
  );
}

export function hydrateState(data) {
  const copy = typeof structuredClone === 'function' ? structuredClone(data) : JSON.parse(JSON.stringify(data));
  copy.rng = createRng(copy.seed, copy.rngState);
  return copy;
}

/** Public view for one player: hide others' missions and card ids. */
export function viewForPlayer(state, viewerId) {
  const snap = serializeState(state);
  delete snap.rngState;
  for (const p of Object.values(snap.players || {})) {
    if (p.id === viewerId) continue;
    p.missionId = null;
    p.missionTargetId = null;
    p.hand = Array.isArray(p.hand) ? p.hand.map(() => 'hidden') : [];
  }
  if (snap.pendingCast && snap.pendingCast.playerId !== viewerId) {
    snap.pendingCast = {
      playerId: snap.pendingCast.playerId,
      kind: snap.pendingCast.kind,
      hidden: true,
    };
  }
  return snap;
}

export function getLegalActions(state, actingPlayerId = null) {
  if (state.phase === 'game_over') return [];

  const turnPid = state.currentPlayerId;
  const actor = actingPlayerId ?? turnPid;

  if (state.pendingBastion) {
    if (actor === state.pendingBastion.defenderId) {
      return [
        { type: 'RESOLVE_BASTION', use: true },
        { type: 'RESOLVE_BASTION', use: false },
      ];
    }
    return [];
  }

  if (state.pendingChoice) {
    return getChoiceLegalActions(state, actor);
  }

  const actions = [];

  if (actor === turnPid && state.pendingInvasion) {
    actions.push({ type: 'CONFIRM_INVASION' });
    return actions;
  }

  if (actor === turnPid && state.pendingDrawAfterDiscard) {
    const hand = state.players[turnPid].hand;
    for (let i = 0; i < hand.length; i++) {
      actions.push({ type: 'DISCARD_FOR_DRAW', handIndex: i });
    }
    return actions;
  }

  if (actor === turnPid && state.pendingRecycle && !state.vanillaMode) {
    actions.push({ type: 'SKIP_RECYCLE' });
    for (let i = 0; i < state.players[turnPid].hand.length; i++) {
      actions.push({ type: 'RECYCLE_CARD', handIndex: i });
    }
  }

  if (state.phase === 'setup') {
    if (actor === turnPid && state.players[turnPid].setupRemaining > 0) {
      for (const tid of getPlayerTerritories(state, turnPid)) {
        actions.push({ type: 'PLACE_REINFORCEMENT', territoryId: tid });
      }
    }
    return actions;
  }

  if (actor === turnPid) {
    if (state.phase === 'reinforce') {
      if (state.reinforcementsRemaining > 0) {
        for (const tid of getPlayerTerritories(state, turnPid)) {
          actions.push({ type: 'PLACE_REINFORCEMENT', territoryId: tid });
        }
      } else if (canEndPhaseNow(state)) {
        actions.push({ type: 'END_PHASE' });
      }
      if (state.vanillaMode) {
        const set = findClassicTradeSet(state.players[turnPid].hand);
        if (set) actions.push({ type: 'TRADE_CLASSIC_CARDS', handIndices: set });
      }
    }

    if (state.phase === 'attack') {
      if (canEndPhaseNow(state)) actions.push({ type: 'END_PHASE' });
      if (!state.responseWindow && !state.combatContext) {
        for (const from of getPlayerTerritories(state, turnPid)) {
          if (state.territories[from].armies < 2) continue;
          if (isTerritoryIsolated(state, from)) continue;
          for (const to of ADJACENCY[from]) {
            if (state.territories[to].owner !== turnPid) {
              actions.push({
                type: 'ATTACK',
                from,
                to,
                attackDice: Math.min(3, state.territories[from].armies - 1),
              });
            }
          }
        }
      }
    }

    if (state.phase === 'fortify') {
      if (canEndPhaseNow(state)) actions.push({ type: 'END_PHASE' });
      const canMain = !state.fortifyUsed;
      const canExtra = state.fortifyUsed && state.extraFortifyRemaining > 0;
      if (canMain || canExtra) {
        const maxMove = canExtra ? 1 : 999;
        for (const from of getPlayerTerritories(state, turnPid)) {
          if (state.territories[from].armies < 2) continue;
          for (const to of getPlayerTerritories(state, turnPid)) {
            if (from === to) continue;
            if (!canFortifyBetween(state, from, to)) continue;
            const max = Math.min(maxMove, state.territories[from].armies - 1);
            for (let n = 1; n <= max && n <= 5; n++) {
              actions.push({ type: 'FORTIFY', from, to, armies: n });
            }
          }
        }
      }
    }
  }

  if (state.vanillaMode) return actions;
  actions.push(...getStackActions(state, actor));
  return actions;
}

/** Server / online validation: can this player send this action now? */
export function isActionAllowed(state, playerId, action) {
  if (!action?.type || state.phase === 'game_over') return false;
  if (action.type === 'TICK_STACK') return false;

  const legal = getLegalActions(state, playerId);

  switch (action.type) {
    case 'CAST_START':
      return legal.some((a) => a.type === 'CAST_START' && a.handIndex === action.handIndex);
    case 'CAST_CONFIRM':
    case 'CAST_CANCEL':
      return state.pendingCast?.playerId === playerId;
    case 'SET_CAST_DIE':
      return (
        state.pendingCast?.playerId === playerId &&
        state.pendingCast.needsDiePick &&
        Number.isInteger(action.dieIndex)
      );
    case 'PASS_STACK':
      return legal.some((a) => a.type === 'PASS_STACK');
    case 'PLAY_ACTION_CARD':
      return legal.some((a) => a.type === 'CAST_START' && a.handIndex === action.handIndex);
    case 'ATTACK':
      return legal.some(
        (a) => a.type === 'ATTACK' && a.from === action.from && a.to === action.to,
      );
    case 'FORTIFY':
      return legal.some(
        (a) =>
          a.type === 'FORTIFY' &&
          a.from === action.from &&
          a.to === action.to &&
          (action.armies == null || a.armies === action.armies),
      );
    case 'PLACE_REINFORCEMENT':
      return legal.some(
        (a) => a.type === 'PLACE_REINFORCEMENT' && a.territoryId === action.territoryId,
      );
    case 'CONFIRM_INVASION':
    case 'RESOLVE_BASTION':
    case 'SKIP_RECYCLE':
    case 'END_PHASE':
    case 'TRADE_CLASSIC_CARDS':
      return legal.some((a) => a.type === action.type);
    case 'DISCARD_FOR_DRAW':
    case 'RECYCLE_CARD':
      return legal.some(
        (a) => a.type === action.type && a.handIndex === action.handIndex,
      );
    default:
      return legal.some((a) => a.type === action.type);
  }
}

/**
 * Apply an action; mutates and returns state (clone-on-write style: caller may clone first).
 */
export function applyAction(state, action) {
  if (state.phase === 'game_over') return state;

  if (!state.vanillaMode && state.responseWindow) {
    const allowed = ['CAST_START', 'CAST_CONFIRM', 'CAST_CANCEL', 'TICK_STACK', 'RESOLVE_BASTION', 'PASS_STACK', 'SET_CAST_DIE'];
    if (!allowed.includes(action.type)) {
      return state;
    }
  }
  if (!state.vanillaMode && state.pendingCast) {
    const allowed = ['CAST_CONFIRM', 'CAST_CANCEL', 'TICK_STACK', 'RESOLVE_BASTION', 'SET_CAST_DIE'];
    if (!allowed.includes(action.type)) {
      return state;
    }
  }

  if (state.pendingInvasion && action.type !== 'CONFIRM_INVASION') {
    if (action.type !== 'SET_COMBAT_CARD') {
      log(state, 'Completa prima lo spostamento nella zona conquistata.');
      return state;
    }
  }

  if (state.pendingChoice && action.type !== 'RESOLVE_CHOICE' && action.type !== 'RESOLVE_ARCANA') {
    return state;
  }

  switch (action.type) {
    case 'PLACE_REINFORCEMENT':
      return placeReinforcement(state, action);
    case 'END_PHASE':
      return endPhase(state);
    case 'ATTACK':
      return resolveAttack(state, action);
    case 'FORTIFY':
      return fortify(state, action);
    case 'CONFIRM_INVASION':
      return confirmInvasion(state, action);
    case 'RESOLVE_BASTION':
      return resolveBastionChoice(state, action);
    case 'RESOLVE_ARCANA':
    case 'RESOLVE_CHOICE':
      return resolveChoiceAction(state, action);
    case 'RECYCLE_CARD':
      return recycleCard(state, action);
    case 'SKIP_RECYCLE':
      return skipRecycle(state);
    case 'CAST_START':
      return castStart(state, action);
    case 'CAST_CONFIRM':
      return castConfirm(state, action);
    case 'CAST_CANCEL':
      return castCancel(state, action);
    case 'TICK_STACK':
      return tickStack(state, action);
    case 'PASS_STACK':
      return passStack(state, action);
    case 'SET_CAST_DIE':
      if (state.pendingCast?.playerId === (action.playerId || state.pendingCast.playerId)) {
        state.pendingCast.targets = { ...state.pendingCast.targets, dieIndex: action.dieIndex };
      }
      return state;
    case 'PLAY_ACTION_CARD':
      return castStart(state, action);
    case 'SET_COMBAT_CARD':
      state.pendingCombatCard = action.handIndex ?? null;
      return state;
    case 'DISCARD_FOR_DRAW':
      return discardForDraw(state, action);
    case 'TRADE_CLASSIC_CARDS':
      return tradeClassicCards(state, action);
    default:
      log(state, `Azione sconosciuta: ${action.type}`);
      return state;
  }
}

function placeReinforcement(state, action) {
  const tid = action.territoryId;
  const t = state.territories[tid];
  if (!t || t.owner !== state.currentPlayerId) return state;

  // Initial deployment: alternate one army at a time
  if (state.phase === 'setup') {
    const pid = state.currentPlayerId;
    if (state.players[pid].setupRemaining <= 0) return state;
    t.armies += 1;
    state.players[pid].setupRemaining -= 1;
    log(state, `Schieramento: +1 su ${TERRITORIES[tid].name} (restano ${state.players[pid].setupRemaining}).`);

    const next = nextSetupPlayerId(state, pid);
    if (!next) {
      log(state, 'Schieramento completato. Inizia la partita!');
      state.currentPlayerId = state.playerOrder[0];
      state.round = 1;
      beginPlayerTurn(state);
    } else {
      state.currentPlayerId = next;
      if (next !== pid) {
        log(
          state,
          `Schieramento: turno di ${state.players[next].name} (${state.players[next].setupRemaining} rimaste).`
        );
      }
    }
    return state;
  }

  if (state.phase !== 'reinforce') return state;
  if (state.reinforcementsRemaining <= 0) return state;
  const n = action.count ?? 1;
  const place = Math.min(n, state.reinforcementsRemaining);
  t.armies += place;
  state.reinforcementsRemaining -= place;
  log(state, `+${place} su ${TERRITORIES[tid].name} (${t.armies}).`);
  return state;
}

function endPhase(state) {
  const pid = state.currentPlayerId;
  const event = getActiveEvent(state);

  if (!canEndPhaseNow(state)) {
    log(state, 'Chiudi lo stack prima di avanzare fase.');
    return state;
  }

  if (state.pendingInvasion) {
    log(state, 'Completa prima lo spostamento nella zona conquistata.');
    return state;
  }

  if (state.phase === 'reinforce') {
    if (state.reinforcementsRemaining > 0) {
      log(state, 'Devi piazzare tutti i rinforzi.');
      return state;
    }
    if (state.pendingRecycle) state.pendingRecycle = false;
    state.phase = 'attack';
    log(state, 'Fase attacco.');
    return state;
  }

  if (state.phase === 'attack') {
    if (event?.effect?.type === 'must_attack_once') {
      const immune = event.tag === 'harm' && isImmuneToHarm(state, pid);
      if (!immune && !state.mustAttackSatisfied) {
        const canAttack = getLegalActions({ ...state, phase: 'attack' }).some((a) => a.type === 'ATTACK');
        // Recompute can-attack without END_PHASE
        let hasAttack = false;
        for (const from of getPlayerTerritories(state, pid)) {
          if (state.territories[from].armies < 2) continue;
          for (const to of ADJACENCY[from]) {
            if (state.territories[to].owner !== pid) {
              hasAttack = true;
              break;
            }
          }
          if (hasAttack) break;
        }
        if (hasAttack) {
          log(state, 'Evento Caos: devi attaccare almeno una volta.');
          return state;
        }
      }
    }

    if (state.conqueredThisTurn && (!state.drawEveryTurn || state.vanillaMode)) {
      const hand = state.players[pid].hand;
      if (state.vanillaMode && hand.length >= CLASSIC_HAND_LIMIT) {
        state.pendingClassicDraw = true;
        log(state, 'Mano piena: scambia un set di 3 carte per pescare.');
      } else {
        const result = drawCard(state, pid);
        if (result?.needsTrade) {
          state.pendingClassicDraw = true;
          log(state, 'Mano piena: scambia un set di 3 carte per pescare.');
        } else if (result?.needsDiscard) {
          state.pendingDrawAfterDiscard = true;
          log(state, 'Mano piena: scarta 1 carta per pescare.');
        } else if (result?.cardId) {
          log(
            state,
            `Pesci ${state.vanillaMode ? classicCardLogName(result.cardId) : getCard(result.cardId).name}.`,
          );
        }
      }
    }
    if (
      !state.vanillaMode &&
      playerHasRelic(state, pid, 'conquest_draw_bonus') &&
      state.conquersThisTurn >= (getRelicEffect(state, pid).minConquers ?? 2)
    ) {
      const result = drawCard(state, pid);
      if (result?.needsDiscard) {
        state.pendingDrawAfterDiscard = true;
        log(state, 'Sete di conquista: mano piena — scarta 1 carta per pescare.');
      } else if (result?.cardId) {
        log(state, `Sete di conquista: pesci ${getCard(result.cardId).name}.`);
      }
    }
    state.phase = 'fortify';
    log(state, 'Fase spostamento.');
    return state;
  }

  if (state.phase === 'fortify') {
    return endTurn(state);
  }

  return state;
}

function endTurn(state) {
  if (checkVictory(state)) return state;

  state.turnsInRound += 1;
  const from = state.currentPlayerId;
  const living = getAlivePlayerIds(state);
  const next = nextAlivePlayerId(state, from);
  const fromIdx = living.indexOf(from);
  const nextIdx = living.indexOf(next);
  if (fromIdx === -1 || nextIdx <= fromIdx) {
    state.turnsInRound = 0;
    state.round += 1;
    if (state.round >= 3) {
      revealEvent(state);
    }
  }

  state.currentPlayerId = next;
  beginPlayerTurn(state);
  return state;
}

function stackNow(action) {
  return typeof action?.nowMs === 'number' ? action.nowMs : Date.now();
}

function playerName(state, pid) {
  return state.players[pid]?.name || pid;
}

function choiceDeps(state) {
  return {
    log: (msg) => log(state, msg),
    playerName: (id) => playerName(state, id),
    handLimit: (st, pid) => handLimit(st, pid),
    putDeckBottom,
    revealEvent,
    pickOpponent,
  };
}

function resolveChoiceAction(state, action) {
  resolveChoice(state, action, choiceDeps(state));
  return state;
}

/** AI / auto-resolve interactive choice prompts. */
export function processChoiceDraft(state) {
  if (!state.pendingChoice) return false;
  if (state.players[state.pendingChoice.actorId]?.isHuman) return false;
  autoResolveChoice(state, choiceDeps(state));
  return true;
}

function isAlertProtected(state, playerId) {
  return playerHasRelic(state, playerId, 'immune_negate_swoop');
}

function applyCardEffect(state, pid, card, action) {
  switch (card.effect.type) {
    case 'add_armies': {
      if (card.effect.split) {
        const tid = action.territoryId ?? getPlayerTerritories(state, pid)[0];
        if (state.territories[tid]?.owner === pid) {
          state.territories[tid].armies += card.effect.value;
          log(state, `${card.name}: +${card.effect.value} su ${TERRITORIES[tid].name}.`);
        }
      } else {
        const tid = action.territoryId ?? getPlayerTerritories(state, pid)[0];
        if (state.territories[tid]?.owner === pid) {
          state.territories[tid].armies += card.effect.value;
          log(state, `${card.name}: +${card.effect.value} su ${TERRITORIES[tid].name}.`);
        }
      }
      break;
    }
    case 'free_move': {
      const from = action.from;
      const to = action.to;
      const n = Math.min(action.armies ?? card.effect.value, card.effect.value);
      const adjacentOk = !card.effect.adjacent || areAdjacent(from, to);
      if (
        from &&
        to &&
        adjacentOk &&
        state.territories[from]?.owner === pid &&
        state.territories[to]?.owner === pid &&
        state.territories[from].armies - n >= 1 &&
        n >= 1
      ) {
        state.territories[from].armies -= n;
        state.territories[to].armies += n;
        log(state, `${card.name}: ${n} armate spostate.`);
      }
      break;
    }
    case 'teleport_move': {
      const from = action.from;
      const to = action.to;
      const n = action.armies ?? Math.max(1, (state.territories[from]?.armies || 1) - 1);
      if (
        from &&
        to &&
        from !== to &&
        state.territories[from]?.owner === pid &&
        state.territories[to]?.owner === pid &&
        state.territories[from].armies - n >= 1
      ) {
        state.territories[from].armies -= n;
        state.territories[to].armies += n;
        log(state, `${card.name}: ${n} armate teletrasportate.`);
      }
      break;
    }
    case 'draw':
      drawCardsToHand(state, pid, card.effect.value);
      break;
    case 'surveil': {
      ensureDeckHasCards(state);
      const seen = peekDeckTop(state, card.effect.look);
      const take = Math.min(
        card.effect.take,
        seen.length,
        handLimit(state, pid) - state.players[pid].hand.length,
      );
      if (!seen.length || take <= 0) break;
      const deps = choiceDeps(state);
      if (
        beginSurveilChoice(state, pid, card, seen, take, (msg) => log(state, msg))
      ) {
        break;
      }
      applySurveilImmediate(state, pid, seen, take, deps);
      break;
    }
    case 'sabotage_discard': {
      if (beginSabotageChoice(state, pid, card, (msg) => log(state, msg))) break;
      applySabotageImmediate(state, pid, card, action, choiceDeps(state));
      break;
    }
    case 'steal_card': {
      if (beginStealChoice(state, pid, card, (msg) => log(state, msg))) break;
      applyStealImmediate(state, pid, card, action, choiceDeps(state));
      break;
    }
    case 'isolation': {
      const tid = action.territoryId;
      if (tid && state.territories[tid]) {
        state.isolatedTerritories[tid] = { untilPlayerId: pid };
        log(state, `${card.name}: ${TERRITORIES[tid].name} isolato.`);
      }
      break;
    }
    case 'betrayal': {
      const tid = action.territoryId;
      const t = state.territories[tid];
      if (t && t.owner !== pid && t.armies === 1) {
        t.owner = pid;
        log(state, `${card.name}: conquisti ${TERRITORIES[tid].name}!`);
        checkVictory(state);
      }
      break;
    }
    case 'plague':
      for (const tid of Object.keys(state.territories)) {
        const t = state.territories[tid];
        if (t.armies <= 2) continue;
        let loss = Math.floor(t.armies / 3);
        t.armies = Math.max(1, t.armies - loss);
      }
      log(state, `${card.name}: −⅓ armate (min 1).`);
      break;
    case 'omniscience':
      if (beginOmniscienceChoice(state, pid, card, (msg) => log(state, msg))) break;
      applyOmniscienceImmediate(state, pid, card, choiceDeps(state));
      break;
    case 'resurrection':
      for (const oid of getAlivePlayerIds(state)) {
        const n = state.players[oid].armiesLostThisTurn || 0;
        if (n <= 0) continue;
        const tid = getPlayerTerritories(state, oid)[0];
        if (tid) {
          state.territories[tid].armies += n;
          log(state, `${card.name}: ${state.players[oid].name} +${n}.`);
        }
      }
      break;
    case 'chaos_events':
      revealEvent(state);
      log(state, `${card.name}: nuovo evento.`);
      break;
    case 'arcana':
      if (!beginArcanaDraft(state, pid, (msg) => log(state, msg))) {
        applyArcanaImmediate(state, pid, choiceDeps(state));
      }
      break;
    case 'turncoat':
      if (beginTurncoatChoice(state, pid, card, (msg) => log(state, msg))) break;
      applyTurncoatImmediate(state, pid, card, choiceDeps(state));
      break;
    case 'double_mandate':
      if (beginDoubleMandateChoice(state, pid, card, (msg) => log(state, msg))) break;
      applyDoubleMandateImmediate(state, pid, card, choiceDeps(state));
      break;
    default:
      break;
  }
}

function applyStackEntry(state, entry) {
  const card = getCard(entry.cardId);
  if (!card) return;
  const pid = entry.playerId;
  const targets = entry.targets || {};

  if (entry.kind === 'combat' && state.combatContext) {
    if (!state.combatContext.pendingCombatCards) state.combatContext.pendingCombatCards = [];
    state.combatContext.pendingCombatCards.push({ entry, card, pid });
    state.cardDiscard.push(entry.cardId);
    log(state, `${playerName(state, pid)}: ${card.name} (combattimento).`);
    return;
  }

  applyRider(state, pid, card, targets);
  applyCardEffect(state, pid, card, targets);
  state.cardDiscard.push(entry.cardId);
}

function runStackResolution(state) {
  resolveStack(state, {
    applyEntry: (entry) => applyStackEntry(state, entry),
    discardEntry: (entry) => state.cardDiscard.push(entry.cardId),
    isAlertProtected: (playerId) => isAlertProtected(state, playerId),
    giveCardToPlayer: (playerId, cardId) => {
      const lim = handLimit(state, playerId);
      if (state.players[playerId].hand.length >= lim) {
        state.cardDiscard.push(cardId);
        log(state, 'Mano piena: carta sciacallo scartata.');
      } else {
        state.players[playerId].hand.push(cardId);
      }
    },
    log: (msg) => log(state, msg),
    playerName: (id) => playerName(state, id),
  });
}

function passStack(state, action) {
  if (!state.responseWindow || state.pendingCast) return state;
  const pid = action.playerId;
  if (!state.playerOrder.includes(pid)) return state;
  const passed = state.responseWindow.passedPlayerIds || [];
  if (passed.includes(pid)) return state;
  passed.push(pid);
  state.responseWindow.passedPlayerIds = passed;
  log(state, `${playerName(state, pid)} passa.`);
  const alive = getAlivePlayerIds(state);
  if (alive.every((id) => passed.includes(id))) {
    log(state, 'Tutti passano — finestra chiusa.');
    return closeResponseWindow(state, stackNow(action));
  }
  return state;
}

function closeResponseWindow(state, nowMs) {
  if (!state.responseWindow) return state;
  runStackResolution(state);
  state.responseWindow = null;
  if (state.combatContext) {
    finishCombatFromContext(state);
  }
  return state;
}

export function tickStack(state, action = {}) {
  if (state.vanillaMode) return state;
  const nowMs = stackNow(action);
  if (state.pendingCast) return state;
  if (!isWindowExpired(state, nowMs)) return state;
  log(state, 'Finestra stack chiusa.');
  return closeResponseWindow(state, nowMs);
}

function pushCastToStack(state, actor, card, handIndex, targets, nowMs) {
  if (state.players[actor].hand[handIndex] !== card.id) return false;
  state.players[actor].hand.splice(handIndex, 1);
  pushStackEntry(state, {
    playerId: actor,
    cardId: card.id,
    kind: card.timing,
    targets: targets || {},
  });

  if (card.timing === 'action') {
    if (!state.responseWindow) openResponseWindow(state, 'action_response', nowMs);
    else resetWindowDeadline(state, nowMs);
  } else if (state.responseWindow) {
    resetWindowDeadline(state, nowMs);
  }
  if (state.responseWindow) resumeResponseWindow(state, nowMs);
  log(state, `${playerName(state, actor)} lancia ${card.name}.`);
  return true;
}

function castStart(state, action) {
  const nowMs = stackNow(action);
  const actor = action.playerId || state.currentPlayerId;
  const handIndex = action.handIndex;
  const cardId = state.players[actor].hand[handIndex];
  const card = getCard(cardId);
  if (!card || !canStartCast(state, actor, card)) return state;
  if (state.pendingCast) return state;

  const targets = {
    territoryId: action.territoryId,
    from: action.from,
    to: action.to,
    armies: action.armies,
    riderTerritoryId: action.riderTerritoryId,
    targetPlayerId: action.targetPlayerId,
  };

  if (card.timing === 'action') {
    pushCastToStack(state, actor, card, handIndex, targets, nowMs);
    return state;
  }

  state.pendingCast = {
    playerId: actor,
    cardId,
    handIndex,
    kind: card.timing,
    targets,
    needsDiePick: combatCardNeedsDiePick(card) && !!state.combatContext,
  };
  if (state.responseWindow) pauseResponseWindow(state, nowMs);
  return state;
}

function castConfirm(state, action) {
  const nowMs = stackNow(action);
  const actor = action.playerId || state.pendingCast?.playerId;
  if (!state.pendingCast || state.pendingCast.playerId !== actor) return state;
  const pc = state.pendingCast;
  const card = getCard(pc.cardId);
  if (!card || state.players[actor].hand[pc.handIndex] !== pc.cardId) {
    state.pendingCast = null;
    if (state.responseWindow) resumeResponseWindow(state, nowMs);
    return state;
  }
  if (pc.needsDiePick && pc.targets.dieIndex == null && action.dieIndex == null) return state;
  const targets = { ...pc.targets };
  if (action.dieIndex != null) targets.dieIndex = action.dieIndex;

  state.pendingCast = null;
  pushCastToStack(state, actor, card, pc.handIndex, targets, nowMs);
  return state;
}

function castCancel(state, action) {
  const nowMs = stackNow(action);
  const actor = action.playerId || state.pendingCast?.playerId;
  if (!state.pendingCast || state.pendingCast.playerId !== actor) return state;
  state.pendingCast = null;
  if (state.responseWindow) resumeResponseWindow(state, nowMs);
  log(state, 'Lancio annullato.');
  return state;
}

function finishCombatFromContext(state) {
  const ctx = state.combatContext;
  if (!ctx) return;
  const pid = ctx.attackerId;
  const defPid = ctx.defenderId;
  const from = state.territories[ctx.from];
  const to = state.territories[ctx.to];
  if (!from || !to) {
    state.combatContext = null;
    return;
  }

  let attDice = [...ctx.rawAttDice];
  let defDice = [...ctx.rawDefDice];

  const preCards = (ctx.pendingCombatCards || []).filter(
    (c) => (c.card.effect.combatPhase || 'pre_compare') === 'pre_compare',
  );
  const postCards = (ctx.pendingCombatCards || []).filter(
    (c) => c.card.effect.combatPhase === 'post_compare',
  );

  for (const { card, pid: cpid, entry } of preCards) {
    const isAtt = cpid === pid;
    applyCombatCardEffect(state, card, attDice, defDice, isAtt, entry?.targets?.dieIndex);
  }

  if (ctx.fromArmiesBefore === 2 && playerHasRelic(state, pid, 'guerrilla_attack')) {
    attDice[0] = applyDieBonus(attDice[0], getRelicEffectByType(state, pid, 'guerrilla_attack').value);
  }
  if (ctx.useBastion && playerHasRelic(state, defPid, 'bastion_defense')) {
    defDice[0] = applyDieBonus(defDice[0], getRelicEffectByType(state, defPid, 'bastion_defense').value);
  }

  attDice.sort((a, b) => b - a);
  defDice.sort((a, b) => b - a);

  let pairs = Math.min(attDice.length, defDice.length);
  let attLoss = 0;
  let defLoss = 0;
  for (let i = 0; i < pairs; i++) {
    if (attDice[i] > defDice[i]) defLoss += 1;
    else attLoss += 1;
  }

  for (const { card, pid: cpid, entry } of postCards) {
    const isAtt = cpid === pid;
    if (card.effect.type === 'reroll_low' || card.effect.type === 'att_reroll_low') {
      const dice = isAtt ? attDice : defDice;
      const idx = entry?.targets?.dieIndex ?? dice.length - 1;
      if (dice[idx] !== undefined) {
        dice[idx] = 1 + state.rng.int(6);
        dice.sort((a, b) => b - a);
      }
    }
    attDice.sort((a, b) => b - a);
    defDice.sort((a, b) => b - a);
    pairs = Math.min(attDice.length, defDice.length);
    attLoss = 0;
    defLoss = 0;
    for (let i = 0; i < pairs; i++) {
      if (attDice[i] > defDice[i]) defLoss += 1;
      else attLoss += 1;
    }
  }

  from.armies -= attLoss;
  to.armies -= defLoss;
  state.players[pid].armiesLostThisTurn = (state.players[pid].armiesLostThisTurn || 0) + attLoss;
  state.players[defPid].armiesLostThisTurn = (state.players[defPid].armiesLostThisTurn || 0) + defLoss;
  state.attacksThisTurn += 1;
  state.mustAttackSatisfied = true;

  let conquered = false;
  let usedCardId = preCards[0]?.entry?.cardId || postCards[0]?.entry?.cardId || null;

  if (to.armies <= 0) {
    const prevOwner = to.owner;
    to.owner = pid;
    const moveMax = from.armies - 1;
    const auto = state.players[pid].isHuman ? 1 : Math.max(1, Math.min(moveMax, ctx.attDiceCount));
    from.armies -= auto;
    to.armies = auto;
    const conquerFx = getRelicEffectByType(state, pid, 'conquer_bonus_army');
    if (conquerFx?.type === 'conquer_bonus_army') {
      const max = conquerFx.maxPerTurn ?? Infinity;
      const used = state.players[pid].aggressorUsesThisTurn ?? 0;
      if (used < max) {
        to.armies += conquerFx.value;
        state.players[pid].aggressorUsesThisTurn = used + 1;
      }
    }
    conquered = true;
    state.conqueredThisTurn = true;
    state.conquersThisTurn = (state.conquersThisTurn ?? 0) + 1;
    if (state.players[pid].isHuman && from.armies > 1) {
      state.pendingInvasion = { from: ctx.from, to: ctx.to };
    }
    log(
      state,
      `Conquista ${TERRITORIES[ctx.to].name}! (${attDice.join(',')} vs ${defDice.join(',')})`,
      { type: 'conquer' },
    );
    if (getPlayerTerritories(state, prevOwner).length === 0) {
      checkVictory(state);
    }
  } else {
    if (playerHasRelic(state, defPid, 'redoubt_defense') && !state.players[defPid].redoubtUsedThisTurn) {
      to.armies += getRelicEffectByType(state, defPid, 'redoubt_defense').value ?? 1;
      state.players[defPid].redoubtUsedThisTurn = true;
      log(state, `Ridotta: +1 su ${TERRITORIES[ctx.to].name}.`);
    }
    log(state, `Battaglia ${TERRITORIES[ctx.from].name}→${TERRITORIES[ctx.to].name}: ${attDice.join(',')} vs ${defDice.join(',')}`);
  }

  state.lastBattle = {
    from: ctx.from,
    to: ctx.to,
    attDice,
    defDice,
    attLoss,
    defLoss,
    conquered,
  };
  state.combatContext = null;
  state.pendingCombatCard = null;
}

function getStackActions(state, actorId) {
  const actions = [];
  if (state.vanillaMode) return actions;

  if (state.pendingCast) {
    const pc = state.pendingCast;
    if (actorId === pc.playerId) {
      if (!pc.needsDiePick || pc.targets?.dieIndex != null) {
        actions.push({ type: 'CAST_CONFIRM', playerId: actorId });
      }
      actions.push({ type: 'CAST_CANCEL', playerId: actorId });
      if (pc.needsDiePick) {
        const ctx = state.combatContext;
        if (ctx) {
          const isAtt = actorId === ctx.attackerId;
          const dice = isAtt ? ctx.rawAttDice : ctx.rawDefDice;
          for (let i = 0; i < dice.length; i++) {
            actions.push({ type: 'SET_CAST_DIE', dieIndex: i, playerId: actorId });
          }
        }
      }
    }
    return actions;
  }

  if (state.responseWindow) {
    const passed = state.responseWindow.passedPlayerIds || [];
    if (actorId && !passed.includes(actorId)) {
      actions.push({ type: 'PASS_STACK', playerId: actorId });
    }
  }

  if (!state.responseWindow) {
    const pid = state.currentPlayerId;
    if (actorId !== pid) return actions;
    if (state.combatContext) return actions;
    for (let i = 0; i < state.players[pid].hand.length; i++) {
      const card = getCard(state.players[pid].hand[i]);
      if (
        card?.timing === 'action' &&
        isHandPlayable(card, state.phase) &&
        canStartCast(state, pid, card)
      ) {
        actions.push({ type: 'CAST_START', handIndex: i, playerId: pid });
      }
    }
    return actions;
  }

  for (const pid of state.playerOrder) {
    if (actorId && actorId !== pid) continue;
    const hand = state.players[pid].hand;
    for (let i = 0; i < hand.length; i++) {
      const card = getCard(hand[i]);
      if (!card) continue;
      if (card.timing === 'instant' && canRespondInstant(state, pid) && canStartCast(state, pid, card)) {
        actions.push({ type: 'CAST_START', handIndex: i, playerId: pid });
      }
      if (card.timing === 'combat' && canCastCombat(state, pid) && canStartCast(state, pid, card)) {
        actions.push({ type: 'CAST_START', handIndex: i, playerId: pid });
      }
    }
  }
  return actions;
}

function resolveBastionChoice(state, action) {
  if (!state.pendingBastion) return state;
  const pending = state.pendingBastion;
  state.pendingBastion = null;
  return resolveAttack(state, {
    type: 'ATTACK',
    from: pending.from,
    to: pending.to,
    attackDice: pending.attackDice,
    useBastion: !!action.use,
    nowMs: action.nowMs,
  });
}

function skipRecycle(state) {
  if (!state.pendingRecycle) return state;
  state.pendingRecycle = false;
  log(state, 'Riciclaggio: passi.');
  return state;
}

function recycleCard(state, action) {
  if (!state.pendingRecycle) return state;
  const pid = state.currentPlayerId;
  const handIndex = action.handIndex;
  const cardId = state.players[pid].hand[handIndex];
  if (!cardId) return state;
  state.players[pid].hand.splice(handIndex, 1);
  state.cardDiscard.push(cardId);
  state.pendingRecycle = false;
  const result = drawCard(state, pid);
  if (result?.needsDiscard) {
    state.pendingDrawAfterDiscard = true;
    log(state, 'Riciclaggio: mano piena — scarta 1 carta per pescare.');
  } else if (result?.cardId) {
    log(state, `Riciclaggio: scarti ${getCard(cardId).name}, peschi ${getCard(result.cardId).name}.`);
  } else {
    log(state, `Riciclaggio: scarti ${getCard(cardId).name}.`);
  }
  return state;
}

function resolveAttack(state, action) {
  const nowMs = stackNow(action);
  if (state.phase !== 'attack') return state;
  if (state.pendingInvasion || state.combatContext || state.responseWindow) {
    log(state, 'Combattimento o stack in corso.');
    return state;
  }
  const pid = state.currentPlayerId;
  const from = state.territories[action.from];
  const to = state.territories[action.to];
  if (!from || !to) return state;
  if (from.owner !== pid || to.owner === pid) return state;
  if (!areAdjacent(action.from, action.to)) return state;
  if (from.armies < 2) return state;
  if (isTerritoryIsolated(state, action.from)) {
    log(state, 'Territorio isolato: non può attaccare.');
    return state;
  }

  const defPid = to.owner;
  const fromArmiesBefore = from.armies;

  let useBastion = false;
  if (defPid !== pid && canUseBastion(state, defPid)) {
    if (action.useBastion === undefined && state.players[defPid].isHuman) {
      state.pendingBastion = {
        defenderId: defPid,
        from: action.from,
        to: action.to,
        attackDice: action.attackDice,
      };
      return state;
    }
    useBastion =
      action.useBastion === true ||
      (action.useBastion !== false &&
        !state.players[defPid].isHuman &&
        aiShouldUseBastion(state, defPid, action.to, action.attackDice ?? 3));
    if (useBastion) {
      state.players[defPid].bastionUsedRound = state.round;
      log(state, `${playerName(state, defPid)} usa Bastione (in risoluzione).`);
    }
  }

  let attDiceCount = Math.min(action.attackDice ?? 3, from.armies - 1, 3);
  let defDiceCount = Math.min(2, to.armies);
  const event = getActiveEvent(state);
  const attImmune = event?.tag === 'harm' && isImmuneToHarm(state, pid);
  const defImmune = event?.tag === 'harm' && isImmuneToHarm(state, defPid);
  if (event?.effect?.type === 'dice_cap') {
    if (!attImmune) attDiceCount = Math.min(attDiceCount, event.effect.attack);
    if (!defImmune) defDiceCount = Math.min(defDiceCount, event.effect.defend);
  }

  let rawAttDice = rollDice(attDiceCount, state.rng);
  let rawDefDice = rollDice(defDiceCount, state.rng);
  if (event?.effect?.type === 'attack_high_die_penalty' && !attImmune) {
    rawAttDice[0] = applyDieBonus(rawAttDice[0], -event.effect.value);
  }
  rawAttDice.sort((a, b) => b - a);
  rawDefDice.sort((a, b) => b - a);

  state.combatContext = {
    from: action.from,
    to: action.to,
    attackerId: pid,
    defenderId: defPid,
    attDiceCount,
    fromArmiesBefore,
    useBastion,
    rawAttDice,
    rawDefDice,
    pendingCombatCards: [],
  };

  openResponseWindow(state, 'combat', nowMs);
  log(
    state,
    `Attacco ${TERRITORIES[action.from].name}→${TERRITORIES[action.to].name}: dadi ${rawAttDice.join(',')} vs ${rawDefDice.join(',')} — finestra risposta.`,
  );
  state.lastBattle = {
    from: action.from,
    to: action.to,
    attDice: rawAttDice,
    defDice: rawDefDice,
    pending: true,
  };
  return state;
}

function confirmInvasion(state, action) {
  const pending = state.pendingInvasion;
  if (!pending) return state;
  const from = state.territories[pending.from];
  const to = state.territories[pending.to];
  if (!from || !to || from.owner !== state.currentPlayerId || to.owner !== state.currentPlayerId) {
    state.pendingInvasion = null;
    return state;
  }

  const pool = from.armies + to.armies;
  const maxInConquered = pool - 1; // leave at least 1 in origin
  let target = action.armies ?? to.armies;
  target = Math.max(1, Math.min(target, maxInConquered));
  from.armies = pool - target;
  to.armies = target;
  state.pendingInvasion = null;
  log(
    state,
    `Invasione: ${target} armate in ${TERRITORIES[pending.to].name}, ${from.armies} restano in ${TERRITORIES[pending.from].name}.`
  );
  return state;
}

function fortify(state, action) {
  if (state.phase !== 'fortify') return state;
  const pid = state.currentPlayerId;
  const from = state.territories[action.from];
  const to = state.territories[action.to];
  if (!from || !to || from.owner !== pid || to.owner !== pid) return state;
  if (isTerritoryIsolated(state, action.from)) {
    log(state, 'Territorio isolato: non può spostare armate.');
    return state;
  }
  if (!canFortifyBetween(state, action.from, action.to)) return state;

  const isExtra = state.fortifyUsed && state.extraFortifyRemaining > 0;
  if (state.fortifyUsed && !isExtra) {
    log(state, 'Spostamento già usato.');
    return state;
  }

  let armies = action.armies ?? 1;
  if (isExtra) armies = Math.min(1, armies);
  if (armies < 1 || from.armies - armies < 1) return state;

  from.armies -= armies;
  to.armies += armies;
  if (isExtra) {
    state.extraFortifyRemaining -= 1;
    log(state, `Spostamento extra: ${armies} → ${TERRITORIES[action.to].name}.`);
  } else {
    state.fortifyUsed = true;
    log(state, `Spostamento: ${armies} da ${TERRITORIES[action.from].name} a ${TERRITORIES[action.to].name}.`);
  }
  return state;
}

function tradeClassicCards(state, action) {
  if (!state.vanillaMode || state.phase !== 'reinforce') return state;
  const pid = state.currentPlayerId;
  const hand = state.players[pid].hand;
  const indices = [...(action.handIndices || [])].sort((a, b) => b - a);
  if (!isValidClassicSet(hand, indices)) {
    log(state, 'Set non valido: 3 uguali o 1 per simbolo.');
    return state;
  }

  const traded = [];
  for (const idx of indices) {
    traded.push(hand.splice(idx, 1)[0]);
  }
  state.cardDiscard.push(...traded);

  let bonus = classicTradeValue(state.classicTrades || 0);
  state.classicTrades = (state.classicTrades || 0) + 1;
  let ownedBonus = 0;
  for (const tid of traded) {
    if (state.territories[tid]?.owner === pid) {
      state.territories[tid].armies += 2;
      ownedBonus += 2;
      log(state, `Bonus territorio: +2 su ${TERRITORIES[tid].name}.`);
    }
  }
  state.reinforcementsRemaining += bonus;
  log(
    state,
    `Scambi un set (+${bonus} rinforzi${ownedBonus ? `, +${ownedBonus} sui tuoi territori carta` : ''}).`,
  );

  if (state.pendingClassicDraw) {
    state.pendingClassicDraw = false;
    const r = drawCard(state, pid);
    if (r?.cardId) {
      log(state, `Pesci ${classicCardLogName(r.cardId)}.`);
    } else if (r?.needsTrade) {
      state.pendingClassicDraw = true;
      log(state, 'Mano piena: scambia un altro set per pescare.');
    }
  }
  return state;
}

function discardForDraw(state, action) {
  const pid = state.currentPlayerId;
  if (!state.pendingDrawAfterDiscard) return state;
  const idx = action.handIndex ?? 0;
  if (idx < 0 || idx >= state.players[pid].hand.length) return state;
  const discarded = state.players[pid].hand.splice(idx, 1)[0];
  state.cardDiscard.push(discarded);
  state.pendingDrawAfterDiscard = false;
  const r = drawCard(state, pid);
  if (r?.cardId) log(state, `Scarti ${getCard(discarded).name}, peschi ${getCard(r.cardId).name}.`);
  return state;
}

export function getTerritoryInfo() {
  return TERRITORIES;
}

export function getContinents() {
  return CONTINENTS;
}

export { ADJACENCY, TERRITORIES, CONTINENTS, getClassicCard, isClassicCardId };
export { CARDS, getCard, isCombatCard, isHandPlayable } from '../data/cards.js';
export { RELICS, RELIC_IDS } from '../data/relics.js';
export { EVENTS } from '../data/events.js';
export { MISSIONS } from '../data/missions.js';
export { windowRemainingMs, STACK_WINDOW_MS, canEndPhaseNow, canStartCast } from './stack.js';
