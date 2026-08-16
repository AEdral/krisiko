import { createGame, applyAction, CARDS, TERRITORIES, areAdjacent, canFortifyBetween, PLAYER_SLOTS, MAX_PLAYERS } from './engine/game.js';
import { runAiTurn } from './ai/ai.js';
import { renderMap, computeHighlights } from './ui/map.js';
import { renderHud, renderActions } from './ui/hud.js';
import { showBattleDice } from './ui/dice.js';
import { createNet } from './net/client.js';

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
  lobbyModeLocal: document.getElementById('lobby-mode-local'),
  lobbyModeOnline: document.getElementById('lobby-mode-online'),
  lobbyModes: document.getElementById('lobby-modes'),
  lobbyTitle: document.getElementById('lobby-title'),
  lobbyJoinLead: document.getElementById('lobby-join-lead'),
  lobbyName: document.getElementById('lobby-name'),
  lobbyLead: document.getElementById('lobby-lead'),
  lobbySetup: document.getElementById('lobby-setup'),
  lobbyFriendsWrap: document.getElementById('lobby-friends-wrap'),
  lobbyFriendsCount: document.getElementById('lobby-friends-count'),
  lobbyFriendsMinus: document.getElementById('lobby-friends-minus'),
  lobbyFriendsPlus: document.getElementById('lobby-friends-plus'),
  lobbyError: document.getElementById('lobby-error'),
  lobbyWait: document.getElementById('lobby-wait'),
  lobbyLink: document.getElementById('lobby-link'),
  lobbyCopy: document.getElementById('lobby-copy'),
  lobbyWaitSeats: document.getElementById('lobby-wait-seats'),
  lobbyWaitHint: document.getElementById('lobby-wait-hint'),
  lobbyBegin: document.getElementById('lobby-begin'),
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
  localPlayerId: null,
  onCardClick: null,
  onEndPhase: null,
  onClearCombatCard: null,
};

const AI_COUNT_KEY = 'krisiko.aiCount';
const FRIENDS_KEY = 'krisiko.extraHumans';
const NAME_KEY = 'krisiko.playerName';
const MAX_AI = MAX_PLAYERS - 1;
let aiCount = loadAiCount();
let extraHumans = loadExtraHumans();
let lobbyMode = 'local';
let onlineRoom = null;
let netWait = false;
let joiningRoomId = null;
let joinPendingId = null;

function loadNum(key, fallback, min, max) {
  try {
    const n = Number(localStorage.getItem(key));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
  } catch {
    return fallback;
  }
}

function loadAiCount() {
  return loadNum(AI_COUNT_KEY, 1, 0, MAX_AI);
}

function loadExtraHumans() {
  return loadNum(FRIENDS_KEY, 1, 1, MAX_PLAYERS - 1);
}

function loadName() {
  try {
    return (localStorage.getItem(NAME_KEY) || '').slice(0, 20);
  } catch {
    return '';
  }
}

function persistLobby() {
  try {
    localStorage.setItem(AI_COUNT_KEY, String(aiCount));
    localStorage.setItem(FRIENDS_KEY, String(extraHumans));
    if (els.lobbyName?.value) localStorage.setItem(NAME_KEY, els.lobbyName.value.slice(0, 20));
  } catch {
    /* ignore */
  }
}

function playerName() {
  const n = (els.lobbyName?.value || '').trim();
  return n || 'Giocatore';
}

function roomUrl(id) {
  const path = location.pathname.endsWith('/') ? location.pathname : `${location.pathname}`;
  return `${location.origin}${path}?room=${encodeURIComponent(id)}`;
}

function showLobbyError(msg) {
  if (!els.lobbyError) return;
  els.lobbyError.textContent = msg || '';
  els.lobbyError.classList.toggle('hidden', !msg);
}

function clampOnlineCounts() {
  extraHumans = Math.max(1, Math.min(MAX_PLAYERS - 1, extraHumans));
  const maxAi = MAX_PLAYERS - 1 - extraHumans;
  if (aiCount > maxAi) aiCount = maxAi;
  if (aiCount < 0) aiCount = 0;
}

