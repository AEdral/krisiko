/**
 * Online stack sync — headless tests.
 * Run from src/js: node stack-online-test.js
 */
import {
  createGame, applyAction, isActionAllowed, getCard, CARDS,
  getLegalActions, canFortifyBetween, maxFortifyArmies,
} from './engine/game.js';
import { runAiTurn } from './ai/ai.js';
import {
  createRoom,
  joinRoom,
  startRoom,
  handleAction,
  getRoomForTest,
  tickRoomStack,
} from './net/rooms.js';
import { getPlayerTerritories } from './engine/game.js';
import { STACK_WINDOW_MS } from './engine/stack.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function mockWs(clientId) {
  return { clientId, roomId: null, readyState: 1, send() {} };
}

/** Mette in mano una carta con quel baseId e ritorna il suo indice. */
function giveCard(state, pid, baseId) {
  const id = Object.keys(CARDS).find((cid) => CARDS[cid].baseId === baseId);
  if (!id) throw new Error(`no card with baseId ${baseId}`);
  state.players[pid].hand.push(id);
  return state.players[pid].hand.length - 1;
}

function firstAttack(state, pid) {
  for (const from of getPlayerTerritories(state, pid)) {
    if (state.territories[from].armies < 2) continue;
    for (const to of state.adjacency[from]) {
      if (state.territories[to].owner !== pid) {
        return { from, to };
      }
    }
  }
  return null;
}

function testIsActionAllowed() {
  const state = createGame({
    seed: 99,
    seats: [
      { name: 'A', isHuman: true },
      { name: 'B', isHuman: true },
    ],
  });
  state.players.P1.isHuman = true;
  state.players.P2.isHuman = true;
  state.phase = 'attack';
  state.currentPlayerId = 'P1';
  state.reinforcementsRemaining = 0;
  for (const tid of getPlayerTerritories(state, 'P1')) {
    state.territories[tid].armies = Math.max(state.territories[tid].armies, 3);
  }

  // La finestra combat si apre solo se qualcuno ha davvero una carta giocabile:
  // con 1 dado d'attacco perde esattamente un lato, e quel lato ha la combat in mano.
  const p1CombatIdx = giveCard(state, 'P1', 'advantage');
  const p2CombatIdx = giveCard(state, 'P2', 'advantage');
  const p2NegateIdx = giveCard(state, 'P2', 'negate');

  const atk = firstAttack(state, 'P1');
  assert(atk, 'attack pair exists');
  applyAction(state, {
    type: 'ATTACK',
    from: atk.from,
    to: atk.to,
    attackDice: 1,
    nowMs: 1000,
  });

  assert(state.responseWindow?.kind === 'combat', 'combat window open');
  assert(state.combatContext, 'combat context set');

  assert(!isActionAllowed(state, 'P2', { type: 'END_PHASE' }), 'guest cannot end phase');
  assert(!isActionAllowed(state, 'P2', { type: 'ATTACK', ...atk }), 'guest cannot attack');

  const attackerLoses = state.combatContext.attLossPreview > 0;
  const loser = attackerLoses ? 'P1' : 'P2';
  const winner = attackerLoses ? 'P2' : 'P1';
  const loserIdx = attackerLoses ? p1CombatIdx : p2CombatIdx;
  const winnerIdx = attackerLoses ? p2CombatIdx : p1CombatIdx;
  assert(
    isActionAllowed(state, loser, { type: 'CAST_START', handIndex: loserIdx }),
    'chi perde truppe può lanciare una combat',
  );
  assert(
    !isActionAllowed(state, winner, { type: 'CAST_START', handIndex: winnerIdx }),
    'chi non perde truppe non lancia combat',
  );
  assert(
    !isActionAllowed(state, 'P2', { type: 'CAST_START', handIndex: p2NegateIdx }),
    'niente instant nella finestra combat aperta',
  );

  assert(isActionAllowed(state, loser, { type: 'PASS_STACK' }), 'chi può rispondere può passare');
  applyAction(state, { type: 'PASS_STACK', playerId: loser, nowMs: 1000 });
  assert(!state.responseWindow, 'passa l\u2019unico che poteva rispondere: finestra chiusa');
  assert(!state.combatContext, 'combattimento risolto alla chiusura');

  assert(isActionAllowed(state, 'P1', { type: 'END_PHASE' }), 'fine fase sbloccata a stack vuoto');
}

