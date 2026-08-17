import { createGame, applyAction, CARDS, TERRITORIES, areAdjacent, canFortifyBetween, PLAYER_SLOTS, MAX_PLAYERS } from './engine/game.js';
import { isValidClassicSet } from './data/classic-cards.js';
import { runAiTurn } from './ai/ai.js';
import { renderMap, computeHighlights } from './ui/map.js';
import { renderHud, renderActions } from './ui/hud.js';
import { showBattleDice } from './ui/dice.js';
import { createNet, describeNetError } from './net/client.js';

const els = {
  app: document.getElementById('app'),
  gameShell: document.getElementById('game-shell'),
  screenHome: document.getElementById('screen-home'),
  screenSetup: document.getElementById('screen-setup'),
  screenJoin: document.getElementById('screen-join'),
  screenWait: document.getElementById('screen-wait'),
  homeNew: document.getElementById('home-new'),
  setupLogo: document.getElementById('setup-logo'),
  gameLogo: document.getElementById('game-logo'),
  setupName: document.getElementById('setup-name'),
  setupModeLocal: document.getElementById('setup-mode-local'),
  setupModeOnline: document.getElementById('setup-mode-online'),
  setupModeHelp: document.getElementById('setup-mode-help'),
  setupPlayersHelp: document.getElementById('setup-players-help'),
  setupAiCount: document.getElementById('setup-ai-count'),
  setupSlots: document.getElementById('setup-slots'),
  setupTotal: document.getElementById('setup-total'),
  setupFriendsWrap: document.getElementById('setup-friends-wrap'),
  setupFriendsCount: document.getElementById('setup-friends-count'),
  setupDraw: document.getElementById('setup-draw'),
  setupVanilla: document.getElementById('setup-vanilla'),
  setupError: document.getElementById('setup-error'),
  setupBack: document.getElementById('setup-back'),
  setupStart: document.getElementById('setup-start'),
  setupMinus: document.getElementById('setup-ai-minus'),
  setupPlus: document.getElementById('setup-ai-plus'),
  setupFriendsMinus: document.getElementById('setup-friends-minus'),
  setupFriendsPlus: document.getElementById('setup-friends-plus'),
  joinName: document.getElementById('join-name'),
  joinError: document.getElementById('join-error'),
  joinBack: document.getElementById('join-back'),
  joinConfirm: document.getElementById('join-confirm'),
  waitRules: document.getElementById('wait-rules'),
  waitLink: document.getElementById('wait-link'),
  waitCopy: document.getElementById('wait-copy'),
  waitSeats: document.getElementById('wait-seats'),
  waitHint: document.getElementById('wait-hint'),
  waitError: document.getElementById('wait-error'),
  waitBack: document.getElementById('wait-back'),
  waitBegin: document.getElementById('wait-begin'),
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
  expandedOpponentId: null,
  localPlayerId: null,
  classicCardSelection: [],
  onCardClick: null,
  onEndPhase: null,
  onClearCombatCard: null,
  onTradeClassic: null,
};

const AI_COUNT_KEY = 'krisiko.aiCount';
const FRIENDS_KEY = 'krisiko.extraHumans';
const NAME_KEY = 'krisiko.playerName';
const MODE_KEY = 'krisiko.lobbyMode';
const VANILLA_KEY = 'krisiko.vanillaMode';
const DRAW_KEY = 'krisiko.drawEveryTurn';
const LOGO_KRISIKO = 'assets/logo-wordmark.png';
const LOGO_CLASSIC = 'assets/logo-vanilla-wordmark.png';
const MAX_AI = MAX_PLAYERS - 1;
let aiCount = loadAiCount();
let extraHumans = loadExtraHumans();
let lobbyMode = loadLobbyMode();
let vanillaMode = loadVanillaMode();
let drawEveryTurn = loadDrawEveryTurn();
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

function loadBool(key, fallback = false) {
  try {
    const v = localStorage.getItem(key);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function loadLobbyMode() {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === 'online' ? 'online' : 'local';
  } catch {
    return 'local';
  }
}

function loadVanillaMode() {
  return loadBool(VANILLA_KEY, false);
}

function loadDrawEveryTurn() {
  return loadBool(DRAW_KEY, false);
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
    localStorage.setItem(MODE_KEY, lobbyMode);
    localStorage.setItem(VANILLA_KEY, String(vanillaMode));
    localStorage.setItem(DRAW_KEY, String(drawEveryTurn));
    const name = (els.setupName?.value || els.joinName?.value || '').trim();
    if (name) localStorage.setItem(NAME_KEY, name.slice(0, 20));
  } catch {
    /* ignore */
  }
}