function renderWaitRoom(room) {
  onlineRoom = room;
  const joining = !!joinPendingId && !room;
  const waiting = lobbyMode === 'online' && room && room.status === 'lobby';
  els.lobbyWait.classList.toggle('hidden', !waiting);
  els.lobbySetup.classList.toggle('hidden', waiting || joining);
  els.lobbyStart.classList.toggle('hidden', waiting);
  els.lobbyModes?.classList.toggle('hidden', joining || waiting);
  els.lobbyJoinLead?.classList.toggle('hidden', !joining);
  if (els.lobbyTitle) {
    els.lobbyTitle.textContent = joining ? 'Entra nella stanza' : waiting ? 'Stanza' : 'Nuova partita';
  }
  if (!waiting) {
    els.lobbyBegin.classList.add('hidden');
    return;
  }
  const link = roomUrl(room.id);
  els.lobbyLink.value = link;
  history.replaceState(null, '', `?room=${encodeURIComponent(room.id)}`);
  els.lobbyWaitSeats.innerHTML = room.seats
    .map((s) => {
      const status =
        s.kind === 'ai' ? 'IA' : s.connected ? s.name : s.taken ? `${s.name} (offline)` : 'libero';
      return `<div class="lobby-seat-row"><span><i class="dot" style="background:${s.color}"></i>${s.id}</span><span>${status}</span></div>`;
    })
    .join('');
  const humansIn = room.seats.filter((s) => s.kind === 'human' && s.connected).length;
  const open = room.seats.filter((s) => s.kind === 'human' && !s.taken).length;
  els.lobbyWaitHint.textContent = room.you.isHost
    ? open
      ? `In attesa di ${open} giocator${open === 1 ? 'e' : 'i'}. I posti vuoti diventano IA se inizi.`
      : 'Tutti i posti umani sono pieni.'
    : 'In attesa che l’host inizi la partita…';
  const canStart = room.you.isHost && humansIn >= 1 && (humansIn >= 2 || room.seats.length >= 2);
  els.lobbyBegin.classList.toggle('hidden', !canStart);
}

function renderLobby() {
  const joining = !!joinPendingId && !onlineRoom;
  if (els.lobbyName && !joining && !els.lobbyName.value) els.lobbyName.value = loadName();
  els.lobbyModeLocal.classList.toggle('is-on', lobbyMode === 'local');
  els.lobbyModeLocal.classList.toggle('btn-ghost', lobbyMode !== 'local');
  els.lobbyModeOnline.classList.toggle('is-on', lobbyMode === 'online');
  els.lobbyModeOnline.classList.toggle('btn-ghost', lobbyMode !== 'online');

  if (lobbyMode === 'online') clampOnlineCounts();
  else if (aiCount < 1) aiCount = 1;

  els.lobbyAiCount.textContent = String(aiCount);
  els.lobbyAiLabel.textContent = aiCount === 1 ? 'IA' : 'IA';
  els.lobbyFriendsWrap.classList.toggle('hidden', lobbyMode !== 'local' ? false : true);
  if (lobbyMode === 'local') els.lobbyFriendsWrap.classList.add('hidden');
  else els.lobbyFriendsWrap.classList.remove('hidden');
  if (els.lobbyFriendsCount) els.lobbyFriendsCount.textContent = String(extraHumans);

  const friends = lobbyMode === 'online' ? extraHumans : 0;
  const total = 1 + friends + aiCount;
  els.lobbyLead.textContent =
    lobbyMode === 'online'
      ? 'Stanza via link. Amici + IA, massimo 6 giocatori. Niente account.'
      : 'Quanti avversari IA? Massimo 6 giocatori in totale.';
  els.lobbyTotal.textContent =
    lobbyMode === 'online'
      ? `Tu + ${extraHumans} amic${extraHumans === 1 ? 'o' : 'i'} + ${aiCount} IA · ${total} giocatori`
      : `Tu + ${aiCount} IA · ${total} giocatori`;
  els.lobbySlots.innerHTML = PLAYER_SLOTS.slice(0, total)
    .map((s, i) => {
      const label = i === 0 ? 'Tu' : lobbyMode === 'online' && i <= extraHumans ? 'Amico' : s.name.replace(/^IA /, '');
      return `<span class="lobby-slot"><i style="background:${s.color}"></i>${label}</span>`;
    })
    .join('');

  const minAi = lobbyMode === 'online' ? 0 : 1;
  const maxAi = lobbyMode === 'online' ? MAX_PLAYERS - 1 - extraHumans : MAX_AI;
  els.lobbyMinus.disabled = aiCount <= minAi;
  els.lobbyPlus.disabled = aiCount >= maxAi;
  if (els.lobbyFriendsMinus) els.lobbyFriendsMinus.disabled = extraHumans <= 1;
  if (els.lobbyFriendsPlus) {
    els.lobbyFriendsPlus.disabled = 1 + extraHumans + aiCount >= MAX_PLAYERS;
  }
  els.lobbyStart.textContent = joining ? 'Conferma' : lobbyMode === 'online' ? 'Crea stanza' : 'Inizia';
  els.lobbyCancel.classList.toggle('hidden', !state && !joining);
  renderWaitRoom(onlineRoom);
}

