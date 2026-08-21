/**
 * Unified interactive choice prompts (Arcana, Ponder, Furto, jolly, Veggente, …).
 */

import { RELICS, RELIC_IDS } from '../data/relics.js';
import { getCard } from '../data/cards.js';
import { MISSIONS } from '../data/missions.js';

function getAlivePlayerIds(state) {
  return state.playerOrder.filter((id) => {
    const p = state.players[id];
    return p && Object.values(state.territories).some((t) => t.owner === id);
  });
}

export function hasPendingChoice(state) {
  return !!state.pendingChoice;
}

export function getChoiceActor(state) {
  return state.pendingChoice?.actorId ?? null;
}

function ownedRelicIds(state) {
  const owned = new Set();
  for (const id of state.playerOrder) {
    const p = state.players[id];
    if (p.relicId) owned.add(p.relicId);
    for (const rid of p.extraRelicIds || []) owned.add(rid);
  }
  return owned;
}

function nextPlayerInOrder(state, afterId) {
  const order = state.playerOrder;
  const idx = order.indexOf(afterId);
  if (idx < 0) return order[0];
  return order[(idx + 1) % order.length];
}

function cardItems(state, cardIds) {
  return cardIds.map((id) => {
    const c = getCard(id);
    return {
      type: 'card',
      id,
      name: c?.name || id,
      description: c?.description || '',
      timing: c?.timing || '',
      rarity: c?.rarity || '',
    };
  });
}

function relicItems(relicIds) {
  return relicIds.map((id) => {
    const r = RELICS[id];
    return {
      type: 'relic',
      id,
      name: r?.name || id,
      description: r?.description || '',
    };
  });
}

function opponentsWithCards(state, fromId) {
  return getAlivePlayerIds(state).filter(
    (id) => id !== fromId && (state.players[id].hand?.length || 0) > 0,
  );
}

/** @returns {boolean} true if choice was started (human must pick) */
export function beginArcanaDraft(state, casterId, log) {
  const n = state.playerOrder.length;
  const owned = ownedRelicIds(state);
  const available = RELIC_IDS.filter((id) => !owned.has(id));
  const pool = state.rng.shuffle([...available]).slice(0, n);
  if (!pool.length) {
    log('Arcana: nessuna reliquia disponibile.');
    return false;
  }
  state.pendingChoice = {
    kind: 'arcana',
    actorId: casterId,
    prompt: 'Seleziona una reliquia',
    items: relicItems(pool),
    meta: { pool: [...pool], casterId },
  };
  log(`Arcana: ${pool.length} reliquie — ${state.players[casterId].name} sceglie per primo.`);
  return true;
}

export function beginSurveilChoice(state, playerId, card, seen, take, log) {
  if (!seen.length) return false;
  if (!state.players[playerId].isHuman) return false;
  state.pendingChoice = {
    kind: 'surveil',
    actorId: playerId,
    prompt: take > 1 ? `Seleziona ${take} carte da aggiungere alla mano` : 'Seleziona la carta da aggiungere alla mano',
    items: cardItems(state, seen),
    maxPick: Math.min(take, seen.length),
    picked: [],
    meta: { seen: [...seen], cardName: card.name },
  };
  log(`${card.name}: guardi ${seen.length} carte del mazzo.`);
  return true;
}

export function beginScryChoice(state, playerId, topCardId, log) {
  const c = getCard(topCardId);
  state.pendingChoice = {
    kind: 'scry',
    actorId: playerId,
    prompt: 'Veggente: cima del mazzo — pesca o metti in fondo?',
    items: cardItems(state, [topCardId]),
    meta: { topCardId },
  };
  log(`Veggente: cima del mazzo — ${c?.name || topCardId}.`);
  return true;
}

export function beginStealChoice(state, playerId, card, log) {
  const opps = opponentsWithCards(state, playerId);
  if (!opps.length) return false;
  if (!state.players[playerId].isHuman) return false;
  state.pendingChoice = {
    kind: 'steal',
    step: 'player',
    actorId: playerId,
    prompt: 'Seleziona il giocatore da cui rubare',
    items: opps.map((id) => ({
      type: 'player',
      id,
      name: state.players[id].name,
    })),
    meta: { cardName: card.name },
  };
  log(`${card.name}: scegli un avversario.`);
  return true;
}