function playerName(fromJoin = false) {
  const el = fromJoin ? els.joinName : els.setupName;
  const n = (el?.value || '').trim();
  return n || 'Giocatore';
}

function rulesSummary({ vanilla, draw }) {
  const bits = [vanilla ? 'Classico' : 'Krisiko'];
  if (!vanilla && draw) bits.push('pesca ogni turno');
  if (vanilla) bits.push('carte territorio');
  return bits.map((b) => `<span class="pill">${b}</span>`).join('');
}

function showFlowScreen(name) {
  const map = {
    home: els.screenHome,
    setup: els.screenSetup,
    join: els.screenJoin,
    wait: els.screenWait,
  };
  for (const [key, el] of Object.entries(map)) {
    el?.classList.toggle('hidden', key !== name);
  }
  els.gameShell?.classList.toggle('hidden', name !== 'game');
}

function showHome() {
  showFlowScreen('home');
  clearFlowErrors();
}

function showSetup() {
  if (els.setupName && !els.setupName.value) els.setupName.value = loadName();
  renderSetup();
  showFlowScreen('setup');
  clearFlowErrors();
}

function showJoinScreen() {
  if (els.joinName) els.joinName.value = '';
  showFlowScreen('join');
  clearFlowErrors();
  els.joinName?.focus();
}

function showWaitScreen() {
  showFlowScreen('wait');
  clearFlowErrors();
}

function syncBrandLogo(classic) {
  const src = classic ? LOGO_CLASSIC : LOGO_KRISIKO;
  const alt = classic ? 'Risiko Classico' : 'Krisiko';
  if (els.setupLogo) {
    els.setupLogo.src = src;
    els.setupLogo.alt = alt;
  }
  if (els.gameLogo) {
    els.gameLogo.src = src;
    els.gameLogo.alt = alt;
  }
}

function enterGame() {
  showFlowScreen('game');
  clearFlowErrors();
  els.app?.classList.toggle('vanilla-mode', !!state?.vanillaMode);
  syncBrandLogo(!!state?.vanillaMode);
}

function clearFlowErrors() {
  showFlowError('setup', '');
  showFlowError('join', '');
  showFlowError('wait', '');
}