const net = createNet({
  error(message) {
    netWait = false;
    showLobbyError(message);
    if (joiningRoomId && !onlineRoom) {
      els.lobbyWait?.classList.add('hidden');
      els.lobbyStart?.classList.remove('hidden');
      if (joinPendingId) {
        els.lobbyJoinLead?.classList.remove('hidden');
        els.lobbyModes?.classList.add('hidden');
        els.lobbySetup?.classList.add('hidden');
      } else {
        els.lobbySetup?.classList.remove('hidden');
      }
    }
  },
  room(room) {
    showLobbyError('');
    renderWaitRoom(room);
    if (room.status === 'playing' && !state) {
      els.lobbyWaitHint.textContent = 'Avvio…';
    }
  },
  state(msg) {
    const first = !state;
    netWait = false;
    applyRemoteState(msg);
    if (first) {
      pendingFortify = null;
      lastShownBattleKey = null;
      busy = false;
      ui.mode = null;
      ui.selectedCardIndex = null;
    }
  },
});

function applyRemoteState(msg) {
  const prevKey = battleKey(state?.lastBattle);
  const hadInvasion = !!state?.pendingInvasion;
  ui.localPlayerId = msg.playerId;
  state = msg.state;
  closeLobby();
  if (onlineRoom) onlineRoom.status = state.phase === 'game_over' ? 'done' : 'playing';
  refresh();
  const key = battleKey(state.lastBattle);
  if (key && key !== prevKey && key !== lastShownBattleKey) {
    void (async () => {
      await maybeShowDice();
      if (state.pendingInvasion && isMyTurn() && !hadInvasion) openInvasionModal();
    })();
  } else if (state.pendingInvasion && isMyTurn() && els.fortifyModal.classList.contains('hidden')) {
    openInvasionModal();
  }
}

function isOnline() {
  return !!onlineRoom && onlineRoom.status !== 'lobby';
}

function localId() {
  return ui.localPlayerId || Object.values(state?.players || {}).find((p) => p.isHuman)?.id;
}

function isMyTurn() {
  return !!state && state.currentPlayerId === localId();
}

function dispatch(action, opts = {}) {
  if (onlineRoom && onlineRoom.status !== 'lobby') {
    if (netWait && !opts.skipWait) return;
    if (!opts.skipWait) netWait = true;
    net.action(action);
    return;
  }
  applyAction(state, action);
  if (!opts.silent) refresh();
  if (opts.ai) maybeRunAi();
}

function openLobby() {
  showLobbyError('');
  if (!joiningRoomId) {
    onlineRoom = onlineRoom && onlineRoom.status === 'lobby' ? onlineRoom : null;
  }
  renderLobby();
  els.lobby.classList.remove('hidden');
}

function closeLobby() {
  els.lobby.classList.add('hidden');
}

function resetUi() {
  ui.selectedId = null;
  ui.selectedCardIndex = null;
  ui.mode = null;
  ui.marchFrom = null;
  ui.missionExpanded = false;
  ui.expandedOpponentId = null;
  pendingFortify = null;
  lastShownBattleKey = null;
  busy = false;
  netWait = false;
}

function newGame() {
  persistLobby();
  if (joinPendingId && !onlineRoom) {
    void confirmJoin();
    return;
  }
  if (lobbyMode === 'online') {
    void createOnlineRoom();
    return;
  }
  onlineRoom = null;
  joiningRoomId = null;
  history.replaceState(null, '', location.pathname);
  state = createGame({ seed: Date.now() & 0xffffffff, aiCount: Math.max(1, aiCount) });
  ui.localPlayerId = Object.values(state.players).find((p) => p.isHuman)?.id || 'P1';
  resetUi();
  closeLobby();
  els.overlay.classList.add('hidden');
  els.fortifyModal.classList.add('hidden');
  els.diceOverlay.classList.add('hidden');
  refresh();
  maybeRunAi();
}

async function ensureNet() {
  try {
    await net.connect();
    return true;
  } catch {
    showLobbyError('Server online non raggiungibile. Usa npm start o Docker, non GitHub Pages.');
    return false;
  }
}

async function createOnlineRoom() {
  persistLobby();
  showLobbyError('');
  if (!(await ensureNet())) return;
  net.create({ name: playerName(), extraHumans, aiCount });
}