function beginStealCardChoice(state, playerId, card, targetId, log) {
  const hand = state.players[targetId].hand || [];
  if (!hand.length) return false;
  state.pendingChoice = {
    kind: 'steal',
    step: 'card',
    actorId: playerId,
    prompt: 'Seleziona la carta da rubare',
    items: cardItems(state, hand),
    meta: { cardName: card.name, targetPlayerId: targetId },
  };
  log(`${card.name}: guardi la mano di ${state.players[targetId].name}.`);
  return true;
}

export function beginSabotageChoice(state, playerId, card, log) {
  const opps = getAlivePlayerIds(state).filter((id) => id !== playerId);
  if (!opps.length) return false;
  if (!state.players[playerId].isHuman) return false;
  state.pendingChoice = {
    kind: 'sabotage',
    step: 'player',
    actorId: playerId,
    prompt: 'Seleziona il giocatore bersaglio',
    items: opps.map((id) => ({
      type: 'player',
      id,
      name: state.players[id].name,
      handCount: state.players[id].hand?.length || 0,
    })),
    meta: { cardName: card.name },
  };
  log(`${card.name}: scegli un avversario.`);
  return true;
}

function beginSabotageCardChoice(state, playerId, card, targetId, log) {
  const hand = state.players[targetId].hand || [];
  if (!hand.length) return false;
  state.pendingChoice = {
    kind: 'sabotage',
    step: 'card',
    actorId: playerId,
    prompt: 'Seleziona la carta da far scartare',
    items: cardItems(state, hand),
    meta: { cardName: card.name, targetPlayerId: targetId },
  };
  log(`${card.name}: scegli una carta da far scartare a ${state.players[targetId].name}.`);
  return true;
}

export function beginOmniscienceChoice(state, playerId, card, log) {
  const queue = getAlivePlayerIds(state).filter(
    (id) => id !== playerId && (state.players[id].hand?.length || 0) > 0,
  );
  if (!queue.length) return false;
  if (!state.players[playerId].isHuman) return false;
  return advanceOmniscienceStep(state, playerId, card, queue, 0, log);
}

function advanceOmniscienceStep(state, playerId, card, queue, index, log) {
  if (index >= queue.length) return false;
  const targetId = queue[index];
  const hand = state.players[targetId].hand || [];
  state.pendingChoice = {
    kind: 'omniscience',
    actorId: playerId,
    prompt: `Seleziona la carta da scartare (${state.players[targetId].name})`,
    items: cardItems(state, hand),
    meta: { cardName: card.name, targetPlayerId: targetId, queue, queueIndex: index },
  };
  log(`${card.name}: mano di ${state.players[targetId].name}.`);
  return true;
}

export function beginTurncoatChoice(state, playerId, card, log) {
  const opps = getAlivePlayerIds(state).filter((id) => id !== playerId);
  if (!opps.length) return false;
  if (!state.players[playerId].isHuman) return false;
  if (opps.length === 1) {
    return beginTurncoatConfirm(state, playerId, card, opps[0], log);
  }
  state.pendingChoice = {
    kind: 'turncoat',
    step: 'player',
    actorId: playerId,
    prompt: 'Seleziona il giocatore di cui vedere l\'obiettivo',
    items: opps.map((id) => ({
      type: 'player',
      id,
      name: state.players[id].name,
    })),
    meta: { cardName: card.name },
  };
  log(`${card.name}: scegli un avversario.`);
  return true;
}

function missionSummary(state, pid) {
  const m = MISSIONS[state.players[pid].missionId];
  if (!m) return { name: '—', description: '' };
  let description = m.description;
  if (state.players[pid].missionId === 'eliminate_enemy' && state.players[pid].missionTargetId) {
    const target = state.players[state.players[pid].missionTargetId];
    if (target) description += ` (${target.name})`;
  }
  return { name: m.name, description };
}

function beginTurncoatConfirm(state, playerId, card, targetId, log) {
  const mine = missionSummary(state, playerId);
  const theirs = missionSummary(state, targetId);
  state.pendingChoice = {
    kind: 'turncoat',
    step: 'confirm',
    actorId: playerId,
    prompt: `Scambiare il tuo obiettivo con quello di ${state.players[targetId].name}?`,
    items: [
      { type: 'mission', id: 'yours', name: `Tuo: ${mine.name}`, description: mine.description },
      { type: 'mission', id: 'theirs', name: `Suo: ${theirs.name}`, description: theirs.description },
    ],
    meta: { cardName: card.name, targetPlayerId: targetId },
  };
  log(`${card.name}: obiettivo di ${state.players[targetId].name} — ${theirs.name}.`);
  return true;
}

