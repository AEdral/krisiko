/**
 * Online stack sync — headless tests.
 * Run from src/js: node stack-online-test.js
 */
import { createGame, applyAction, isActionAllowed, getCard } from './engine/game.js';
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

  const p2Hand = state.players.P2.hand;
  const negIdx = p2Hand.findIndex((id) => getCard(id)?.effect?.type === 'negate');
  if (negIdx >= 0) {
    assert(
      isActionAllowed(state, 'P2', { type: 'CAST_START', handIndex: negIdx }),
      'guest can start instant cast',
    );
  }

  assert(isActionAllowed(state, 'P1', { type: 'END_PHASE' }) === false, 'end blocked during window');
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

function run() {
  testIsActionAllowed();
  testServerInjectedNowMs();
  testRoomStackSync();
  console.log('STACK ONLINE OK');
}

run();
