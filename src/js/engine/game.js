import {
  TERRITORIES,
  CONTINENTS,
  buildAdjacencyMap,
  TERRITORY_IDS,
  INITIAL_ARMIES_BY_PLAYERS,
} from '../data/map.js';
import { RELICS, RELIC_IDS } from '../data/relics.js';
import { CARDS, createCardDeck } from '../data/cards.js';
import { EVENTS, createEventDeck } from '../data/events.js';
import { MISSIONS, MISSION_IDS, checkMission } from '../data/missions.js';
import { createRng } from './rng.js';

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
  for (const cont of Object.values(CONTINENTS)) {
    if (cont.territories.every((id) => state.territories[id].owner === playerId)) {
      bonus += cont.bonus;
    }
  }
  return bonus;
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
  const relicId = state.players[playerId].relicId;
  return relicId && RELICS[relicId]?.effect?.type === effectType;
}

export function getRelicEffect(state, playerId) {
  const relicId = state.players[playerId].relicId;
  return relicId ? RELICS[relicId].effect : null;
}

export function getActiveEvent(state) {
  return state.activeEventId ? EVENTS[state.activeEventId] : null;
}

export function isImmuneToHarm(state, playerId) {
  return playerHasRelic(state, playerId, 'immune_harm_events');
}

export function handLimit(state, playerId) {
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
  if (state.cardDeck.length === 0) {
    if (state.cardDiscard.length === 0) return null;
    state.cardDeck = state.rng.shuffle(state.cardDiscard);
    state.cardDiscard = [];
  }
  const limit = handLimit(state, playerId);
  if (p.hand.length >= limit) return { needsDiscard: true };
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
  state.attacksThisTurn = 0;
  state.fortifyUsed = false;
  state.extraFortifyUsed = false;
  state.pendingCombatCard = null;
  state.pendingInvasion = null;
  state.mustAttackSatisfied = false;
  state.reinforcementsRemaining = computeReinforcements(state, state.currentPlayerId);
  ensureStartTurnEffects(state);
  const p = state.players[state.currentPlayerId];
  log(state, `${p.name} — rinforzi: ${state.reinforcementsRemaining}.`);
}

