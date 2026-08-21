/**
 * Shared logger (browser + Node / Docker).
 * LOG_LEVEL: silent | error | warn | info | debug
 * - Node: process.env.LOG_LEVEL (default info)
 * - Browser: quiet by default (warn+) so the console stays clean
 */

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

function resolveLevel() {
  const fromEnv =
    typeof process !== 'undefined' && process.env?.LOG_LEVEL
      ? String(process.env.LOG_LEVEL).toLowerCase()
      : null;
  if (fromEnv && LEVELS[fromEnv] != null) return LEVELS[fromEnv];
  const isBrowser = typeof window !== 'undefined';
  return isBrowser ? LEVELS.warn : LEVELS.info;
}

const level = resolveLevel();

function stamp() {
  return new Date().toISOString();
}

function line(lvl, tag, msg, extra) {
  if ((LEVELS[lvl] ?? 99) > level) return;
  const base = `[${stamp()}] [${lvl.toUpperCase()}] [${tag}] ${msg}`;
  if (extra !== undefined) {
    try {
      console.log(base, typeof extra === 'string' ? extra : JSON.stringify(extra));
    } catch {
      console.log(base, extra);
    }
  } else {
    console.log(base);
  }
}

export const log = {
  error: (tag, msg, extra) => line('error', tag, msg, extra),
  warn: (tag, msg, extra) => line('warn', tag, msg, extra),
  info: (tag, msg, extra) => line('info', tag, msg, extra),
  debug: (tag, msg, extra) => line('debug', tag, msg, extra),
};

export function summarizeAction(action) {
  if (!action || typeof action !== 'object') return { type: '?' };
  const out = { type: action.type };
  for (const k of [
    'from',
    'to',
    'territoryId',
    'handIndex',
    'kitIndex',
    'dieIndex',
    'armies',
    'playerId',
    'fromKit',
    'cardId',
    'relicId',
    'eventId',
  ]) {
    if (action[k] != null) out[k] = action[k];
  }
  return out;
}

export function summarizeState(state) {
  if (!state) return null;
  return {
    phase: state.phase,
    turn: state.currentPlayerId,
    round: state.round,
    pendingInvasion: state.pendingInvasion || null,
    pendingCast: state.pendingCast
      ? {
          playerId: state.pendingCast.playerId,
          cardId: state.pendingCast.cardId,
          needsDie: state.pendingCast.needsDiePick,
        }
      : null,
    pendingChoice: state.pendingChoice?.kind || null,
    pendingBastion: !!state.pendingBastion,
    responseWindow: state.responseWindow?.kind || null,
    combat: state.combatContext
      ? { from: state.combatContext.from, to: state.combatContext.to }
      : null,
    stackLen: state.stack?.length || 0,
    logTail: (state.log || []).slice(-3).map((e) => e.message),
  };
}
