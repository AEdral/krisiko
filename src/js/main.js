import { createGame, applyAction, CARDS, TERRITORIES, areAdjacent, canFortifyBetween, PLAYER_SLOTS, MAX_PLAYERS } from './engine/game.js';
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
  lobby: document.getElementById('lobby'),
  lobbyAiCount: document.getElementById('lobby-ai-count'),
  lobbyAiLabel: document.getElementById('lobby-ai-label'),
  lobbySlots: document.getElementById('lobby-slots'),
  lobbyTotal: document.getElementById('lobby-total'),
  lobbyCancel: document.getElementById('lobby-cancel'),
  lobbyStart: document.getElementById('lobby-start'),
  lobbyMinus: document.getElementById('lobby-ai-minus'),
  lobbyPlus: document.getElementById('lobby-ai-plus'),
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
  expandedOpponentId: null,
  onCardClick: null,
  onEndPhase: null,
  onClearCombatCard: null,
};

const AI_COUNT_KEY = 'krisiko.aiCount';
const MAX_AI = MAX_PLAYERS - 1;
let aiCount = loadAiCount();

function loadAiCount() {
  try {
    const n = Number(localStorage.getItem(AI_COUNT_KEY));
    if (!Number.isFinite(n)) return 1;
    return Math.min(MAX_AI, Math.max(1, Math.floor(n)));
  } catch {
    return 1;
  }
}

function persistAiCount() {
  try {
    localStorage.setItem(AI_COUNT_KEY, String(aiCount));
  } catch {
    /* ignore */
  }
}

function renderLobby() {
  els.lobbyAiCount.textContent = String(aiCount);
  els.lobbyAiLabel.textContent = aiCount === 1 ? 'avversario' : 'avversari';
  const total = 1 + aiCount;
  els.lobbyTotal.textContent = `Tu + ${aiCount} IA · ${total} giocatori`;
  els.lobbySlots.innerHTML = PLAYER_SLOTS.slice(0, total)
    .map(
      (s) =>
        `<span class="lobby-slot"><i style="background:${s.color}"></i>${s.id === 'P1' ? 'Tu' : s.name.replace(/^IA /, '')}</span>`
    )
    .join('');
  els.lobbyMinus.disabled = aiCount <= 1;
  els.lobbyPlus.disabled = aiCount >= MAX_AI;
  els.lobbyCancel.classList.toggle('hidden', !state);
}

function openLobby() {
  renderLobby();
  els.lobby.classList.remove('hidden');
}

function closeLobby() {
  els.lobby.classList.add('hidden');
}

function newGame() {
  persistAiCount();
  state = createGame({ seed: Date.now() & 0xffffffff, aiCount });
  ui.selectedId = null;
  ui.selectedCardIndex = null;
  ui.mode = null;
  ui.marchFrom = null;
  ui.missionExpanded = false;
  ui.expandedOpponentId = null;
  pendingFortify = null;
  lastShownBattleKey = null;
  busy = false;
  closeLobby();
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
  if (!state) {
    els.mapHint.textContent = 'Scegli gli avversari IA per iniziare.';
    return;
  }
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
      els.mapHint.textContent = `Schieramento ${state.players[pid].name}…`;
      return;
    }
    els.mapHint.textContent = `Schieramento: clicca un tuo territorio (+1). Rimangono ${state.players[pid].setupRemaining} armate.`;
    return;
  }
  if (!state.players[pid].isHuman) {
    els.mapHint.textContent = `Turno ${state.players[pid].name}…`;
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
    ? 'Hai completato il tuo obiettivo.'
    : `${winner.name} ha preso il controllo del pianeta.`;
}

function onTerritoryClick(id) {
  if (busy || !state) return;
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
  if (!state || state.phase === 'game_over') {
    if (state) refresh();
    return;
  }
  if (state.players[state.currentPlayerId].isHuman) return;
  if (busy) return;

  els.mapHint.textContent = state.phase === 'setup'
    ? `Schieramento ${state.players[state.currentPlayerId].name}…`
    : `Turno ${state.players[state.currentPlayerId].name}…`;
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

document.getElementById('btn-new').addEventListener('click', openLobby);
document.getElementById('btn-overlay-new').addEventListener('click', () => {
  els.overlay.classList.add('hidden');
  openLobby();
});

els.lobbyMinus.addEventListener('click', () => {
  if (aiCount <= 1) return;
  aiCount -= 1;
  renderLobby();
});
els.lobbyPlus.addEventListener('click', () => {
  if (aiCount >= MAX_AI) return;
  aiCount += 1;
  renderLobby();
});
els.lobbyStart.addEventListener('click', newGame);
els.lobbyCancel.addEventListener('click', () => {
  if (!state) return;
  closeLobby();
});

const appEl = document.getElementById('app');
const btnRail = document.getElementById('btn-rail');
const railBackdrop = document.getElementById('rail-backdrop');

function setRailOpen(open) {
  appEl.classList.toggle('rail-open', open);
  btnRail?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

btnRail?.addEventListener('click', () => {
  setRailOpen(!appEl.classList.contains('rail-open'));
});
railBackdrop?.addEventListener('click', () => setRailOpen(false));
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    setRailOpen(false);
    if (state && !els.lobby.classList.contains('hidden')) closeLobby();
  }
});

els.playerMission.addEventListener('click', () => {
  ui.missionExpanded = !ui.missionExpanded;
  refresh();
});

els.opponentPanel.addEventListener('click', (ev) => {
  const row = ev.target.closest('[data-opp-id]');
  if (!row) return;
  const id = row.dataset.oppId;
  ui.expandedOpponentId = ui.expandedOpponentId === id ? null : id;
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

openLobby();