function revealEvent(state) {
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
 * @param {{ seed?: number, humanId?: string, playerCount?: number, aiCount?: number }} opts
 */
export function createGame(opts = {}) {
  const rng = createRng(opts.seed ?? Date.now());
  const humanId = opts.humanId ?? 'P1';
  const fromAi = opts.aiCount != null ? 1 + Number(opts.aiCount) : null;
  const playerCount = Math.min(
    MAX_PLAYERS,
    Math.max(MIN_PLAYERS, Number(opts.playerCount ?? fromAi ?? 2))
  );
  const playerOrder = PLAYER_SLOTS.slice(0, playerCount).map((s) => s.id);
  const startArmies = INITIAL_ARMIES_BY_PLAYERS[playerCount] ?? INITIAL_ARMIES_BY_PLAYERS[2];

  const players = {};
  for (const slot of PLAYER_SLOTS.slice(0, playerCount)) {
    const isHuman = slot.id === humanId;
    players[slot.id] = {
      id: slot.id,
      name: isHuman ? 'Tu' : slot.name,
      isHuman,
      color: slot.color,
      relicId: null,
      missionId: null,
      missionTargetId: null,
      hand: [],
      setupRemaining: 0,
    };
  }

  const relicPool = rng.shuffle(RELIC_IDS);
  const missionPool = rng.shuffle(MISSION_IDS);
  const othersOf = (pid) => playerOrder.filter((id) => id !== pid);

  playerOrder.forEach((pid, i) => {
    players[pid].relicId = relicPool[i];
    players[pid].missionId = missionPool[i];
    if (players[pid].missionId === 'eliminate_enemy') {
      const others = othersOf(pid);
      players[pid].missionTargetId = others.length ? rng.pick(others) : null;
    }
  });

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
    attacksThisTurn: 0,
    fortifyUsed: false,
    extraFortifyUsed: false,
    mustAttackSatisfied: false,
    pendingCombatCard: null,
    pendingInvasion: null,
    cardDeck: createCardDeck(rng),
    cardDiscard: [],
    eventDeck: createEventDeck(rng),
    activeEventId: null,
    winnerId: null,
    lastBattle: null,
    log: [],
  };

  log(state, `Partita iniziata (${playerCount} giocatori, seed ${state.seed}).`);
  log(state, `Schieramento: 1 armata per territorio; ${startArmies} armate a testa, il resto a turni.`);
  for (const pid of playerOrder) {
    const p = players[pid];
    log(state, `${p.name} reliquia: ${RELICS[p.relicId].name}. Obiettivo segreto assegnato.`);
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
  return JSON.parse(JSON.stringify({ ...rest, seed: state.seed, rngState: undefined }));
}

export function getLegalActions(state) {
  if (state.phase === 'game_over') return [];
  const pid = state.currentPlayerId;
  const actions = [];

  if (state.phase === 'setup') {
    if (state.players[pid].setupRemaining > 0) {
      for (const tid of getPlayerTerritories(state, pid)) {
        actions.push({ type: 'PLACE_REINFORCEMENT', territoryId: tid });
      }
    }
    return actions;
  }

  if (state.phase === 'reinforce') {
    if (state.reinforcementsRemaining > 0) {
      for (const tid of getPlayerTerritories(state, pid)) {
        actions.push({ type: 'PLACE_REINFORCEMENT', territoryId: tid });
      }
    } else {
      actions.push({ type: 'END_PHASE' });
    }
  }

  if (state.phase === 'attack') {
    actions.push({ type: 'END_PHASE' });
    for (const from of getPlayerTerritories(state, pid)) {
      if (state.territories[from].armies < 2) continue;
      for (const to of ADJACENCY[from]) {
        if (state.territories[to].owner !== pid) {
          actions.push({ type: 'ATTACK', from, to, attackDice: Math.min(3, state.territories[from].armies - 1) });
        }
      }
    }
  }

  if (state.phase === 'fortify') {
    actions.push({ type: 'END_PHASE' });
    const canMain = !state.fortifyUsed;
    const canExtra =
      playerHasRelic(state, pid, 'extra_fortify_move') &&
      state.fortifyUsed &&
      !state.extraFortifyUsed;
    if (canMain || canExtra) {
      const maxMove = canExtra ? 1 : 999;
      for (const from of getPlayerTerritories(state, pid)) {
        if (state.territories[from].armies < 2) continue;
        for (const to of getPlayerTerritories(state, pid)) {
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

  // Action cards
  for (let i = 0; i < state.players[pid].hand.length; i++) {
    const cardId = state.players[pid].hand[i];
    const card = CARDS[cardId];
    if (card.type !== 'action') continue;
    if (!card.phases.includes(state.phase)) continue;
    actions.push({ type: 'PLAY_ACTION_CARD', handIndex: i, cardId });
  }

  return actions;
}

/**
 * Apply an action; mutates and returns state (clone-on-write style: caller may clone first).
 */
export function applyAction(state, action) {
  if (state.phase === 'game_over') return state;

  if (state.pendingInvasion && action.type !== 'CONFIRM_INVASION') {
    if (action.type !== 'SET_COMBAT_CARD') {
      log(state, 'Completa prima lo spostamento nella zona conquistata.');
      return state;
    }
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
    case 'PLAY_ACTION_CARD':
      return playActionCard(state, action);
    case 'SET_COMBAT_CARD':
      state.pendingCombatCard = action.handIndex ?? null;
      return state;
    case 'DISCARD_FOR_DRAW':
      return discardForDraw(state, action);
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

  if (state.pendingInvasion) {
    log(state, 'Completa prima lo spostamento nella zona conquistata.');
    return state;
  }

  if (state.phase === 'reinforce') {
    if (state.reinforcementsRemaining > 0) {
      log(state, 'Devi piazzare tutti i rinforzi.');
      return state;
    }
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

    if (state.conqueredThisTurn) {
      const result = drawCard(state, pid);
      if (result?.needsDiscard) {
        state.pendingDrawAfterDiscard = true;
        log(state, 'Mano piena: scarta 1 carta per pescare.');
        // Auto-discard oldest for AI / simplicity if discard not provided — UI handles
      } else if (result?.cardId) {
        log(state, `Pesci ${CARDS[result.cardId].name}.`);
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

function resolveAttack(state, action) {
  if (state.phase !== 'attack') return state;
  if (state.pendingInvasion) {
    log(state, 'Completa prima lo spostamento nella zona conquistata.');
    return state;
  }
  const pid = state.currentPlayerId;
  const from = state.territories[action.from];
  const to = state.territories[action.to];
  if (!from || !to) return state;
  if (from.owner !== pid || to.owner === pid) return state;
  if (!areAdjacent(action.from, action.to)) return state;
  if (from.armies < 2) return state;

  let attDiceCount = Math.min(action.attackDice ?? 3, from.armies - 1, 3);
  let defDiceCount = Math.min(2, to.armies);

  const event = getActiveEvent(state);
  const attImmune = event?.tag === 'harm' && isImmuneToHarm(state, pid);
  const defImmune = event?.tag === 'harm' && isImmuneToHarm(state, to.owner);

  if (event?.effect?.type === 'dice_cap') {
    if (!attImmune) attDiceCount = Math.min(attDiceCount, event.effect.attack);
    if (!defImmune) defDiceCount = Math.min(defDiceCount, event.effect.defend);
  }

  let attDice = rollDice(attDiceCount, state.rng);
  let defDice = rollDice(defDiceCount, state.rng);

  // Relic: first strike — add virtual +1 to highest attack die on first attack
  if (state.attacksThisTurn === 0 && playerHasRelic(state, pid, 'first_attack_bonus_die')) {
    attDice[0] = applyDieBonus(attDice[0], 1);
  }

  // Relic: lucky die — +1 to lowest attack die
  if (playerHasRelic(state, pid, 'attack_low_die_bonus')) {
    const idx = attDice.length - 1;
    attDice[idx] = applyDieBonus(attDice[idx], getRelicEffect(state, pid).value);
  }

  // Relic: iron shield on defender
  if (playerHasRelic(state, to.owner, 'defend_high_die_bonus')) {
    defDice[0] = applyDieBonus(defDice[0], getRelicEffect(state, to.owner).value);
  }

  // Event storm
  if (event?.effect?.type === 'attack_high_die_penalty' && !attImmune) {
    attDice[0] = applyDieBonus(attDice[0], -event.effect.value);
  }

  // Combat card from attacker
  let usedCardId = null;
  let handIndex = state.pendingCombatCard;
  if (handIndex != null && handIndex >= 0) {
    const cardId = state.players[pid].hand[handIndex];
    const card = CARDS[cardId];
    if (card?.type === 'combat') {
      usedCardId = cardId;
      if (card.effect.type === 'att_high_die_bonus') {
        attDice[0] = applyDieBonus(attDice[0], card.effect.value);
      } else if (card.effect.type === 'att_reroll_low') {
        const idx = attDice.length - 1;
        attDice[idx] = 1 + state.rng.int(6);
        attDice.sort((a, b) => b - a);
      } else if (card.effect.type === 'def_high_die_penalty') {
        defDice[0] = applyDieBonus(defDice[0], -card.effect.value);
      } else if (card.effect.type === 'def_high_die_bonus') {
        // Attacker playing fortify_die doesn't make sense — ignore unless we allow defending card later
      }
      state.players[pid].hand.splice(handIndex, 1);
      state.cardDiscard.push(cardId);
    }
  }
  state.pendingCombatCard = null;

  // Re-sort after mods
  attDice.sort((a, b) => b - a);
  defDice.sort((a, b) => b - a);

  const pairs = Math.min(attDice.length, defDice.length);
  let attLoss = 0;
  let defLoss = 0;
  for (let i = 0; i < pairs; i++) {
    if (attDice[i] > defDice[i]) defLoss += 1;
    else attLoss += 1;
  }

  from.armies -= attLoss;
  to.armies -= defLoss;

  state.attacksThisTurn += 1;
  state.mustAttackSatisfied = true;

  let conquered = false;
  if (to.armies <= 0) {
    const prevOwner = to.owner;
    to.owner = pid;
    // Temporary: move 1 army so territory is occupied; player/AI then chooses final transfer
    const moveMax = from.armies - 1;
    const moveMin = 1;
    const requested = action.moveArmies;
    const auto =
      requested != null
        ? Math.min(Math.max(moveMin, requested), moveMax)
        : state.players[pid].isHuman
          ? moveMin
          : Math.max(moveMin, Math.min(moveMax, attDiceCount));
    from.armies -= auto;
    to.armies = auto;
    if (playerHasRelic(state, pid, 'conquer_bonus_army')) {
      to.armies += getRelicEffect(state, pid).value;
    }
    conquered = true;
    state.conqueredThisTurn = true;

    // Human chooses final garrison (1 .. leave 1 behind)
    if (state.players[pid].isHuman && from.armies > 1 && requested == null) {
      state.pendingInvasion = {
        from: action.from,
        to: action.to,
      };
    } else {
      state.pendingInvasion = null;
    }

    log(
      state,
      `Conquista ${TERRITORIES[action.to].name}! (${attDice.join(',')} vs ${defDice.join(',')})` +
        (usedCardId ? ` [carta ${CARDS[usedCardId].name}]` : '') +
        ` · ${auto} armate avanzano`,
      { type: 'conquer' }
    );
    if (getPlayerTerritories(state, prevOwner).length === 0) {
      log(state, `${state.players[pid].name} elimina ${state.players[prevOwner].name}!`, { type: 'victory' });
      checkVictory(state);
    }
  } else {
    log(
      state,
      `Attacco ${TERRITORIES[action.from].name}→${TERRITORIES[action.to].name}: ` +
        `${attDice.join(',')} vs ${defDice.join(',')} (att -${attLoss}, dif -${defLoss})` +
        (usedCardId ? ` [${CARDS[usedCardId].name}]` : '')
    );
  }

  state.lastBattle = {
    from: action.from,
    to: action.to,
    attDice,
    defDice,
    attLoss,
    defLoss,
    conquered,
    card: usedCardId,
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
  if (!canFortifyBetween(state, action.from, action.to)) return state;

  const isExtra =
    state.fortifyUsed &&
    playerHasRelic(state, pid, 'extra_fortify_move') &&
    !state.extraFortifyUsed;
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
    state.extraFortifyUsed = true;
    log(state, `Spostamento extra: ${armies} → ${TERRITORIES[action.to].name}.`);
  } else {
    state.fortifyUsed = true;
    log(state, `Spostamento: ${armies} da ${TERRITORIES[action.from].name} a ${TERRITORIES[action.to].name}.`);
  }
  return state;
}

function playActionCard(state, action) {
  const pid = state.currentPlayerId;
  const handIndex = action.handIndex;
  const cardId = state.players[pid].hand[handIndex];
  if (!cardId) return state;
  const card = CARDS[cardId];
  if (card.type !== 'action') return state;
  if (!card.phases.includes(state.phase)) return state;

  // Remove card first
  state.players[pid].hand.splice(handIndex, 1);
  state.cardDiscard.push(cardId);

  switch (card.effect.type) {
    case 'add_armies': {
      const tid = action.territoryId ?? getPlayerTerritories(state, pid)[0];
      if (state.territories[tid]?.owner === pid) {
        state.territories[tid].armies += card.effect.value;
        log(state, `${card.name}: +${card.effect.value} su ${TERRITORIES[tid].name}.`);
      }
      break;
    }
    case 'free_move': {
      const from = action.from;
      const to = action.to;
      const n = Math.min(action.armies ?? card.effect.value, card.effect.value);
      if (
        from &&
        to &&
        state.territories[from]?.owner === pid &&
        state.territories[to]?.owner === pid &&
        areAdjacent(from, to) &&
        state.territories[from].armies - n >= 1 &&
        n >= 1
      ) {
        state.territories[from].armies -= n;
        state.territories[to].armies += n;
        log(state, `${card.name}: ${n} armate spostate.`);
      } else {
        log(state, `${card.name}: movimento non valido, carta comunque spesa.`);
      }
      break;
    }
    case 'draw': {
      for (let i = 0; i < card.effect.value; i++) {
        const r = drawCard(state, pid);
        if (r?.cardId) log(state, `Pesci ${CARDS[r.cardId].name}.`);
        else if (r?.needsDiscard) {
          // discard oldest
          const discarded = state.players[pid].hand.shift();
          if (discarded) state.cardDiscard.push(discarded);
          const r2 = drawCard(state, pid);
          if (r2?.cardId) log(state, `Scarti e peschi ${CARDS[r2.cardId].name}.`);
        }
      }
      break;
    }
    case 'damage_adjacent_enemy': {
      const tid = action.territoryId;
      const t = state.territories[tid];
      if (t && t.owner !== pid && t.armies > 1) {
        const near = ADJACENCY[tid].some((n) => state.territories[n].owner === pid);
        if (near) {
          t.armies -= card.effect.value;
          log(state, `${card.name}: ${TERRITORIES[tid].name} -${card.effect.value}.`);
        }
      }
      break;
    }
    default:
      break;
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
  if (r?.cardId) log(state, `Scarti ${CARDS[discarded].name}, peschi ${CARDS[r.cardId].name}.`);
  return state;
}

export function getTerritoryInfo() {
  return TERRITORIES;
}

export function getContinents() {
  return CONTINENTS;
}

export { ADJACENCY, CARDS, RELICS, EVENTS, TERRITORIES, CONTINENTS, MISSIONS };
