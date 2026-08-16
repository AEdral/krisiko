import { CONTINENTS } from './map.js';

/** Secret objectives (Italian Risiko–style). */

function countOwned(state, pid) {
  return Object.values(state.territories).filter((t) => t.owner === pid).length;
}

function ownsContinents(state, pid, ids) {
  return ids.every((cid) =>
    CONTINENTS[cid].territories.every((tid) => state.territories[tid].owner === pid)
  );
}

export const MISSIONS = {
  conquer_sa_af: {
    id: 'conquer_sa_af',
    name: 'Sud America + Africa',
    description: 'Conquista interamente Sud America e Africa.',
    check: (state, pid) => ownsContinents(state, pid, ['sa', 'af']),
  },
  conquer_na_oc: {
    id: 'conquer_na_oc',
    name: 'Nord America + Oceania',
    description: 'Conquista interamente Nord America e Oceania.',
    check: (state, pid) => ownsContinents(state, pid, ['na', 'oc']),
  },
  conquer_eu_sa: {
    id: 'conquer_eu_sa',
    name: 'Europa + Sud America',
    description: 'Conquista interamente Europa e Sud America.',
    check: (state, pid) => ownsContinents(state, pid, ['eu', 'sa']),
  },
  conquer_eu_oc: {
    id: 'conquer_eu_oc',
    name: 'Europa + Oceania',
    description: 'Conquista interamente Europa e Oceania.',
    check: (state, pid) => ownsContinents(state, pid, ['eu', 'oc']),
  },
  conquer_as_af: {
    id: 'conquer_as_af',
    name: 'Asia + Africa',
    description: 'Conquista interamente Asia e Africa.',
    check: (state, pid) => ownsContinents(state, pid, ['as', 'af']),
  },
  conquer_24: {
    id: 'conquer_24',
    name: '24 territori',
    description: 'Controlla almeno 24 territori.',
    check: (state, pid) => countOwned(state, pid) >= 24,
  },
  conquer_18_double: {
    id: 'conquer_18_double',
    name: '18 territori (×2)',
    description: 'Controlla 18 territori con almeno 2 armate ciascuno.',
    check: (state, pid) =>
      Object.values(state.territories).filter((t) => t.owner === pid && t.armies >= 2).length >= 18,
  },
  eliminate_enemy: {
    id: 'eliminate_enemy',
    name: 'Eliminazione',
    description: 'Elimina il giocatore indicato (conquista tutti i suoi territori).',
    check: (state, pid) => {
      const target = state.players[pid]?.missionTargetId;
      if (!target || target === pid) return false;
      return countOwned(state, target) === 0 && countOwned(state, pid) > 0;
    },
  },
};

export const MISSION_IDS = Object.keys(MISSIONS);

export function checkMission(state, playerId) {
  const missionId = state.players[playerId]?.missionId;
  if (!missionId) return false;
  const mission = MISSIONS[missionId];
  return mission ? mission.check(state, playerId) : false;
}