export function beginDoubleMandateChoice(state, playerId, card, log) {
  if (!state.players[playerId].isHuman) return false;
  if (!state.missionDeck?.length) {
    log(`${card.name}: nessun obiettivo disponibile nel mazzo.`);
    return false;
  }
  const peekId = state.missionDeck[state.missionDeck.length - 1];
  const peek = MISSIONS[peekId];
  const mine = missionSummary(state, playerId);
  state.pendingChoice = {
    kind: 'double_mandate',
    step: 'confirm',
    actorId: playerId,
    prompt: 'Sostituire il tuo obiettivo con questo?',
    items: [
      { type: 'mission', id: 'current', name: `Attuale: ${mine.name}`, description: mine.description },
      {
        type: 'mission',
        id: 'peek',
        name: `Nuovo: ${peek?.name || peekId}`,
        description: peek?.description || '',
      },
    ],
    meta: { cardName: card.name, peekMissionId: peekId },
  };
  log(`${card.name}: obiettivo dal mazzo — ${peek?.name || peekId}.`);
  return true;
}

export function getChoiceLegalActions(state, actorId) {
  const pc = state.pendingChoice;
  if (!pc || pc.actorId !== actorId) return [];

  if (pc.kind === 'surveil' && pc.maxPick > 1) {
    const actions = [{ type: 'RESOLVE_CHOICE', confirm: true, playerId: actorId }];
    for (const item of pc.items) {
      actions.push({ type: 'RESOLVE_CHOICE', cardId: item.id, playerId: actorId });
    }
    return actions;
  }

  if (pc.kind === 'scry') {
    return [
      { type: 'RESOLVE_CHOICE', scryAction: 'draw', playerId: actorId },
      { type: 'RESOLVE_CHOICE', scryAction: 'bottom', playerId: actorId },
    ];
  }

  if (pc.step === 'confirm' && (pc.kind === 'turncoat' || pc.kind === 'double_mandate')) {
    return [
      { type: 'RESOLVE_CHOICE', confirm: true, playerId: actorId },
      { type: 'RESOLVE_CHOICE', confirm: false, playerId: actorId },
    ];
  }

  const actions = [];
  for (const item of pc.items) {
    if (item.type === 'player') {
      actions.push({ type: 'RESOLVE_CHOICE', targetPlayerId: item.id, playerId: actorId });
    } else if (item.type === 'relic') {
      actions.push({ type: 'RESOLVE_CHOICE', relicId: item.id, playerId: actorId });
    } else if (item.type === 'card') {
      actions.push({ type: 'RESOLVE_CHOICE', cardId: item.id, playerId: actorId });
    }
  }
  return actions;
}

function finishSurveil(state, playerId, seen, takenIds, deps) {
  state.cardDeck = state.cardDeck.slice(0, state.cardDeck.length - seen.length);
  const rest = seen.filter((id) => !takenIds.includes(id));
  for (let i = rest.length - 1; i >= 0; i--) deps.putDeckBottom(state, rest[i]);
  for (const id of takenIds) state.players[playerId].hand.push(id);
  if (takenIds.length) {
    deps.log(`${takenIds.length} carta/e aggiunta/e alla mano.`);
  }
}

function swapMissions(state, a, b) {
  const pa = state.players[a];
  const pb = state.players[b];
  const tmpId = pa.missionId;
  const tmpTarget = pa.missionTargetId;
  pa.missionId = pb.missionId;
  pa.missionTargetId = pb.missionTargetId;
  pb.missionId = tmpId;
  pb.missionTargetId = tmpTarget;
}

