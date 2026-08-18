/** Stack, response window, and cast confirm — Krisiko mode only. */

import { getCard } from '../data/cards.js';

export const STACK_WINDOW_MS = 10_000;

export function initStackState(state) {
  state.stack = state.stack || [];
  state.responseWindow = null;
  state.pendingCast = null;
  state.combatContext = null;
  state.stackSeq = state.stackSeq || 0;
}

export function isStackLocked(state) {
  if (state.vanillaMode) return false;
  return !!(state.responseWindow || state.pendingCast || (state.stack && state.stack.length > 0));
}

export function canEndPhaseNow(state) {
  if (state.vanillaMode) return true;
  if (state.pendingChoice || state.pendingInvasion || state.pendingCast || state.pendingBastion) return false;
  if (state.responseWindow) return false;
  if (state.stack?.length > 0) return false;
  if (state.combatContext) return false;
  return true;
}

function nextEntryId(state) {
  state.stackSeq = (state.stackSeq || 0) + 1;
  return `S${state.stackSeq}`;
}

export function openResponseWindow(state, kind, nowMs) {
  state.responseWindow = {
    kind,
    deadlineMs: nowMs + STACK_WINDOW_MS,
    paused: false,
    passedPlayerIds: [],
  };
}

export function resetWindowDeadline(state, nowMs) {
  if (!state.responseWindow) return;
  state.responseWindow.deadlineMs = nowMs + STACK_WINDOW_MS;
  state.responseWindow.paused = false;
  state.responseWindow.passedPlayerIds = [];
  delete state.responseWindow.remainingMs;
}

export function pauseResponseWindow(state, nowMs) {
  if (!state.responseWindow || state.responseWindow.paused) return;
  state.responseWindow.paused = true;
  state.responseWindow.remainingMs = Math.max(0, state.responseWindow.deadlineMs - nowMs);
}

export function resumeResponseWindow(state, nowMs) {
  if (!state.responseWindow?.paused) return;
  state.responseWindow.deadlineMs = nowMs + (state.responseWindow.remainingMs ?? STACK_WINDOW_MS);
  state.responseWindow.paused = false;
  delete state.responseWindow.remainingMs;
}

export function windowRemainingMs(state, nowMs) {
  if (!state.responseWindow) return 0;
  if (state.responseWindow.paused) return state.responseWindow.remainingMs ?? 0;
  return Math.max(0, state.responseWindow.deadlineMs - nowMs);
}

export function isWindowExpired(state, nowMs) {
  if (!state.responseWindow || state.responseWindow.paused || state.pendingCast) return false;
  return nowMs >= state.responseWindow.deadlineMs;
}

export function pushStackEntry(state, entry) {
  if (!state.stack) state.stack = [];
  state.stack.push({ ...entry, id: nextEntryId(state), status: 'pending' });
}

export function isCounterCard(card) {
  return card?.effect?.type === 'negate' || card?.effect?.type === 'jackal';
}

export function canRespondInstant(state, playerId) {
  if (state.vanillaMode || !state.responseWindow) return false;
  const turn = state.currentPlayerId;
  const top = state.stack?.[state.stack.length - 1];
  if (state.responseWindow.kind === 'action_response' && playerId === turn && (!top || top.playerId === turn)) {
    return false;
  }
  return true;
}

export function canCastCombat(state, playerId) {
  if (!state.combatContext || !state.responseWindow) return false;
  const ctx = state.combatContext;
  return playerId === ctx.attackerId || playerId === ctx.defenderId;
}

export function canStartCast(state, playerId, card) {
  if (state.vanillaMode || !card) return false;
  if (state.pendingCast) return false;

  if (card.timing === 'action') {
    if (playerId !== state.currentPlayerId) return false;
    if (state.combatContext || state.responseWindow?.kind === 'combat') return false;
    if (state.phase === 'attack' && state.combatContext) return false;
    if (!['reinforce', 'attack', 'fortify'].includes(state.phase)) return false;
    if (state.responseWindow?.kind === 'action_response') return false;
    return true;
  }

  if (card.timing === 'instant') {
    if (!state.responseWindow) return false;
    return canRespondInstant(state, playerId);
  }

  if (card.timing === 'combat') {
    if (!canCastCombat(state, playerId)) return false;
    return true;
  }

  return false;
}

/** Resolve stack LIFO; callbacks supplied by game engine. */
export function resolveStack(state, api) {
  const stack = state.stack || [];
  while (stack.length > 0) {
    const entry = stack.pop();
    const card = getCard(entry.cardId);
    if (!card) continue;

    if (card.effect?.type === 'negate') {
      if (stack.length === 0) {
        api.discardEntry(entry);
        api.log(`${api.playerName(entry.playerId)}: Negare non ha bersaglio.`);
        continue;
      }
      const target = stack.pop();
      const targetCard = getCard(target.cardId);
      if (api.isAlertProtected(target.playerId)) {
        api.discardEntry(entry);
        api.discardEntry(target);
        api.log(`Allerta: ${targetCard?.name || 'carta'} non viene negata.`);
        api.applyEntry(target);
        continue;
      }
      if (targetCard && !['common', 'rare'].includes(targetCard.rarity)) {
        api.discardEntry(entry);
        stack.push(target);
        api.log(`${targetCard.name} non può essere negata.`);
        continue;
      }
      api.discardEntry(entry);
      api.discardEntry(target);
      api.log(`${api.playerName(entry.playerId)} nega ${targetCard?.name || 'carta'}.`);
      continue;
    }

    if (card.effect?.type === 'jackal') {
      if (stack.length === 0) {
        api.discardEntry(entry);
        continue;
      }
      const target = stack.pop();
      const targetCard = getCard(target.cardId);
      if (api.isAlertProtected(target.playerId)) {
        api.discardEntry(entry);
        api.applyEntry(target);
        api.log(`Allerta: Sciacallo non può prendere ${targetCard?.name}.`);
        continue;
      }
      if (!targetCard || targetCard.rarity !== 'common') {
        api.discardEntry(entry);
        if (target) api.applyEntry(target);
        continue;
      }
      api.discardEntry(entry);
      api.applyEntry(target);
      api.giveCardToPlayer(entry.playerId, target.cardId);
      api.log(`${api.playerName(entry.playerId)}: Sciacallo prende ${targetCard.name}.`);
      continue;
    }

    api.applyEntry(entry);
  }
  state.stack = [];
}
