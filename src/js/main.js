import { createGame, applyAction, CARDS, TERRITORIES, areAdjacent, canFortifyBetween } from './engine/game.js';
import { runAiTurn } from './ai/ai.js';
import { renderMap, computeHighlights } from './ui/map.js';
import { renderHud, renderActions } from './ui/hud.js';
import { showBattleDice } from './ui/dice.js';

const els = {
  map: document.getElementById('map'),
  mapHint: document.getElementById('map-hint'),
  topMeta: document.getElementById('top-meta'),
  opponentPanel: document.getElementById('opponent-panel'),
  eventBlock: document.getElementById('event-block'),
  playerRelic: document.getElementById('player-relic'),
  playerMission: document.getElementById('player-mission'),
  playerStats: document.getElementById('player-stats'),
  playerTray: document.getElementById('player-tray'),
  hand: document.getElementById('hand'),
  actions: document.getElementById('actions'),
  log: document.getElementById('log'),
  overlay: document.getElementById('overlay'),
  overlayTitle: document.getElementById('overlay-title'),
  overlayBody: document.getElementById('overlay-body'),
  diceOverlay: document.getElementById('dice-overlay'),
  diceTitle: document.getElementById('dice-title'),
  diceAtt: document.getElementById('dice-att'),
  diceDef: document.getElementById('dice-def'),
  diceResult: document.getElementById('dice-result'),
  fortifyModal: document.getElementById('fortify-modal'),
  fortifyText: document.getElementById('fortify-text'),
  fortifyRange: document.getElementById('fortify-range'),
  fortifyCount: document.getElementById('fortify-count'),
  fortifyCancel: document.getElementById('fortify-cancel'),
  fortifyConfirm: document.getElementById('fortify-confirm'),
  moveModalTitle: document.getElementById('move-modal-title'),
  moveModalLabel: document.getElementById('move-modal-label'),
};

let state = null;
let busy = false;
let pendingFortify = null;
let moveModalMode = null; // 'fortify' | 'invasion'
let lastShownBattleKey = null;

const ui = {
  selectedId: null,
  selectedCardIndex: null,
  mode: null,
  marchFrom: null,
  highlightIds: null,
  missionExpanded: false,
  opponentExpanded: false,
  onCardClick: null,
  onEndPhase: null,
  onClearCombatCard: null,
};

function newGame() {
  state = createGame({ seed: Date.now() & 0xffffffff });
  ui.selectedId = null;
  ui.selectedCardIndex = null;
  ui.mode = null;
  ui.marchFrom = null;
  ui.missionExpanded = false;
  ui.opponentExpanded = false;
  pendingFortify = null;
  lastShownBattleKey = null;
  busy = false;
  els.overlay.classList.add('hidden');
  els.fortifyModal.classList.add('hidden');
  els.diceOverlay.classList.add('hidden');
  refresh();
  maybeRunAi();
}

function battleKey(b) {
  if (!b) return null;
  return `${b.from}|${b.to}|${b.attDice.join(',')}|${b.defDice.join(',')}|${b.attLoss}|${b.defLoss}|${b.conquered}`;
}

async function maybeShowDice() {
  const b = state.lastBattle;
  const key = battleKey(b);
  if (!key || key === lastShownBattleKey) return;
  lastShownBattleKey = key;
  busy = true;
  await showBattleDice(els, b, { holdMs: 1700 });
  busy = false;
}

function openFortifyModal(from, to) {
  const max = state.territories[from].armies - 1;
  if (max < 1) return;
  moveModalMode = 'fortify';
  pendingFortify = { from, to };
  els.moveModalTitle.textContent = 'Spostamento';
  els.moveModalLabel.textContent = 'Armate da spostare';
  els.fortifyText.textContent = `${TERRITORIES[from].name} → ${TERRITORIES[to].name} (max ${max})`;
  els.fortifyRange.min = '1';
  els.fortifyRange.max = String(max);
  els.fortifyRange.value = String(Math.min(max, Math.max(1, Math.floor(max / 2) || 1)));
  els.fortifyCount.textContent = els.fortifyRange.value;
  els.fortifyCancel.classList.remove('hidden');
  els.fortifyModal.classList.remove('hidden');
}

