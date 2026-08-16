/**
 * Headless smoke test: both sides driven by AI until victory or turn cap.
 * Run: node --experimental-vm-modules smoke-test.js
 * From src/js: node smoke-test.js
 */
import { createGame, getPlayerTerritories } from './engine/game.js';
import { runAiTurn } from './ai/ai.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function smoke() {
  const state = createGame({ seed: 42 });
  state.players.P1.isHuman = false;
  state.players.P2.isHuman = false;

  assert(Object.keys(state.territories).length === 42, '42 territories');
  assert(getPlayerTerritories(state, 'P1').length === 21, 'P1 starts with 21');
  assert(getPlayerTerritories(state, 'P2').length === 21, 'P2 starts with 21');
  assert(state.phase === 'setup', 'starts in setup');
  assert(state.players.P1.setupRemaining === 19, '19 to place');
  assert(state.players.P1.missionId, 'P1 has mission');
  assert(state.players.P2.missionId, 'P2 has mission');
  assert(state.players.P1.missionId !== state.players.P2.missionId, 'different missions');

  // Finish setup via AI
  let guard = 0;
  while (state.phase === 'setup' && guard++ < 50) {
    runAiTurn(state, { maxSteps: 5 });
  }
  assert(state.phase !== 'setup', 'setup finished');
  assert(state.phase === 'reinforce', 'game starts reinforce');
  assert(state.reinforcementsRemaining >= 3, 'has reinforcements');

  let safety = 0;
  const maxTurns = 400;
  let sawEvent = false;
  let sawConquer = false;

  while (state.phase !== 'game_over' && safety < maxTurns) {
    safety += 1;
    const beforeLog = state.log.length;
    runAiTurn(state, { maxSteps: 300 });
    if (state.activeEventId) sawEvent = true;
    if (state.log.slice(beforeLog).some((e) => e.type === 'conquer' || /Conquista/.test(e.message))) {
      sawConquer = true;
    }
  }

  console.log(`Turns processed: ${safety}, round=${state.round}, event=${state.activeEventId}`);
  console.log(`Winner: ${state.winnerId}, phase=${state.phase}`);
  console.log(`P1 territories: ${getPlayerTerritories(state, 'P1').length}`);
  console.log(`P2 territories: ${getPlayerTerritories(state, 'P2').length}`);
  console.log(`Saw conquer: ${sawConquer}, saw event: ${sawEvent}`);

  assert(state.round >= 2 || state.phase === 'game_over', 'advanced past early game or finished');
  if (state.round >= 3) {
    assert(state.activeEventId || sawEvent, 'event after round 2');
  }
  if (state.phase === 'game_over') {
    assert(state.winnerId, 'has winner');
  }

  const s4 = createGame({ seed: 7, playerCount: 4 });
  assert(Object.keys(s4.players).length === 4, '4 players');
  const c4 = ['P1', 'P2', 'P3', 'P4'].map((id) => getPlayerTerritories(s4, id).length);
  assert(c4.reduce((a, b) => a + b, 0) === 42, '4p territories sum 42');
  assert(c4.every((n) => n === 10 || n === 11), '4p split 10/11');
  assert(s4.players.P1.setupRemaining === 30 - c4[0], '4p starting armies');
  assert(s4.playerOrder.length === 4, 'playerOrder');

  const s6 = createGame({ seed: 3, aiCount: 5 });
  assert(Object.keys(s6.players).length === 6, '6 players via aiCount');
  const c6 = s6.playerOrder.map((id) => getPlayerTerritories(s6, id).length);
  assert(c6.every((n) => n === 7), '6p even 7 territories');
  assert(s6.players.P1.setupRemaining === 20 - 7, '6p 20 armies');

  const s3 = createGame({ seed: 11, playerCount: 3 });
  for (const id of s3.playerOrder) s3.players[id].isHuman = false;
  let g3 = 0;
  while (s3.phase === 'setup' && g3++ < 200) runAiTurn(s3, { maxSteps: 5 });
  assert(s3.phase !== 'setup', '3p setup finishes');
  assert(s3.playerOrder.every((id) => s3.players[id].setupRemaining === 0), '3p all placed');

  const s2 = createGame({ seed: 99 });
  s2.players.P1.isHuman = false;
  s2.players.P2.isHuman = false;
  guard = 0;
  while (s2.phase === 'setup' && guard++ < 50) runAiTurn(s2, { maxSteps: 5 });
  for (let i = 0; i < 80 && s2.phase !== 'game_over'; i++) {
    runAiTurn(s2, { maxSteps: 300 });
  }
  const hands = s2.players.P1.hand.length + s2.players.P2.hand.length;
  console.log(`After ~80 turns, combined hand size=${hands}, discard=${s2.cardDiscard.length}`);
  console.log('SMOKE OK');
}

smoke();