/** Resolve a pending choice. Returns true if resolved (possibly into another step). */
export function resolveChoice(state, action, deps) {
  const pc = state.pendingChoice;
  if (!pc) return false;
  const actor = action.playerId || pc.actorId;
  if (actor !== pc.actorId) return false;

  if (pc.kind === 'arcana' && action.relicId) {
    const relicId = action.relicId;
    if (!pc.meta.pool.includes(relicId)) return false;
    const p = state.players[actor];
    if (!p.extraRelicIds) p.extraRelicIds = [];
    p.extraRelicIds.push(relicId);
    pc.meta.pool = pc.meta.pool.filter((id) => id !== relicId);
    deps.log(`${deps.playerName(actor)} ottiene ${RELICS[relicId].name}.`);
    if (pc.meta.pool.length === 0) {
      state.pendingChoice = null;
      deps.log('Arcana: draft completato.');
      return true;
    }
    const next = nextPlayerInOrder(state, actor);
    state.pendingChoice = {
      kind: 'arcana',
      actorId: next,
      prompt: 'Seleziona una reliquia',
      items: relicItems(pc.meta.pool),
      meta: pc.meta,
    };
    deps.log(`${deps.playerName(next)} sceglie una reliquia (${pc.meta.pool.length} rimaste).`);
    return true;
  }

  if (pc.kind === 'surveil') {
    const seen = pc.meta.seen;
    if (pc.maxPick > 1) {
      if (action.confirm) {
        if (!pc.picked?.length) return false;
        finishSurveil(state, actor, seen, [...pc.picked], deps);
        state.pendingChoice = null;
        return true;
      }
      if (action.cardId && seen.includes(action.cardId)) {
        if (!pc.picked) pc.picked = [];
        const idx = pc.picked.indexOf(action.cardId);
        if (idx >= 0) pc.picked.splice(idx, 1);
        else if (pc.picked.length < pc.maxPick) pc.picked.push(action.cardId);
        return false;
      }
      return false;
    }
    if (action.cardId && seen.includes(action.cardId)) {
      finishSurveil(state, actor, seen, [action.cardId], deps);
      state.pendingChoice = null;
      return true;
    }
    return false;
  }

  if (pc.kind === 'scry') {
    const topId = pc.meta.topCardId;
    if (action.scryAction === 'bottom') {
      deps.putDeckBottom(state, state.cardDeck.pop());
      deps.log('Veggente: carta messa in fondo.');
    }
    const drawn = state.cardDeck.pop();
    if (drawn) {
      state.players[actor].hand.push(drawn);
      deps.log(`Pesci ${getCard(drawn)?.name || drawn}.`);
    }
    state.pendingChoice = null;
    return true;
  }

  if (pc.kind === 'steal' && pc.step === 'player' && action.targetPlayerId) {
    const card = { name: pc.meta.cardName };
    state.pendingChoice = null;
    beginStealCardChoice(state, actor, card, action.targetPlayerId, deps.log);
    return false;
  }

  if (pc.kind === 'steal' && pc.step === 'card' && action.cardId) {
    const target = pc.meta.targetPlayerId;
    const hand = state.players[target].hand || [];
    const idx = hand.indexOf(action.cardId);
    if (idx < 0) return false;
    const stolen = hand.splice(idx, 1)[0];
    if (state.players[actor].hand.length >= deps.handLimit(state, actor)) {
      state.cardDiscard.push(stolen);
      deps.log(`${pc.meta.cardName}: mano piena, carta scartata.`);
    } else {
      state.players[actor].hand.push(stolen);
      deps.log(`${pc.meta.cardName}: prendi ${getCard(stolen)?.name || stolen}.`);
    }
    state.pendingChoice = null;
    return true;
  }

  if (pc.kind === 'sabotage' && pc.step === 'player' && action.targetPlayerId) {
    const hand = state.players[action.targetPlayerId].hand || [];
    state.pendingChoice = null;
    if (!hand.length) {
      deps.log(`${pc.meta.cardName}: ${deps.playerName(action.targetPlayerId)} non ha carte.`);
      return true;
    }
    const card = { name: pc.meta.cardName };
    beginSabotageCardChoice(state, actor, card, action.targetPlayerId, deps.log);
    return false;
  }

  if (pc.kind === 'sabotage' && pc.step === 'card' && action.cardId) {
    const target = pc.meta.targetPlayerId;
    const hand = state.players[target].hand || [];
    const idx = hand.indexOf(action.cardId);
    if (idx < 0) return false;
    const discarded = hand.splice(idx, 1)[0];
    state.cardDiscard.push(discarded);
    deps.log(
      `${pc.meta.cardName}: ${deps.playerName(target)} scarta ${getCard(discarded)?.name || discarded}.`,
    );
    state.pendingChoice = null;
    return true;
  }

  if (pc.kind === 'omniscience' && action.cardId) {
    const target = pc.meta.targetPlayerId;
    const hand = state.players[target].hand || [];
    const idx = hand.indexOf(action.cardId);
    if (idx < 0) return false;
    const discarded = hand.splice(idx, 1)[0];
    state.cardDiscard.push(discarded);
    deps.log(
      `${pc.meta.cardName}: ${deps.playerName(target)} scarta ${getCard(discarded)?.name || discarded}.`,
    );
    const nextIndex = (pc.meta.queueIndex ?? 0) + 1;
    const card = { name: pc.meta.cardName };
    state.pendingChoice = null;
    if (nextIndex < pc.meta.queue.length) {
      advanceOmniscienceStep(state, actor, card, pc.meta.queue, nextIndex, deps.log);
      return false;
    }
    return true;
  }

  if (pc.kind === 'turncoat' && pc.step === 'player' && action.targetPlayerId) {
    const card = { name: pc.meta.cardName };
    state.pendingChoice = null;
    beginTurncoatConfirm(state, actor, card, action.targetPlayerId, deps.log);
    return false;
  }

  if (pc.kind === 'turncoat' && pc.step === 'confirm') {
    if (action.confirm && pc.meta.targetPlayerId) {
      swapMissions(state, actor, pc.meta.targetPlayerId);
      deps.log(`${pc.meta.cardName}: obiettivi scambiati.`);
    } else {
      deps.log(`${pc.meta.cardName}: nessuno scambio.`);
    }
    state.pendingChoice = null;
    deps.revealEvent(state);
    deps.log(`${pc.meta.cardName}: Disordine (+1 evento).`);
    return true;
  }

  if (pc.kind === 'double_mandate' && pc.step === 'confirm') {
    const peekId = pc.meta.peekMissionId;
    if (action.confirm && peekId) {
      const old = state.players[actor].missionId;
      if (old) state.missionDeck.push(old);
      state.missionDeck.pop();
      state.players[actor].missionId = peekId;
      if (peekId === 'eliminate_enemy') {
        const others = getAlivePlayerIds(state).filter((id) => id !== actor);
        state.players[actor].missionTargetId = others.length ? state.rng.pick(others) : null;
      } else {
        state.players[actor].missionTargetId = null;
      }
      deps.log(`${pc.meta.cardName}: nuovo obiettivo — ${MISSIONS[peekId]?.name || peekId}.`);
    } else {
      deps.log(`${pc.meta.cardName}: obiettivo rifiutato.`);
    }
    state.pendingChoice = null;
    deps.revealEvent(state);
    deps.log(`${pc.meta.cardName}: Disordine (+1 evento).`);
    return true;
  }

  return false;
}

