import {
  applyAction,
  getPlayerTerritories,
  areAdjacent,
  getCard,
  isCombatCard,
  getLegalActions,
  STACK_WINDOW_MS,
  processChoiceDraft,
} from '../engine/game.js';
import { findClassicTradeSet } from '../data/classic-cards.js';

function confirmAiCast(state, pid, nowMs) {
  const pc = state.pendingCast;
  if (!pc || pc.playerId !== pid) return;
  if (pc.needsDiePick && pc.targets?.dieIndex == null && state.combatContext) {
    const ctx = state.combatContext;
    const isAtt = pid === ctx.attackerId;
    const dice = isAtt ? ctx.rawAttDice : ctx.rawDefDice;
    applyAction(state, {
      type: 'SET_CAST_DIE',
      dieIndex: state.rng.int(dice.length),
      playerId: pid,
      nowMs,
    });
  }
  applyAction(state, { type: 'CAST_CONFIRM', playerId: pid, nowMs });
}

/** Resolve one interactive choice for AI/non-human actor. Returns true if state changed. */
export function processArcanaDraft(state) {
  return processChoiceDraft(state);
}

/** Advance stack timer and AI cast confirm/responses. Returns true if state changed. */
export function processStackPhase(state, opts = {}) {
  if (state.vanillaMode) return false;
  const nowMs = opts.nowMs ?? Date.now();
  const beforeWindow = !!state.responseWindow;
  const beforeCombat = !!state.combatContext;
  const beforePending = !!state.pendingCast;

  applyAction(state, { type: 'TICK_STACK', nowMs });

  if (state.pendingCast) {
    const pc = state.pendingCast;
    if (state.players[pc.playerId].isHuman) return beforePending !== !!state.pendingCast;
    confirmAiCast(state, pc.playerId, nowMs);
    return true;
  }

  if (!state.responseWindow) {
    return beforeWindow || beforeCombat !== !!state.combatContext;
  }

  for (const pid of state.playerOrder) {
    if (state.players[pid].isHuman) continue;
    const starts = getLegalActions(state, pid).filter((a) => a.type === 'CAST_START');
    if (!starts.length) continue;

    const neg = starts.find((a) => getCard(state.players[pid].hand[a.handIndex])?.effect?.type === 'negate');
    if (neg && state.rng.int(100) < 28) {
      applyAction(state, { ...neg, playerId: pid, nowMs });
      confirmAiCast(state, pid, nowMs);
      return true;
    }

    if (state.responseWindow?.kind === 'combat') {
      const combat = starts.find((a) => isCombatCard(getCard(state.players[pid].hand[a.handIndex])));
      if (combat && state.rng.int(100) < 35) {
        applyAction(state, { ...combat, playerId: pid, nowMs });
        confirmAiCast(state, pid, nowMs);
        return true;
      }
    }
  }

  const humanCanRespond = state.playerOrder.some((id) => {
    if (!state.players[id].isHuman) return false;
    return getLegalActions(state, id).some((a) => a.type === 'CAST_START' || a.type === 'CAST_CONFIRM');
  });
  if (!humanCanRespond) {
    for (const pid of state.playerOrder) {
      if (state.players[pid].isHuman) continue;
      if (state.responseWindow.passedPlayerIds?.includes(pid)) continue;
      applyAction(state, { type: 'PASS_STACK', playerId: pid, nowMs });
      return true;
    }
  }

  return beforeWindow !== !!state.responseWindow;
}

function drainStackForAi(state) {
  let guard = 0;
  while (guard++ < 24 && processStackPhase(state)) {
    if (state.pendingCast && state.players[state.pendingCast.playerId]?.isHuman) break;
  }
}

/**
 * Simple heuristic AI: reinforce fronts, attack when favored, fortify borders, play easy cards.
 * Mutates state through applyAction until human turn or game over.
 */