/** Nessuna carta giocabile: l'attacco si risolve subito, senza finestra da 10s. */
function testNoWindowWithoutPlayableCards() {
  const state = createGame({
    seed: 99,
    seats: [
      { name: 'A', isHuman: true },
      { name: 'B', isHuman: true },
    ],
  });
  state.phase = 'attack';
  state.currentPlayerId = 'P1';
  state.reinforcementsRemaining = 0;
  state.players.P1.hand = [];
  state.players.P2.hand = [];
  for (const tid of getPlayerTerritories(state, 'P1')) {
    state.territories[tid].armies = Math.max(state.territories[tid].armies, 3);
  }

  const atk = firstAttack(state, 'P1');
  assert(atk, 'attack pair exists');
  applyAction(state, {
    type: 'ATTACK',
    from: atk.from,
    to: atk.to,
    attackDice: 1,
    nowMs: 1000,
  });

  assert(!state.responseWindow, 'nessuna finestra senza carte giocabili');
  assert(!state.combatContext, 'combattimento risolto subito');
  assert(state.lastBattle && !state.lastBattle.pending, 'battaglia conclusa');
  assert(state.lastBattle.attLoss + state.lastBattle.defLoss === 1, 'una perdita con 1 dado');
  assert(isActionAllowed(state, 'P1', { type: 'END_PHASE' }), 'fine fase subito disponibile');
}

function testRoomStackSync() {
  const roomId = 'stackonl';
  const hostWs = mockWs('host-x');
  const guestWs = mockWs('guest-x');

  createRoom({
    hostClientId: 'host-x',
    hostName: 'Host',
    extraHumans: 1,
    aiCount: 0,
    vanillaMode: false,
    drawEveryTurn: false,
    ws: hostWs,
    id: roomId,
  });
  joinRoom({ roomId, clientId: 'guest-x', name: 'Guest', ws: guestWs });
  startRoom(roomId, 'host-x');

  const room = getRoomForTest(roomId);
  assert(room?.state, 'room started');
  const st = room.state;

  let guard = 0;
  while (st.phase === 'setup' && guard++ < 80) {
    const pid = st.currentPlayerId;
    const seat = room.seats.find((s) => s.id === pid);
    const tid = getPlayerTerritories(st, pid)[0];
    const res = handleAction(roomId, seat.clientId, {
      type: 'PLACE_REINFORCEMENT',
      territoryId: tid,
    });
    assert(res.ok, `setup ok for ${pid}`);
  }
  assert(st.phase !== 'setup', 'setup done');

  while (st.phase === 'reinforce' && guard++ < 200) {
    const pid = st.currentPlayerId;
    const seat = room.seats.find((s) => s.id === pid);
    if (st.reinforcementsRemaining > 0) {
      const tid = getPlayerTerritories(st, pid)[0];
      handleAction(roomId, seat.clientId, { type: 'PLACE_REINFORCEMENT', territoryId: tid });
    } else {
      handleAction(roomId, seat.clientId, { type: 'END_PHASE' });
    }
  }
  assert(st.phase === 'attack', 'attack phase');

  const atk = firstAttack(st, st.currentPlayerId);
  assert(atk, 'attack available');
  const attackerSeat = room.seats.find((s) => s.id === st.currentPlayerId);
  const otherSeat = room.seats.find((s) => s.kind === 'human' && s.id !== st.currentPlayerId);
  assert(attackerSeat && otherSeat, 'both human seats found');

  const denied = handleAction(roomId, otherSeat.clientId, { type: 'END_PHASE' });
  assert(denied.error, 'non-turn player end phase rejected');

  giveCard(st, attackerSeat.id, 'advantage');
  giveCard(st, otherSeat.id, 'advantage');
  applyAction(st, {
    type: 'ATTACK',
    from: atk.from,
    to: atk.to,
    attackDice: 1,
    nowMs: Date.now(),
  });
  assert(st.responseWindow, 'combat window open on server state');
  assert(st.responseWindow.deadlineMs > Date.now() - 1000, 'deadline is absolute server time');

  const deadline = st.responseWindow.deadlineMs;
  tickRoomStack(room, deadline - 1);
  assert(st.responseWindow, 'window still open before deadline');

  tickRoomStack(room, deadline + 1);
  assert(!st.responseWindow, 'server tick closes expired window');
  assert(!st.combatContext, 'combat resolved after window');
  assert(st.lastBattle?.attLoss !== undefined, 'battle resolved with losses');
}

function testServerInjectedNowMs() {
  const state = createGame({ seed: 7, aiCount: 1 });
  state.players.P1.isHuman = true;
  state.phase = 'attack';
  state.currentPlayerId = 'P1';

  const recruitIdx = state.players.P1.hand.findIndex((id) => getCard(id)?.baseId === 'recruit');
  if (recruitIdx < 0) return;

  const t0 = 1_000_000;
  applyAction(state, {
    type: 'PLAY_ACTION_CARD',
    handIndex: recruitIdx,
    territoryId: getPlayerTerritories(state, 'P1')[0],
    riderTerritoryId: getPlayerTerritories(state, 'P1')[0],
    nowMs: t0,
  });

  assert(state.responseWindow, 'action window open');
  assert(
    state.responseWindow.deadlineMs === t0 + STACK_WINDOW_MS,
    'deadline derived from authoritative nowMs',
  );
}