function openInvasionModal() {
  const pending = state.pendingInvasion;
  if (!pending) return;
  const from = state.territories[pending.from];
  const to = state.territories[pending.to];
  const pool = from.armies + to.armies;
  const max = pool - 1;
  const min = 1;
  moveModalMode = 'invasion';
  pendingFortify = null;
  els.moveModalTitle.textContent = 'Invasione';
  els.moveModalLabel.textContent = 'Armate nella zona conquistata';
  els.fortifyText.textContent = `${TERRITORIES[pending.from].name} → ${TERRITORIES[pending.to].name} (lascia almeno 1 dietro)`;
  els.fortifyRange.min = String(min);
  els.fortifyRange.max = String(max);
  // Prefer moving most troops forward
  els.fortifyRange.value = String(max);
  els.fortifyCount.textContent = els.fortifyRange.value;
  els.fortifyCancel.classList.add('hidden');
  els.fortifyModal.classList.remove('hidden');
}

els.fortifyRange.addEventListener('input', () => {
  els.fortifyCount.textContent = els.fortifyRange.value;
});

els.fortifyCancel.addEventListener('click', () => {
  if (moveModalMode === 'invasion') return;
  pendingFortify = null;
  moveModalMode = null;
  els.fortifyModal.classList.add('hidden');
});

els.fortifyConfirm.addEventListener('click', () => {
  const armies = Number(els.fortifyRange.value);
  if (moveModalMode === 'invasion') {
    const toId = state.pendingInvasion?.to;
    applyAction(state, { type: 'CONFIRM_INVASION', armies });
    moveModalMode = null;
    els.fortifyModal.classList.add('hidden');
    els.fortifyCancel.classList.remove('hidden');
    if (toId) ui.selectedId = toId;
    refresh();
    return;
  }
  if (!pendingFortify) return;
  applyAction(state, {
    type: 'FORTIFY',
    from: pendingFortify.from,
    to: pendingFortify.to,
    armies,
  });
  pendingFortify = null;
  moveModalMode = null;
  ui.selectedId = null;
  els.fortifyModal.classList.add('hidden');
  refresh();
});


function refresh() {
  ui.highlightIds = computeHighlights(state, ui);
  renderMap(els.map, state, ui, onTerritoryClick);
  renderHud(els, state, ui);
  renderActions(els.actions, state, ui);
  updateHint();
  checkOverlay();
}

function updateHint() {
  const pid = state.currentPlayerId;
  if (state.phase === 'game_over') {
    els.mapHint.textContent = 'Partita terminata.';
    return;
  }
  if (state.phase === 'setup') {
    if (!state.players[pid].isHuman) {
      els.mapHint.textContent = 'Schieramento IA…';
      return;
    }
    els.mapHint.textContent = `Schieramento: clicca un tuo territorio (+1). Rimangono ${state.players[pid].setupRemaining} armate.`;
    return;
  }
  if (!state.players[pid].isHuman) {
    els.mapHint.textContent = 'Turno IA…';
    return;
  }
  if (state.pendingDrawAfterDiscard) {
    els.mapHint.textContent = 'Scarta una carta dalla mano per pescare.';
    return;
  }
  if (ui.mode === 'card_recruit') {
    els.mapHint.textContent = 'Scegli un tuo territorio per +2 armate.';
    return;
  }
  if (ui.mode === 'card_raid') {
    els.mapHint.textContent = 'Scegli un territorio nemico adiacente ai tuoi (>1 armata).';
    return;
  }
  if (ui.mode === 'card_forced_march') {
    els.mapHint.textContent = ui.marchFrom
      ? 'Scegli destinazione adiacente.'
      : 'Marcia forzata: scegli territorio di partenza.';
    return;
  }
  if (state.phase === 'reinforce') {
    els.mapHint.textContent = `Clicca i tuoi territori per piazzare ${state.reinforcementsRemaining} rinforzi.`;
    return;
  }
  if (state.phase === 'attack') {
    const cardHint =
      ui.selectedCardIndex != null
        ? ` Carta combat selezionata: ${CARDS[state.players[pid].hand[ui.selectedCardIndex]]?.name}.`
        : ' Seleziona una carta combat prima di attaccare (opzionale).';
    els.mapHint.textContent =
      (ui.selectedId
        ? `Attacca da ${TERRITORIES[ui.selectedId].name}: clicca un nemico adiacente.`
        : 'Seleziona un tuo territorio con ≥2 armate, poi il bersaglio.') + cardHint;
    return;
  }
  if (state.phase === 'fortify') {
    els.mapHint.textContent = ui.selectedId
      ? `Sposta da ${TERRITORIES[ui.selectedId].name}: clicca destinazione, poi scegli quante armate.`
      : 'Seleziona da dove spostare armate (un solo spostamento).';
  }
}