async function confirmJoin() {
  const name = (els.lobbyName?.value || '').trim();
  if (!name) {
    showLobbyError('Inserisci un nome, poi conferma.');
    els.lobbyName?.focus();
    return;
  }
  persistLobby();
  showLobbyError('');
  joiningRoomId = joinPendingId;
  els.lobbyStart.classList.add('hidden');
  els.lobbyWait.classList.remove('hidden');
  els.lobbyJoinLead?.classList.add('hidden');
  els.lobbyWaitHint.textContent = 'Connessione alla stanza…';
  if (!(await ensureNet())) {
    els.lobbyStart.classList.remove('hidden');
    els.lobbyWait.classList.add('hidden');
    els.lobbyJoinLead?.classList.remove('hidden');
    return;
  }
  net.join({ roomId: joinPendingId, name });
}

async function joinOnlineRoom(roomId) {
  lobbyMode = 'online';
  joinPendingId = roomId;
  joiningRoomId = null;
  onlineRoom = null;
  if (els.lobbyName) els.lobbyName.value = '';
  renderLobby();
  els.lobby.classList.remove('hidden');
  els.lobbyName?.focus();
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
    dispatch({ type: 'CONFIRM_INVASION', armies });
    moveModalMode = null;
    els.fortifyModal.classList.add('hidden');
    els.fortifyCancel.classList.remove('hidden');
    if (toId) ui.selectedId = toId;
    if (!onlineRoom || onlineRoom.status === 'lobby') refresh();
    return;
  }
  if (!pendingFortify) return;
  dispatch({
    type: 'FORTIFY',
    from: pendingFortify.from,
    to: pendingFortify.to,
    armies,
  });
  pendingFortify = null;
  moveModalMode = null;
  ui.selectedId = null;
  els.fortifyModal.classList.add('hidden');
  if (!onlineRoom || onlineRoom.status === 'lobby') refresh();
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
    if (!isMyTurn()) {
      els.mapHint.textContent = `Schieramento ${state.players[pid].name}…`;
      return;
    }
    els.mapHint.textContent = `Schieramento: clicca un tuo territorio (+1). Rimangono ${state.players[pid].setupRemaining} armate.`;
    return;
  }
  if (!isMyTurn()) {
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
  const me = localId();
  const winner = state.players[state.winnerId];
  const mine = winner?.id === me;
  els.overlay.classList.remove('hidden');
  els.overlayTitle.textContent = mine ? 'Vittoria!' : 'Sconfitta';
  els.overlayBody.textContent = mine
    ? 'Hai completato il tuo obiettivo.'
    : `${winner?.name || 'Qualcuno'} ha preso il controllo del pianeta.`;
}

function onTerritoryClick(id) {
  if (busy || !state) return;
  const pid = state.currentPlayerId;
  if (!isMyTurn() || state.phase === 'game_over') return;
  if (state.pendingDrawAfterDiscard) return;
  if (state.pendingInvasion) return;
  if (!els.fortifyModal.classList.contains('hidden')) return;

  if (state.phase === 'setup') {
    if (state.territories[id].owner !== pid) return;
    dispatch({ type: 'PLACE_REINFORCEMENT', territoryId: id }, { ai: true });
    return;
  }

  if (ui.mode === 'card_recruit') {
    if (state.territories[id].owner !== pid) return;
    dispatch({
      type: 'PLAY_ACTION_CARD',
      handIndex: ui.selectedCardIndex,
      territoryId: id,
    });
    ui.mode = null;
    ui.selectedCardIndex = null;
    return;
  }

  if (ui.mode === 'card_raid') {
    dispatch({
      type: 'PLAY_ACTION_CARD',
      handIndex: ui.selectedCardIndex,
      territoryId: id,
    });
    ui.mode = null;
    ui.selectedCardIndex = null;
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
    dispatch({
      type: 'PLAY_ACTION_CARD',
      handIndex: ui.selectedCardIndex,
      from,
      to: id,
      armies: max,
    });
    ui.mode = null;
    ui.marchFrom = null;
    ui.selectedCardIndex = null;
    return;
  }

  if (state.phase === 'reinforce') {
    if (state.territories[id].owner !== pid) return;
    dispatch({ type: 'PLACE_REINFORCEMENT', territoryId: id, count: 1 });
    ui.selectedId = id;
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
          dispatch({ type: 'SET_COMBAT_CARD', handIndex: ui.selectedCardIndex }, { skipWait: true, silent: true });
        }
      }
      const fromId = ui.selectedId;
      dispatch({
        type: 'ATTACK',
        from: fromId,
        to: id,
        attackDice: Math.min(3, state.territories[fromId].armies - 1),
      });
      ui.selectedCardIndex = null;
      if (!onlineRoom || onlineRoom.status === 'lobby') {
        if (state.lastBattle?.conquered) ui.selectedId = id;
        else if (state.territories[fromId]?.owner !== pid || state.territories[fromId].armies < 2) {
          ui.selectedId = null;
        }
        void (async () => {
          await maybeShowDice();
          if (state.pendingInvasion) openInvasionModal();
        })();
      } else {
        ui.selectedId = id;
      }
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
  if (!isMyTurn()) return;

  if (state.pendingDrawAfterDiscard) {
    dispatch({ type: 'DISCARD_FOR_DRAW', handIndex: index });
    return;
  }

  if (card.type === 'combat') {
    if (state.phase !== 'attack') return;
    ui.selectedCardIndex = ui.selectedCardIndex === index ? null : index;
    ui.mode = null;
    refresh();
    return;
  }

  ui.selectedCardIndex = index;
  if (card.effect.type === 'add_armies') {
    ui.mode = 'card_recruit';
  } else if (card.effect.type === 'damage_adjacent_enemy') {
    ui.mode = 'card_raid';
  } else if (card.effect.type === 'free_move') {
    ui.mode = 'card_forced_march';
    ui.marchFrom = null;
  } else if (card.effect.type === 'draw') {
    dispatch({ type: 'PLAY_ACTION_CARD', handIndex: index });
    ui.selectedCardIndex = null;
    ui.mode = null;
    return;
  }
  refresh();
};

