/**
 * Headless smoke test: both sides driven by AI until victory or turn cap.
 * Run: node --experimental-vm-modules smoke-test.js
 * From src/js: node smoke-test.js
 */
import {
  createGame, getPlayerTerritories, serializeState, hydrateState, viewForPlayer,
  applyAction, getLegalActions,
} from './engine/game.js';
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

  const mixed = createGame({
    seed: 5,
    seats: [
      { name: 'Anna', isHuman: true },
      { name: 'IA Rossa', isHuman: false },
      { name: 'Bruno', isHuman: true },
    ],
  });
  assert(mixed.playerCount === 3, 'seats length');
  assert(mixed.players.P1.name === 'Anna' && mixed.players.P1.isHuman, 'host human');
  assert(!mixed.players.P2.isHuman, 'middle AI');
  assert(mixed.players.P3.name === 'Bruno' && mixed.players.P3.isHuman, 'friend human');
  const view = viewForPlayer(mixed, 'P1');
  assert(view.players.P1.missionId === mixed.players.P1.missionId, 'own mission visible');
  assert(view.players.P3.missionId == null, 'other mission hidden');
  assert(view.rngState === undefined, 'no rng in view');
  const hydrated = hydrateState(serializeState(mixed));
  assert(typeof hydrated.rng.int === 'function', 'hydrate rng');
  assert(hydrated.players.P3.name === 'Bruno', 'hydrate names');

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

  // Classico: nessuno stack. Gli attacchi si risolvono nello stesso tick, senza
  // finestra di risposta (che in Classico nessuno chiuderebbe mai).
  const sv = createGame({ seed: 5, aiCount: 1, vanillaMode: true });
  for (const pid of sv.playerOrder) sv.players[pid].isHuman = false;
  let gv = 0;
  while (sv.phase === 'setup' && gv++ < 200) runAiTurn(sv, { maxSteps: 5 });
  assert(sv.phase !== 'setup', 'classico: setup finito');
  for (let i = 0; i < 30 && sv.phase !== 'game_over'; i++) runAiTurn(sv, { maxSteps: 300 });
  assert(!sv.responseWindow, 'classico: nessuna finestra stack');
  assert(!sv.combatContext, 'classico: nessun combattimento appeso');
  assert(sv.stack.length === 0, 'classico: stack sempre vuoto');
  const vanillaBattles = sv.log.filter((e) => /Battaglia|Conquista/.test(e.message)).length;
  assert(vanillaBattles > 0, 'classico: le battaglie si risolvono davvero');
  console.log(`Classico: battaglie risolte=${vanillaBattles}, round=${sv.round}, phase=${sv.phase}`);

  // Caos («se puoi attaccare, devi attaccare») deve restare coerente con ciò che
  // il motore accetta: END_PHASE offerto solo quando verrebbe davvero accettato,
  // e mai un turno che non si può chiudere.
  const chaosSetup = (isolateAll) => {
    const c = createGame({ seed: 4, aiCount: 1 });
    for (const pid of c.playerOrder) c.players[pid].setupRemaining = 0;
    c.phase = 'attack';
    c.currentPlayerId = 'P1';
    c.reinforcementsRemaining = 0;
    c.activeEventIds = ['chaos'];
    c.mustAttackSatisfied = false;
    for (const from of getPlayerTerritories(c, 'P1')) {
      if (c.territories[from].armies < 2) c.territories[from].armies = 3;
      const border = c.adjacency[from].some((to) => c.territories[to].owner !== 'P1');
      if (isolateAll && border) c.isolatedTerritories[from] = { untilPlayerId: 'P2' };
    }
    return c;
  };

  // (a) attacco possibile: END_PHASE non è legale e il motore lo rifiuta
  const chaosOpen = chaosSetup(false);
  const openLegal = getLegalActions(chaosOpen, 'P1');
  assert(openLegal.some((a) => a.type === 'ATTACK'), 'caos: attacchi disponibili');
  assert(!openLegal.some((a) => a.type === 'END_PHASE'), 'caos: END_PHASE non offerto se puoi attaccare');
  applyAction(chaosOpen, { type: 'END_PHASE' });
  assert(chaosOpen.phase === 'attack', 'caos: END_PHASE rifiutato se puoi attaccare');

  // (b) nessun attacco possibile (tutti i confini isolati): niente soft-lock
  const chaosLocked = chaosSetup(true);
  const lockedLegal = getLegalActions(chaosLocked, 'P1');
  assert(!lockedLegal.some((a) => a.type === 'ATTACK'), 'caos+isolamento: nessun attacco legale');
  assert(lockedLegal.some((a) => a.type === 'END_PHASE'), 'caos+isolamento: END_PHASE offerto');
  applyAction(chaosLocked, { type: 'END_PHASE' });
  assert(chaosLocked.phase === 'fortify', 'caos+isolamento: la fase si chiude, niente soft-lock');
  console.log('Caos: coerenza END_PHASE/attacco verificata (con e senza isolamento)');

  console.log('SMOKE OK');
}

smoke();