/** AI auto-pick for pending choice. Returns true if something was resolved. */
export function autoResolveChoice(state, deps) {
  const pc = state.pendingChoice;
  if (!pc) return false;
  const actor = pc.actorId;
  if (state.players[actor]?.isHuman) return false;

  if (pc.kind === 'arcana') {
    const pick = state.rng.pick(pc.meta.pool);
    resolveChoice(state, { playerId: actor, relicId: pick }, deps);
    return true;
  }

  if (pc.kind === 'surveil') {
    const seen = pc.meta.seen;
    const n = Math.min(pc.maxPick, seen.length);
    const picked = seen.slice(0, n);
    finishSurveil(state, actor, seen, picked, deps);
    state.pendingChoice = null;
    return true;
  }

  if (pc.kind === 'scry') {
    const bottom = state.rng.int(100) < 35;
    resolveChoice(state, { playerId: actor, scryAction: bottom ? 'bottom' : 'draw' }, deps);
    return true;
  }

  if (pc.kind === 'steal' && pc.step === 'player') {
    const pick = state.rng.pick(pc.items).id;
    resolveChoice(state, { playerId: actor, targetPlayerId: pick }, deps);
    return autoResolveChoice(state, deps);
  }

  if (pc.kind === 'steal' && pc.step === 'card') {
    const pick = state.rng.pick(pc.items).id;
    resolveChoice(state, { playerId: actor, cardId: pick }, deps);
    return true;
  }

  if (pc.kind === 'sabotage' && pc.step === 'player') {
    const pick = state.rng.pick(pc.items).id;
    resolveChoice(state, { playerId: actor, targetPlayerId: pick }, deps);
    return autoResolveChoice(state, deps);
  }

  if (pc.kind === 'sabotage' && pc.step === 'card') {
    const pick = state.rng.pick(pc.items).id;
    resolveChoice(state, { playerId: actor, cardId: pick }, deps);
    return true;
  }

  if (pc.kind === 'omniscience') {
    const pick = state.rng.pick(pc.items).id;
    resolveChoice(state, { playerId: actor, cardId: pick }, deps);
    return state.pendingChoice ? autoResolveChoice(state, deps) : true;
  }

  if (pc.kind === 'turncoat' && pc.step === 'player') {
    const pick = state.rng.pick(pc.items).id;
    resolveChoice(state, { playerId: actor, targetPlayerId: pick }, deps);
    return autoResolveChoice(state, deps);
  }

  if (pc.kind === 'turncoat' && pc.step === 'confirm') {
    resolveChoice(state, { playerId: actor, confirm: state.rng.int(100) < 45 }, deps);
    return true;
  }

  if (pc.kind === 'double_mandate' && pc.step === 'confirm') {
    resolveChoice(state, { playerId: actor, confirm: state.rng.int(100) < 50 }, deps);
    return true;
  }

  return false;
}