export function runAiTurn(state, opts = {}) {
  const maxSteps = opts.maxSteps ?? 200;
  const maxAttacks = opts.maxAttacks ?? 12;
  let steps = 0;
  let attacks = 0;
  const pid = state.currentPlayerId;
  if (state.players[pid].isHuman) return state;

  while (steps++ < maxSteps) {
    if (state.phase === 'game_over') break;

    drainStackForAi(state);
    if (processChoiceDraft(state)) continue;
    if (state.pendingChoice) break;
    if (state.responseWindow || state.combatContext || state.pendingCast) break;

    if (state.pendingBastion) {
      const defId = state.pendingBastion.defenderId;
      if (state.players[defId].isHuman) break;
      applyAction(state, {
        type: 'RESOLVE_BASTION',
        use: state.territories[state.pendingBastion.to].armies <= 2,
      });
      continue;
    }

    if (state.players[state.currentPlayerId].isHuman) break;
    if (state.currentPlayerId !== pid && state.phase !== 'game_over') break;

    if (state.pendingDrawAfterDiscard) {
      applyAction(state, { type: 'DISCARD_FOR_DRAW', handIndex: 0 });
      continue;
    }

    if (state.pendingRecycle) {
      applyAction(state, { type: 'SKIP_RECYCLE' });
      continue;
    }

    if (state.vanillaMode && state.phase === 'reinforce') {
      if (aiClassicTrade(state)) continue;
    }

    if (state.phase === 'setup') {
      aiSetupPlace(state);
      break;
    }

    if (state.phase === 'reinforce') {
      aiReinforce(state);
      continue;
    }

    if (state.phase === 'attack') {
      if (attacks === 0 && !state.vanillaMode) maybePlayActionCard(state);
      drainStackForAi(state);
      if (processChoiceDraft(state)) continue;
      if (state.pendingChoice) break;
      if (state.responseWindow || state.combatContext) break;
      if (attacks >= maxAttacks) {
        applyAction(state, { type: 'END_PHASE' });
        continue;
      }
      const attacked = aiAttack(state);
      if (!attacked) {
        applyAction(state, { type: 'END_PHASE' });
      } else {
        attacks += 1;
        drainStackForAi(state);
        if (processChoiceDraft(state)) continue;
        if (state.pendingChoice) break;
      }
      continue;
    }

    if (state.phase === 'fortify') {
      aiFortify(state);
      applyAction(state, { type: 'END_PHASE' });
      continue;
    }

    break;
  }

  if (state.phase === 'setup') return state;

  while (
    state.phase !== 'game_over' &&
    state.currentPlayerId === pid &&
    !state.players[pid].isHuman &&
    steps++ < maxSteps + 50
  ) {
    drainStackForAi(state);
    if (processChoiceDraft(state)) continue;
    if (state.pendingChoice) break;
    if (state.responseWindow || state.combatContext || state.pendingCast) break;

    if (state.pendingBastion) {
      const defId = state.pendingBastion.defenderId;
      if (state.players[defId].isHuman) break;
      applyAction(state, {
        type: 'RESOLVE_BASTION',
        use: state.territories[state.pendingBastion.to].armies <= 2,
      });
      continue;
    }
    if (state.pendingDrawAfterDiscard) {
      applyAction(state, { type: 'DISCARD_FOR_DRAW', handIndex: 0 });
      continue;
    }
    if (state.pendingRecycle) {
      applyAction(state, { type: 'SKIP_RECYCLE' });
      continue;
    }
    if (state.vanillaMode && state.phase === 'reinforce' && aiClassicTrade(state)) {
      continue;
    }
    if (state.phase === 'reinforce' && state.reinforcementsRemaining > 0) {
      aiReinforce(state);
      continue;
    }
    applyAction(state, { type: 'END_PHASE' });
  }

  return state;
}

function aiSetupPlace(state) {
  const pid = state.currentPlayerId;
  if (state.players[pid].setupRemaining <= 0) return;
  const f = fronts(state, pid);
  let target;
  if (f.length) {
    f.sort((a, b) => a.armies - b.armies);
    target = f[0].tid;
  } else {
    target = getPlayerTerritories(state, pid)[0];
  }
  applyAction(state, { type: 'PLACE_REINFORCEMENT', territoryId: target });
}

function fronts(state, pid) {
  const result = [];
  for (const tid of getPlayerTerritories(state, pid)) {
    const enemies = [];
    for (const n of state.adjacency[tid]) {
      if (state.territories[n].owner !== pid) {
        enemies.push(n);
      }
    }
    if (enemies.length) result.push({ tid, enemies, armies: state.territories[tid].armies });
  }
  return result;
}