function showFlowError(which, msg) {
  const el =
    which === 'setup' ? els.setupError : which === 'join' ? els.joinError : els.waitError;
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

function roomUrl(id) {
  const path = location.pathname.endsWith('/') ? location.pathname : `${location.pathname}`;
  return `${location.origin}${path}?room=${encodeURIComponent(id)}`;
}

function syncRuleToggles() {
  if (els.setupDraw) {
    els.setupDraw.disabled = vanillaMode;
    els.setupDraw.setAttribute('aria-pressed', drawEveryTurn ? 'true' : 'false');
    els.setupDraw.textContent = drawEveryTurn ? 'On' : 'Off';
  }
  if (els.setupVanilla) {
    els.setupVanilla.setAttribute('aria-pressed', vanillaMode ? 'true' : 'false');
    els.setupVanilla.textContent = vanillaMode ? 'On' : 'Off';
  }
  syncBrandLogo(vanillaMode);
}

function renderWait(room) {
  onlineRoom = room;
  if (!room) return;
  const link = roomUrl(room.id);
  els.waitLink.value = link;
  history.replaceState(null, '', `?room=${encodeURIComponent(room.id)}`);
  els.waitRules.innerHTML = rulesSummary({
    vanilla: room.vanillaMode,
    draw: room.drawEveryTurn,
  });
  els.waitSeats.innerHTML = room.seats
    .map((s) => {
      const status =
        s.kind === 'ai' ? 'IA' : s.connected ? s.name : s.taken ? `${s.name} (offline)` : 'libero';
      return `<div class="lobby-seat-row"><span><i class="dot" style="background:${s.color}"></i>${s.id}</span><span>${status}</span></div>`;
    })
    .join('');
  const humansIn = room.seats.filter((s) => s.kind === 'human' && s.connected).length;
  const open = room.seats.filter((s) => s.kind === 'human' && !s.taken).length;
  const hostKeepOpen =
    net.mode === 'p2p' && room.you.isHost ? ' Tieni aperta questa scheda: sei il server della stanza.' : '';
  els.waitHint.textContent = room.you.isHost
    ? open
      ? `In attesa di ${open} giocator${open === 1 ? 'e' : 'i'}. I posti vuoti diventano IA se inizi.${hostKeepOpen}`
      : `Tutti i posti umani sono pieni.${hostKeepOpen}`
    : 'In attesa che l’host inizi la partita…';
  const canStart = room.you.isHost && humansIn >= 1 && (humansIn >= 2 || room.seats.length >= 2);
  els.waitBegin.classList.toggle('hidden', !canStart);
  els.waitBack.classList.toggle('hidden', !room.you.isHost || room.status !== 'lobby');
}

function renderSetup() {
  els.setupModeLocal.classList.toggle('is-on', lobbyMode === 'local');
  els.setupModeLocal.classList.toggle('btn-ghost', lobbyMode !== 'local');
  els.setupModeOnline.classList.toggle('is-on', lobbyMode === 'online');
  els.setupModeOnline.classList.toggle('btn-ghost', lobbyMode !== 'online');

  if (lobbyMode === 'online') clampOnlineCounts();
  else if (aiCount < 1) aiCount = 1;

  syncRuleToggles();

  els.setupAiCount.textContent = String(aiCount);
  els.setupFriendsWrap.classList.toggle('hidden', lobbyMode !== 'online');
  if (els.setupFriendsCount) els.setupFriendsCount.textContent = String(extraHumans);

  els.setupModeHelp.textContent =
    lobbyMode === 'online'
      ? 'Stanza privata via link; i posti vuoti diventano IA se inizi.'
      : 'Questo browser: tu + IA.';
  els.setupPlayersHelp.textContent =
    lobbyMode === 'online'
      ? 'Tu + amici (link) + IA, massimo 6 giocatori.'
      : 'Tu + avversari IA (2–6 totali).';

  const friends = lobbyMode === 'online' ? extraHumans : 0;
  const total = 1 + friends + aiCount;
  els.setupTotal.textContent =
    lobbyMode === 'online'
      ? `Tu + ${extraHumans} amic${extraHumans === 1 ? 'o' : 'i'} + ${aiCount} IA · ${total} giocatori`
      : `Tu + ${aiCount} IA · ${total} giocatori`;
  els.setupSlots.innerHTML = PLAYER_SLOTS.slice(0, total)
    .map((s, i) => {
      const label = i === 0 ? 'Tu' : lobbyMode === 'online' && i <= extraHumans ? 'Amico' : s.name.replace(/^IA /, '');
      return `<span class="lobby-slot"><i style="background:${s.color}"></i>${label}</span>`;
    })
    .join('');

  const minAi = lobbyMode === 'online' ? 0 : 1;
  const maxAi = lobbyMode === 'online' ? MAX_PLAYERS - 1 - extraHumans : MAX_AI;
  els.setupMinus.disabled = aiCount <= minAi;
  els.setupPlus.disabled = aiCount >= maxAi;
  if (els.setupFriendsMinus) els.setupFriendsMinus.disabled = extraHumans <= 1;
  if (els.setupFriendsPlus) {
    els.setupFriendsPlus.disabled = 1 + extraHumans + aiCount >= MAX_PLAYERS;
  }
  els.setupStart.textContent = lobbyMode === 'online' ? 'Crea stanza' : 'Inizia';
}

function clampOnlineCounts() {
  extraHumans = Math.max(1, Math.min(MAX_PLAYERS - 1, extraHumans));
  const maxAi = MAX_PLAYERS - 1 - extraHumans;
  if (aiCount > maxAi) aiCount = maxAi;
  if (aiCount < 0) aiCount = 0;
}

const net = createNet({
  error(message) {
    netWait = false;
    if (joiningRoomId && !onlineRoom) showFlowError('join', message);
    else if (onlineRoom?.status === 'lobby') showFlowError('wait', message);
    else showFlowError('setup', message);
    if (joiningRoomId && !onlineRoom) showJoinScreen();
    else if (onlineRoom?.status === 'lobby') showWaitScreen();
  },
  room(room) {
    clearFlowErrors();
    renderWait(room);
    if (room.status === 'lobby') showWaitScreen();
    else if (room.status === 'playing' && !state) els.waitHint.textContent = 'Avvio…';
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
  enterGame();
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

function startLocalGame() {
  persistLobby();
  onlineRoom = null;
  joiningRoomId = null;
  joinPendingId = null;
  history.replaceState(null, '', location.pathname);
  state = createGame({
    seed: Date.now() & 0xffffffff,
    aiCount: Math.max(1, aiCount),
    vanillaMode,
    drawEveryTurn,
  });
  ui.localPlayerId = Object.values(state.players).find((p) => p.isHuman)?.id || 'P1';
  resetUi();
  enterGame();
  els.overlay.classList.add('hidden');
  els.fortifyModal.classList.add('hidden');
  els.diceOverlay.classList.add('hidden');
  refresh();
  maybeRunAi();
}

function startSetup() {
  persistLobby();
  if (lobbyMode === 'online') {
    void createOnlineRoom();
    return;
  }
  startLocalGame();
}

async function ensureNet() {
  try {
    await net.connect();
    return true;
  } catch (err) {
    showFlowError('setup', describeNetError(err));
    return false;
  }
}

async function createOnlineRoom() {
  persistLobby();
  showFlowError('setup', '');
  if (!(await ensureNet())) return;
  showWaitScreen();
  els.waitHint.textContent = 'Apertura stanza…';
  els.waitBegin.classList.add('hidden');
  try {
    await net.create({
      name: playerName(),
      extraHumans,
      aiCount,
      vanillaMode,
      drawEveryTurn,
    });
  } catch (err) {
    showSetup();
    showFlowError('setup', describeNetError(err));
  }
}

async function confirmJoin() {
  const name = (els.joinName?.value || '').trim();
  if (!name) {
    showFlowError('join', 'Inserisci un nome, poi conferma.');
    els.joinName?.focus();
    return;
  }
  persistLobby();
  showFlowError('join', '');
  joiningRoomId = joinPendingId;
  showWaitScreen();
  els.waitHint.textContent = 'Connessione alla stanza…';
  if (!(await ensureNet())) {
    showJoinScreen();
    return;
  }
  try {
    await net.join({ roomId: joinPendingId, name });
  } catch (err) {
    showJoinScreen();
    showFlowError('join', describeNetError(err));
  }
}

function joinOnlineRoom(roomId) {
  lobbyMode = 'online';
  joinPendingId = roomId;
  joiningRoomId = null;
  onlineRoom = null;
  showJoinScreen();
}

function resetUi() {
  ui.selectedId = null;
  ui.selectedCardIndex = null;
  ui.classicCardSelection = [];
  ui.mode = null;
  ui.marchFrom = null;
  ui.missionExpanded = false;
  ui.expandedOpponentId = null;
  pendingFortify = null;
  lastShownBattleKey = null;
  busy = false;
  netWait = false;
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
    els.mapHint.textContent = 'Nuova partita dalla home.';
    return;
  }
  els.app?.classList.toggle('vanilla-mode', !!state.vanillaMode);
  syncBrandLogo(!!state.vanillaMode);
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
  if (state.vanillaMode && state.pendingClassicDraw) {
    els.mapHint.textContent =
      'Hai vinto una carta ma la mano è piena: in fase rinforzi seleziona 3 carte e scambia un set.';
    return;
  }
  if (state.vanillaMode && state.phase === 'reinforce' && ui.classicCardSelection?.length) {
    const n = ui.classicCardSelection.length;
    els.mapHint.textContent =
      n < 3
        ? `Seleziona ${3 - n} carta/e per scambiare un set (3 uguali o 1 per simbolo).`
        : isValidClassicSet(state.players[pid].hand, ui.classicCardSelection)
          ? 'Set valido: premi «Scambia set» per rinforzi extra.'
          : 'Combinazione non valida: serve 3 uguali o 1 Fante, 1 Cavallo, 1 Cannone.';
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
    const tradeHint =
      state.vanillaMode && state.players[pid].hand.length >= 3
        ? ' Puoi scambiare set di 3 carte dalla mano.'
        : '';
    els.mapHint.textContent = `Clicca i tuoi territori per piazzare ${state.reinforcementsRemaining} rinforzi.${tradeHint}`;
    return;
  }
  if (state.phase === 'attack') {
    if (state.vanillaMode) {
      els.mapHint.textContent = ui.selectedId
        ? `Attacca da ${TERRITORIES[ui.selectedId].name}: clicca un nemico adiacente.`
        : 'Seleziona un tuo territorio con ≥2 armate, poi il bersaglio. Conquista = 1 carta territorio.';
      return;
    }
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

  if (state.vanillaMode && card.type === 'classic') {
    if (state.phase !== 'reinforce') return;
    const sel = ui.classicCardSelection || (ui.classicCardSelection = []);
    const pos = sel.indexOf(index);
    if (pos >= 0) sel.splice(pos, 1);
    else if (sel.length < 3) sel.push(index);
    refresh();
    return;
  }

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

ui.onTradeClassic = () => {
  if (!isMyTurn() || !state?.vanillaMode || state.phase !== 'reinforce') return;
  const sel = ui.classicCardSelection;
  if (!sel || sel.length !== 3) return;
  if (!isValidClassicSet(state.players[state.currentPlayerId].hand, sel)) return;
  dispatch({ type: 'TRADE_CLASSIC_CARDS', handIndices: [...sel] }, { ai: true });
  ui.classicCardSelection = [];
  ui.selectedCardIndex = null;
  ui.mode = null;
};

ui.onEndPhase = () => {
  if (!isMyTurn()) return;
  dispatch({ type: 'END_PHASE' }, { ai: true });
  ui.selectedId = null;
  ui.selectedCardIndex = null;
  ui.classicCardSelection = [];
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

function returnToHome() {
  state = null;
  onlineRoom = null;
  joiningRoomId = null;
  joinPendingId = null;
  net.close();
  history.replaceState(null, '', location.pathname);
  els.overlay.classList.add('hidden');
  els.app?.classList.remove('vanilla-mode');
  syncBrandLogo(false);
  showHome();
}

document.getElementById('btn-new').addEventListener('click', () => {
  if (state) returnToHome();
  else showSetup();
});
document.getElementById('btn-overlay-new').addEventListener('click', () => {
  els.overlay.classList.add('hidden');
  returnToHome();
});

els.homeNew?.addEventListener('click', showSetup);
els.setupBack?.addEventListener('click', showHome);
els.setupStart?.addEventListener('click', startSetup);
els.joinBack?.addEventListener('click', () => {
  joinPendingId = null;
  joiningRoomId = null;
  history.replaceState(null, '', location.pathname);
  showHome();
});
els.joinConfirm?.addEventListener('click', () => void confirmJoin());
els.waitBack?.addEventListener('click', () => {
  net.close();
  onlineRoom = null;
  showSetup();
});
els.waitBegin?.addEventListener('click', () => net.start());
els.waitCopy?.addEventListener('click', async () => {
  const link = els.waitLink.value;
  try {
    await navigator.clipboard.writeText(link);
    els.waitCopy.textContent = 'Copiato';
    setTimeout(() => {
      els.waitCopy.textContent = 'Copia';
    }, 1200);
  } catch {
    els.waitLink.select();
  }
});

els.setupMinus?.addEventListener('click', () => {
  const minAi = lobbyMode === 'online' ? 0 : 1;
  if (aiCount <= minAi) return;
  aiCount -= 1;
  renderSetup();
});
els.setupPlus?.addEventListener('click', () => {
  const maxAi = lobbyMode === 'online' ? MAX_PLAYERS - 1 - extraHumans : MAX_AI;
  if (aiCount >= maxAi) return;
  aiCount += 1;
  renderSetup();
});
els.setupFriendsMinus?.addEventListener('click', () => {
  if (extraHumans <= 1) return;
  extraHumans -= 1;
  renderSetup();
});
els.setupFriendsPlus?.addEventListener('click', () => {
  if (1 + extraHumans + aiCount >= MAX_PLAYERS) return;
  extraHumans += 1;
  renderSetup();
});
els.setupModeLocal?.addEventListener('click', () => {
  lobbyMode = 'local';
  renderSetup();
});
els.setupModeOnline?.addEventListener('click', () => {
  lobbyMode = 'online';
  renderSetup();
});
els.setupDraw?.addEventListener('click', () => {
  if (vanillaMode) return;
  drawEveryTurn = !drawEveryTurn;
  renderSetup();
});
els.setupVanilla?.addEventListener('click', () => {
  vanillaMode = !vanillaMode;
  if (vanillaMode) drawEveryTurn = false;
  renderSetup();
});
els.setupName?.addEventListener('change', persistLobby);
els.joinName?.addEventListener('change', persistLobby);
els.joinName?.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  void confirmJoin();
});
els.setupName?.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  startSetup();
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
  showHome();
}