ui.onEndPhase = () => {
  if (!isMyTurn()) return;
  dispatch({ type: 'END_PHASE' }, { ai: true });
  ui.selectedId = null;
  ui.selectedCardIndex = null;
  ui.mode = null;
};

ui.onClearCombatCard = () => {
  ui.selectedCardIndex = null;
  dispatch({ type: 'SET_COMBAT_CARD', handIndex: null }, { skipWait: true });
};

function maybeRunAi() {
  if (onlineRoom && onlineRoom.status !== 'lobby') return;
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
  const minAi = lobbyMode === 'online' ? 0 : 1;
  if (aiCount <= minAi) return;
  aiCount -= 1;
  renderLobby();
});
els.lobbyPlus.addEventListener('click', () => {
  const maxAi = lobbyMode === 'online' ? MAX_PLAYERS - 1 - extraHumans : MAX_AI;
  if (aiCount >= maxAi) return;
  aiCount += 1;
  renderLobby();
});
els.lobbyFriendsMinus?.addEventListener('click', () => {
  if (extraHumans <= 1) return;
  extraHumans -= 1;
  renderLobby();
});
els.lobbyFriendsPlus?.addEventListener('click', () => {
  if (1 + extraHumans + aiCount >= MAX_PLAYERS) return;
  extraHumans += 1;
  renderLobby();
});
els.lobbyModeLocal.addEventListener('click', () => {
  lobbyMode = 'local';
  joiningRoomId = null;
  if (!state) onlineRoom = null;
  showLobbyError('');
  renderLobby();
});
els.lobbyModeOnline.addEventListener('click', () => {
  lobbyMode = 'online';
  showLobbyError('');
  renderLobby();
});
els.lobbyStart.addEventListener('click', newGame);
els.lobbyBegin.addEventListener('click', () => net.start());
els.lobbyCopy.addEventListener('click', async () => {
  const link = els.lobbyLink.value;
  try {
    await navigator.clipboard.writeText(link);
    els.lobbyCopy.textContent = 'Copiato';
    setTimeout(() => {
      els.lobbyCopy.textContent = 'Copia';
    }, 1200);
  } catch {
    els.lobbyLink.select();
  }
});
els.lobbyName?.addEventListener('change', persistLobby);
els.lobbyName?.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  if (joinPendingId && !onlineRoom) void confirmJoin();
});
els.lobbyCancel.addEventListener('click', () => {
  if (joinPendingId && !onlineRoom && !state) {
    joinPendingId = null;
    joiningRoomId = null;
    history.replaceState(null, '', location.pathname);
    lobbyMode = 'local';
    showLobbyError('');
    renderLobby();
    return;
  }
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

const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
  joinOnlineRoom(roomParam.toLowerCase());
} else {
  openLobby();
}