export function applySurveilImmediate(state, playerId, seen, take, deps) {
  const toTake = Math.min(take, seen.length, deps.handLimit(state, playerId) - state.players[playerId].hand.length);
  const taken = seen.slice(0, toTake);
  finishSurveil(state, playerId, seen, taken, deps);
}

export function applyStealImmediate(state, playerId, card, action, deps) {
  const target = deps.pickOpponent(state, playerId, action.targetPlayerId);
  const hand = target ? state.players[target].hand : [];
  if (target && hand.length) {
    const idx = action.stolenIndex ?? state.rng.int(hand.length);
    const stolen = hand.splice(idx, 1)[0];
    if (state.players[playerId].hand.length >= deps.handLimit(state, playerId)) {
      state.cardDiscard.push(stolen);
    } else {
      state.players[playerId].hand.push(stolen);
      deps.log(`${card.name}: prendi ${getCard(stolen)?.name || stolen}.`);
    }
  }
}

export function applySabotageImmediate(state, playerId, card, action, deps) {
  const target = deps.pickOpponent(state, playerId, action.targetPlayerId);
  const hand = target ? state.players[target].hand : [];
  if (target && hand.length) {
    const idx = state.rng.int(hand.length);
    const discarded = hand.splice(idx, 1)[0];
    state.cardDiscard.push(discarded);
    deps.log(`${card.name}: ${deps.playerName(target)} scarta ${getCard(discarded)?.name || discarded}.`);
  }
}

export function applyOmniscienceImmediate(state, playerId, card, deps) {
  for (const oid of getAlivePlayerIds(state)) {
    if (oid === playerId) continue;
    const hand = state.players[oid].hand;
    if (!hand.length) continue;
    const idx = state.rng.int(hand.length);
    const discarded = hand.splice(idx, 1)[0];
    state.cardDiscard.push(discarded);
    deps.log(`${card.name}: ${deps.playerName(oid)} scarta ${getCard(discarded)?.name || discarded}.`);
  }
}

export function applyTurncoatImmediate(state, playerId, card, deps) {
  const opps = getAlivePlayerIds(state).filter((id) => id !== playerId);
  if (opps.length && state.rng.int(100) < 45) {
    const target = state.rng.pick(opps);
    swapMissions(state, playerId, target);
    deps.log(`${card.name}: obiettivi scambiati con ${deps.playerName(target)}.`);
  }
  deps.revealEvent(state);
  deps.log(`${card.name}: Disordine (+1 evento).`);
}

export function applyDoubleMandateImmediate(state, playerId, card, deps) {
  if (state.missionDeck?.length && state.rng.int(100) < 50) {
    const peekId = state.missionDeck.pop();
    const old = state.players[playerId].missionId;
    if (old) state.missionDeck.push(old);
    state.players[playerId].missionId = peekId;
    if (peekId === 'eliminate_enemy') {
      const others = getAlivePlayerIds(state).filter((id) => id !== playerId);
      state.players[playerId].missionTargetId = others.length ? state.rng.pick(others) : null;
    } else {
      state.players[playerId].missionTargetId = null;
    }
    deps.log(`${card.name}: nuovo obiettivo — ${MISSIONS[peekId]?.name || peekId}.`);
  }
  deps.revealEvent(state);
  deps.log(`${card.name}: Disordine (+1 evento).`);
}

export function applyArcanaImmediate(state, casterId, deps) {
  const n = state.playerOrder.length;
  const owned = ownedRelicIds(state);
  const available = RELIC_IDS.filter((id) => !owned.has(id));
  const pool = state.rng.shuffle([...available]).slice(0, n);
  let picker = casterId;
  for (const relicId of pool) {
    const p = state.players[picker];
    if (!p.extraRelicIds) p.extraRelicIds = [];
    p.extraRelicIds.push(relicId);
    deps.log(`${deps.playerName(picker)} ottiene ${RELICS[relicId].name}.`);
    picker = nextPlayerInOrder(state, picker);
  }
}