function aiClassicTrade(state) {
  const pid = state.currentPlayerId;
  const hand = state.players[pid].hand;
  const set = findClassicTradeSet(hand);
  if (!set) return false;
  const must = state.pendingClassicDraw || hand.length >= 5;
  if (!must && hand.length < 4) return false;
  applyAction(state, { type: 'TRADE_CLASSIC_CARDS', handIndices: set });
  return true;
}

function aiReinforce(state) {
  if (state.vanillaMode && aiClassicTrade(state)) return;
  const pid = state.currentPlayerId;
  if (state.reinforcementsRemaining <= 0) {
    applyAction(state, { type: 'END_PHASE' });
    return;
  }
  const f = fronts(state, pid);
  let target;
  if (f.length) {
    f.sort((a, b) => a.armies - b.armies);
    target = f[0].tid;
  } else {
    target = getPlayerTerritories(state, pid)[0];
  }
  applyAction(state, { type: 'PLACE_REINFORCEMENT', territoryId: target, count: 1 });
}

function aiAttack(state) {
  const pid = state.currentPlayerId;
  const f = fronts(state, pid);
  const must =
    state.activeEventId === 'chaos' &&
    !state.mustAttackSatisfied;

  let best = null;
  for (const front of f) {
    if (front.armies < 2) continue;
    for (const enemyId of front.enemies) {
      const def = state.territories[enemyId].armies;
      const score = front.armies - def;
      const acceptable = score >= 1 || (score >= 0 && front.armies >= 4) || must;
      if (acceptable) {
        if (!best || score > best.score) {
          best = { from: front.tid, to: enemyId, score };
        }
      }
    }
  }
  if (!best) return false;

  applyAction(state, {
    type: 'ATTACK',
    from: best.from,
    to: best.to,
    attackDice: Math.min(3, state.territories[best.from].armies - 1),
  });
  return true;
}

function aiFortify(state) {
  const pid = state.currentPlayerId;
  const owned = getPlayerTerritories(state, pid);
  const f = fronts(state, pid);
  if (!f.length) return;
  f.sort((a, b) => a.armies - b.armies);
  const weak = f[0].tid;

  let donor = null;
  let donorArmies = 0;
  for (const tid of owned) {
    if (tid === weak) continue;
    const isFront = f.some((x) => x.tid === tid);
    const armies = state.territories[tid].armies;
    if (!isFront && armies > donorArmies) {
      donor = tid;
      donorArmies = armies;
    }
  }
  if (!donor || donorArmies < 2) {
    for (const tid of owned) {
      if (tid === weak) continue;
      if (!areAdjacent(tid, weak)) continue;
      if (state.territories[tid].armies > 2) {
        donor = tid;
        break;
      }
    }
  }
  if (!donor) return;

  const move = Math.min(3, state.territories[donor].armies - 1);
  applyAction(state, { type: 'FORTIFY', from: donor, to: weak, armies: move });
}

function maybePlayActionCard(state) {
  const pid = state.currentPlayerId;
  const hand = state.players[pid].hand;
  const recruitIdx = hand.findIndex((id) => getCard(id)?.baseId === 'recruit');
  if (recruitIdx >= 0 && (state.phase === 'reinforce' || state.phase === 'attack')) {
    const f = fronts(state, pid);
    const tid = f.length
      ? [...f].sort((a, b) => a.armies - b.armies)[0].tid
      : getPlayerTerritories(state, pid)[0];
    applyAction(state, { type: 'PLAY_ACTION_CARD', handIndex: recruitIdx, territoryId: tid, riderTerritoryId: tid });
    return;
  }
  const suppliesIdx = hand.findIndex((id) => getCard(id)?.baseId === 'supplies');
  if (suppliesIdx >= 0 && (state.phase === 'reinforce' || state.phase === 'attack')) {
    const f = fronts(state, pid);
    const tid = f.length
      ? [...f].sort((a, b) => a.armies - b.armies)[0].tid
      : getPlayerTerritories(state, pid)[0];
    applyAction(state, { type: 'PLAY_ACTION_CARD', handIndex: suppliesIdx, territoryId: tid, riderTerritoryId: tid });
    return;
  }
  const sabotageIdx = hand.findIndex((id) => getCard(id)?.baseId === 'sabotage');
  if (sabotageIdx >= 0 && state.phase === 'attack') {
    applyAction(state, { type: 'PLAY_ACTION_CARD', handIndex: sabotageIdx });
  }
}
