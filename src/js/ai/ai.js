import {
  applyAction,
  getPlayerTerritories,
  areAdjacent,
  CARDS,
} from '../engine/game.js';

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
    if (state.players[state.currentPlayerId].isHuman) break;
    if (state.currentPlayerId !== pid && state.phase !== 'game_over') break;

    if (state.pendingDrawAfterDiscard) {
      applyAction(state, { type: 'DISCARD_FOR_DRAW', handIndex: 0 });
      continue;
    }

    if (state.phase === 'setup') {
      aiSetupPlace(state);
      // After one place, turn may switch — exit so caller can refresh / continue
      break;
    }

    if (state.phase === 'reinforce') {
      aiReinforce(state);
      continue;
    }

    if (state.phase === 'attack') {
      if (attacks === 0) maybePlayActionCard(state);
      if (attacks >= maxAttacks) {
        applyAction(state, { type: 'END_PHASE' });
        continue;
      }
      const attacked = aiAttack(state);
      if (!attacked) {
        applyAction(state, { type: 'END_PHASE' });
      } else {
        attacks += 1;
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

  // Safety: never leave the AI mid-turn (not during setup — setup is one place per call)
  if (state.phase === 'setup') return state;

  while (
    state.phase !== 'game_over' &&
    state.currentPlayerId === pid &&
    !state.players[pid].isHuman &&
    steps++ < maxSteps + 50
  ) {
    if (state.pendingDrawAfterDiscard) {
      applyAction(state, { type: 'DISCARD_FOR_DRAW', handIndex: 0 });
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

function aiReinforce(state) {
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

  // Prefer favorable attacks; allow even fights to keep games moving
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

  // Set a combat card if useful
  const hand = state.players[pid].hand;
  const combatIdx = hand.findIndex((id) => CARDS[id].type === 'combat' && CARDS[id].effect.type !== 'def_high_die_bonus');
  if (combatIdx >= 0 && best.score <= 3) {
    applyAction(state, { type: 'SET_COMBAT_CARD', handIndex: combatIdx });
  }

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
  // Move from safe inland stacks to weakest front
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
    // try any adjacent stronger front
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

  // Check adjacency / fortify rules via action attempt
  const move = Math.min(3, state.territories[donor].armies - 1);
  applyAction(state, { type: 'FORTIFY', from: donor, to: weak, armies: move });
}

function maybePlayActionCard(state) {
  const pid = state.currentPlayerId;
  const hand = state.players[pid].hand;
  const recruitIdx = hand.findIndex((id) => id === 'recruit');
  if (recruitIdx >= 0 && (state.phase === 'reinforce' || state.phase === 'attack')) {
    const f = fronts(state, pid);
    const tid = f.length
      ? [...f].sort((a, b) => a.armies - b.armies)[0].tid
      : getPlayerTerritories(state, pid)[0];
    applyAction(state, { type: 'PLAY_ACTION_CARD', handIndex: recruitIdx, territoryId: tid });
    return;
  }
  const raidIdx = hand.findIndex((id) => id === 'raid');
  if (raidIdx >= 0 && state.phase === 'attack') {
    for (const front of fronts(state, pid)) {
      for (const e of front.enemies) {
        if (state.territories[e].armies > 1) {
          applyAction(state, { type: 'PLAY_ACTION_CARD', handIndex: raidIdx, territoryId: e });
          return;
        }
      }
    }
  }
}