function checkOverlay() {
  if (state.phase !== 'game_over') return;
  const winner = state.players[state.winnerId];
  els.overlay.classList.remove('hidden');
  els.overlayTitle.textContent = winner.isHuman ? 'Vittoria!' : 'Sconfitta';
  els.overlayBody.textContent = winner.isHuman
    ? 'Hai conquistato il mondo.'
    : 'L’IA ha preso il controllo del pianeta.';
}

function onTerritoryClick(id) {
  if (busy) return;
  const pid = state.currentPlayerId;
  if (!state.players[pid]?.isHuman || state.phase === 'game_over') return;
  if (state.pendingDrawAfterDiscard) return;
  if (state.pendingInvasion) return;
  if (!els.fortifyModal.classList.contains('hidden')) return;

  if (state.phase === 'setup') {
    if (state.territories[id].owner !== pid) return;
    applyAction(state, { type: 'PLACE_REINFORCEMENT', territoryId: id });
    refresh();
    maybeRunAi();
    return;
  }

  if (ui.mode === 'card_recruit') {
    if (state.territories[id].owner !== pid) return;
    applyAction(state, {
      type: 'PLAY_ACTION_CARD',
      handIndex: ui.selectedCardIndex,
      territoryId: id,
    });
    ui.mode = null;
    ui.selectedCardIndex = null;
    refresh();
    return;
  }

  if (ui.mode === 'card_raid') {
    applyAction(state, {
      type: 'PLAY_ACTION_CARD',
      handIndex: ui.selectedCardIndex,
      territoryId: id,
    });
    ui.mode = null;
    ui.selectedCardIndex = null;
    refresh();
    return;
  }

  if (ui.mode === 'card_forced_march') {
    if (!ui.marchFrom) {
      if (state.territories[id].owner !== pid || state.territories[id].armies < 2) return;
      ui.marchFrom = id;
      refresh();
      return;
    }
    const from = ui.marchFrom;
    const max = Math.min(3, state.territories[from].armies - 1);
    applyAction(state, {
      type: 'PLAY_ACTION_CARD',
      handIndex: ui.selectedCardIndex,
      from,
      to: id,
      armies: max,
    });
    ui.mode = null;
    ui.marchFrom = null;
    ui.selectedCardIndex = null;
    refresh();
    return;
  }

  if (state.phase === 'reinforce') {
    if (state.territories[id].owner !== pid) return;
    applyAction(state, { type: 'PLACE_REINFORCEMENT', territoryId: id, count: 1 });
    ui.selectedId = id;
    refresh();
    return;
  }

  if (state.phase === 'attack') {
    const t = state.territories[id];
    if (!ui.selectedId) {
      if (t.owner === pid && t.armies >= 2) {
        ui.selectedId = id;
        refresh();
      }
      return;
    }
    if (id === ui.selectedId) {
      ui.selectedId = null;
      refresh();
      return;
    }
    if (t.owner === pid && t.armies >= 2) {
      ui.selectedId = id;
      refresh();
      return;
    }
    if (t.owner !== pid && areAdjacent(ui.selectedId, id)) {
      if (ui.selectedCardIndex != null) {
        const card = CARDS[state.players[pid].hand[ui.selectedCardIndex]];
        if (card?.type === 'combat') {
          applyAction(state, { type: 'SET_COMBAT_CARD', handIndex: ui.selectedCardIndex });
        }
      }
      applyAction(state, {
        type: 'ATTACK',
        from: ui.selectedId,
        to: id,
        attackDice: Math.min(3, state.territories[ui.selectedId].armies - 1),
      });
      ui.selectedCardIndex = null;
      if (state.lastBattle?.conquered) {
        ui.selectedId = id;
      } else if (state.territories[ui.selectedId]?.owner !== pid || state.territories[ui.selectedId].armies < 2) {
        ui.selectedId = null;
      }
      refresh();
      void (async () => {
        await maybeShowDice();
        if (state.pendingInvasion) openInvasionModal();
      })();
    }
    return;
  }

  if (state.phase === 'fortify') {
    const t = state.territories[id];
    if (!ui.selectedId) {
      if (t.owner === pid && t.armies >= 2) {
        ui.selectedId = id;
        refresh();
      }
      return;
    }
    if (id === ui.selectedId) {
      ui.selectedId = null;
      refresh();
      return;
    }
    if (t.owner === pid && canFortifyBetween(state, ui.selectedId, id)) {
      openFortifyModal(ui.selectedId, id);
    } else if (t.owner === pid && t.armies >= 2) {
      ui.selectedId = id;
      refresh();
    }
  }
}