/**
 * Regressione: l'IA attacca, l'umano può rispondere e la finestra resta aperta.
 * Alla scadenza il turno dell'IA deve ripartire e chiudersi, non restare appeso.
 */
function testAiTurnResumesAfterCombatWindow() {
  const state = createGame({
    seed: 21,
    seats: [
      { name: 'Umano', isHuman: true },
      { name: 'IA', isHuman: false },
    ],
  });
  for (const pid of state.playerOrder) state.players[pid].setupRemaining = 0;
  state.phase = 'attack';
  state.currentPlayerId = 'P2';
  state.reinforcementsRemaining = 0;
  state.eventDeck = [];
  state.players.P1.relicId = null;
  state.players.P1.hand = [];
  for (const tid of getPlayerTerritories(state, 'P2')) {
    state.territories[tid].armies = Math.max(state.territories[tid].armies, 4);
  }
  // Con una combat in mano all'umano la finestra si apre davvero e mette in pausa l'IA.
  giveCard(state, 'P1', 'advantage');

  let nowMs = Date.now();
  const tickUntilClosed = () => {
    let guard = 0;
    while ((state.responseWindow || state.combatContext) && guard++ < 60) {
      nowMs += STACK_WINDOW_MS;
      applyAction(state, { type: 'TICK_STACK', nowMs });
      if (state.pendingBastion) applyAction(state, { type: 'RESOLVE_BASTION', use: false });
    }
    assert(guard < 60, 'la finestra si chiude entro il timer');
  };

  runAiTurn(state);
  assert(state.responseWindow?.kind === 'combat', 'finestra combat aperta: IA in attesa');
  tickUntilClosed();
  assert(!state.responseWindow && !state.combatContext, 'tick di scadenza chiude e risolve');

  let guard = 0;
  while (state.currentPlayerId === 'P2' && state.phase !== 'game_over' && guard++ < 60) {
    runAiTurn(state);
    tickUntilClosed();
  }
  assert(guard < 60, 'il turno IA non resta appeso');
  assert(
    state.currentPlayerId === 'P1' || state.phase === 'game_over',
    'la parola torna all\u2019umano',
  );
}

/** Partita pronta alla fase indicata, con P1 e P2 umani. */
function readyGame(phase, seed = 7) {
  const state = createGame({
    seed,
    seats: [
      { name: 'A', isHuman: true },
      { name: 'B', isHuman: true },
    ],
  });
  for (const pid of state.playerOrder) state.players[pid].setupRemaining = 0;
  state.phase = phase;
  state.currentPlayerId = 'P1';
  state.reinforcementsRemaining = 0;
  return state;
}

/**
 * getLegalActions enumera FORTIFY solo fino a 5 armate (la lista serve all'IA).
 * Usarla come whitelist faceva rifiutare online ogni spostamento più grande,
 * mentre il cursore dell'UI ne offre fino ad "armate − 1".
 */
function testFortifyOltreCinque() {
  const state = readyGame('fortify');
  const owned = getPlayerTerritories(state, 'P1');
  let from = null;
  let to = null;
  for (const a of owned) {
    for (const b of owned) {
      if (a !== b && canFortifyBetween(state, a, b)) { from = a; to = b; break; }
    }
    if (from) break;
  }
  assert(from && to, 'coppia di territori collegati');
  state.territories[from].armies = 14;

  const offerti = getLegalActions(state, 'P1')
    .filter((a) => a.type === 'FORTIFY' && a.from === from && a.to === to)
    .map((a) => a.armies);
  assert(offerti.length && Math.max(...offerti) === 5, 'la lista si ferma a 5 (enumerazione)');
  assert(maxFortifyArmies(state, from) === 13, 'il limite vero è armate − 1');

  assert(isActionAllowed(state, 'P1', { type: 'FORTIFY', from, to, armies: 5 }), 'spostamento piccolo ok');
  assert(isActionAllowed(state, 'P1', { type: 'FORTIFY', from, to, armies: 13 }), 'spostamento grande ok');
  assert(!isActionAllowed(state, 'P1', { type: 'FORTIFY', from, to, armies: 14 }), 'oltre il limite rifiutato');
  assert(!isActionAllowed(state, 'P1', { type: 'FORTIFY', from, to, armies: 0 }), 'zero rifiutato');

  applyAction(state, { type: 'FORTIFY', from, to, armies: 8 });
  assert(state.territories[from].armies === 6, 'le 8 armate si spostano');
  assert(
    !isActionAllowed(state, 'P1', { type: 'FORTIFY', from, to, armies: 1 }),
    'niente secondo spostamento senza reliquia extra',
  );

  // Un territorio isolato non può spostare: né offerto né accettato.
  const s2 = readyGame('fortify');
  s2.territories[from].armies = 6;
  s2.isolatedTerritories[from] = { untilPlayerId: 'P2' };
  assert(maxFortifyArmies(s2, from) === 0, 'isolato: limite 0');
  assert(
    !getLegalActions(s2, 'P1').some((a) => a.type === 'FORTIFY' && a.from === from),
    'isolato: nessuno spostamento offerto',
  );
  assert(!isActionAllowed(s2, 'P1', { type: 'FORTIFY', from, to, armies: 1 }), 'isolato: rifiutato');
}

/**
 * Isolamento è un instant: si gioca in risposta a un attacco dichiarato contro
 * di te e bersaglia il territorio attaccante. Prima non era giocabile in nessun
 * momento — castStart rifiuta gli instant fuori finestra, e la finestra combat
 * escludeva gli instant.
 */
function testIsolamentoInRispostaAllAttacco() {
  const state = readyGame('attack');
  state.currentPlayerId = 'P2';
  state.players.P1.hand = [giveCardId('isolation')];
  state.players.P2.hand = [];

  const from = getPlayerTerritories(state, 'P2').find((t) =>
    state.adjacency[t].some((x) => state.territories[x].owner === 'P1'),
  );
  assert(from, 'P2 ha un fronte');
  state.territories[from].armies = 6;
  const to = state.adjacency[from].find((x) => state.territories[x].owner === 'P1');

  applyAction(state, { type: 'ATTACK', from, to, attackDice: 3, nowMs: 1000 });
  assert(state.responseWindow?.kind === 'combat', 'finestra combat aperta per la risposta');

  const cast = getLegalActions(state, 'P1').find((a) => a.type === 'CAST_START');
  assert(cast, 'il difensore può lanciare Isolamento');

  applyAction(state, { ...cast, playerId: 'P1', nowMs: 1000 });
  applyAction(state, { type: 'CAST_CONFIRM', playerId: 'P1', nowMs: 1000 });
  assert(state.isolatedTerritories[from], 'bersaglio implicito: il territorio attaccante');
  assert(!state.pendingCast, 'nessun cast in sospeso');

  let guard = 0;
  let now = 1000;
  while ((state.responseWindow || state.combatContext) && guard++ < 30) {
    now += 20_000;
    applyAction(state, { type: 'TICK_STACK', nowMs: now });
  }
  assert(guard < 30, 'la finestra si chiude (niente pausa infinita dopo il cast)');
  assert(
    !getLegalActions(state, 'P2').some((a) => a.type === 'ATTACK' && a.from === from),
    'il territorio isolato non può più attaccare',
  );

  // Senza combattimento in corso Isolamento non ha bersaglio: non è giocabile.
  const idle = readyGame('attack');
  idle.players.P1.hand = [giveCardId('isolation')];
  assert(
    !getLegalActions(idle, 'P1').some((a) => a.type === 'CAST_START'),
    'Isolamento non giocabile fuori da un combattimento',
  );
}

/** Nella finestra combat aperta lo stack è vuoto: Negare/Sciacallo restano fuori. */
function testCounterFuoriDallaFinestraCombat() {
  const state = readyGame('attack');
  state.currentPlayerId = 'P2';
  state.players.P1.hand = [giveCardId('negate'), giveCardId('jackal')];
  state.players.P2.hand = [];
  const from = getPlayerTerritories(state, 'P2').find((t) =>
    state.adjacency[t].some((x) => state.territories[x].owner === 'P1'),
  );
  state.territories[from].armies = 6;
  const to = state.adjacency[from].find((x) => state.territories[x].owner === 'P1');
  applyAction(state, { type: 'ATTACK', from, to, attackDice: 3, nowMs: 1000 });
  assert(
    !getLegalActions(state, 'P1').some((a) => a.type === 'CAST_START'),
    'nessun counter nella finestra combat aperta',
  );
}

function giveCardId(baseId) {
  const id = Object.keys(CARDS).find((cid) => CARDS[cid].baseId === baseId);
  if (!id) throw new Error(`no card with baseId ${baseId}`);
  return id;
}

function run() {
  testFortifyOltreCinque();
  testIsolamentoInRispostaAllAttacco();
  testCounterFuoriDallaFinestraCombat();
  testIsActionAllowed();
  testNoWindowWithoutPlayableCards();
  testAiTurnResumesAfterCombatWindow();
  testServerInjectedNowMs();
  testRoomStackSync();
  console.log('STACK ONLINE OK');
}

run();