ui.onCardClick = (index, card) => {
  const pid = state.currentPlayerId;
  if (!state.players[pid]?.isHuman) return;

  if (state.pendingDrawAfterDiscard) {
    applyAction(state, { type: 'DISCARD_FOR_DRAW', handIndex: index });
    refresh();
    return;
  }

  if (card.type === 'combat') {
    if (state.phase !== 'attack') return;
    ui.selectedCardIndex = ui.selectedCardIndex === index ? null : index;
    ui.mode = null;
    refresh();
    return;
  }

  // action cards
  ui.selectedCardIndex = index;
  if (card.effect.type === 'add_armies') {
    ui.mode = 'card_recruit';
  } else if (card.effect.type === 'damage_adjacent_enemy') {
    ui.mode = 'card_raid';
  } else if (card.effect.type === 'free_move') {
    ui.mode = 'card_forced_march';
    ui.marchFrom = null;
  } else if (card.effect.type === 'draw') {
    applyAction(state, { type: 'PLAY_ACTION_CARD', handIndex: index });
    ui.selectedCardIndex = null;
    ui.mode = null;
  }
  refresh();
};

ui.onEndPhase = () => {
  const pid = state.currentPlayerId;
  if (!state.players[pid]?.isHuman) return;
  applyAction(state, { type: 'END_PHASE' });
  ui.selectedId = null;
  ui.selectedCardIndex = null;
  ui.mode = null;
  refresh();
  maybeRunAi();
};

ui.onClearCombatCard = () => {
  ui.selectedCardIndex = null;
  applyAction(state, { type: 'SET_COMBAT_CARD', handIndex: null });
  refresh();
};

function maybeRunAi() {
  if (state.phase === 'game_over') {
    refresh();
    return;
  }
  if (state.players[state.currentPlayerId].isHuman) return;
  if (busy) return;

  els.mapHint.textContent = state.phase === 'setup' ? 'Schieramento IA…' : 'Turno IA…';
  setTimeout(async () => {
    let guard = 0;
    while (
      !state.players[state.currentPlayerId].isHuman &&
      state.phase !== 'game_over' &&
      guard++ < 80
    ) {
      const beforeKey = battleKey(state.lastBattle);
      if (state.phase === 'setup') {
        runAiTurn(state, { maxSteps: 5 });
      } else {
        runAiTurn(state);
        const afterKey = battleKey(state.lastBattle);
        if (afterKey && afterKey !== beforeKey && afterKey !== lastShownBattleKey) {
          refresh();
          await maybeShowDice();
        }
        break;
      }
      if (state.phase !== 'setup') break;
    }
    ui.selectedId = null;
    refresh();
    if (!state.players[state.currentPlayerId].isHuman && state.phase !== 'game_over') {
      maybeRunAi();
    }
  }, state.phase === 'setup' ? 120 : 350);
}

document.getElementById('btn-new').addEventListener('click', newGame);
document.getElementById('btn-overlay-new').addEventListener('click', newGame);

els.playerMission.addEventListener('click', () => {
  ui.missionExpanded = !ui.missionExpanded;
  refresh();
});

els.opponentPanel.addEventListener('click', () => {
  ui.opponentExpanded = !ui.opponentExpanded;
  refresh();
});

document.querySelector('.hud-stack')?.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.hud-fold-toggle');
  if (!btn) return;
  ev.preventDefault();
  const fold = btn.closest('.hud-fold');
  if (!fold) return;
  const open = !fold.classList.contains('is-open');
  fold.classList.toggle('is-open', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
});

newGame();
