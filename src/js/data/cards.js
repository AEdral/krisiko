/**
 * Krisiko card deck — 44 cards (see docs/new-cards.md).
 * Each non-jolly copy has a unique territory for the rider.
 */

import { TERRITORY_IDS, TERRITORIES } from './map.js';

/** @typedef {'action'|'combat'|'instant'} CardTiming */
/** @typedef {'common'|'rare'|'epic'|'jolly'} CardRarity */

const CARD_BLUEPRINTS = [
  {
    base: 'advantage',
    name: 'Vantaggio',
    timing: 'combat',
    rarity: 'common',
    copies: 4,
    description: '+1 a un tuo dado di questo lancio (max 6).',
    effect: { type: 'die_bonus', value: 1, combatPhase: 'pre_compare' },
  },
  {
    base: 'reroll',
    name: 'Rilancio',
    timing: 'combat',
    rarity: 'common',
    copies: 4,
    description: 'Rilancia il tuo dado più basso.',
    effect: { type: 'reroll_low', combatPhase: 'post_compare' },
  },
  {
    base: 'recruit',
    name: 'Reclutamento',
    timing: 'action',
    rarity: 'common',
    copies: 4,
    description: '+2 armate su un tuo territorio.',
    effect: { type: 'add_armies', value: 2 },
  },
  {
    base: 'march',
    name: 'Marcia',
    timing: 'action',
    rarity: 'common',
    copies: 2,
    description: 'Sposta fino a 3 armate tra due tuoi territori adiacenti. Non consuma lo spostamento di fase.',
    effect: { type: 'free_move', value: 3, adjacent: true },
  },
  {
    base: 'sabotage',
    name: 'Sabotaggio',
    timing: 'action',
    rarity: 'common',
    copies: 2,
    description: 'L’avversario scarta 1 carta a caso. Se la mano è vuota, l’effetto è nullo.',
    effect: { type: 'sabotage_discard' },
  },
  {
    base: 'scout',
    name: 'Esploratore',
    timing: 'action',
    rarity: 'common',
    copies: 2,
    description: 'Scarta questa carta, pesca 2 (limite mano). Rider prima della pesca.',
    effect: { type: 'draw', value: 2 },
  },
  {
    base: 'ponder',
    name: 'Ponderare',
    timing: 'action',
    rarity: 'common',
    copies: 2,
    description: 'Guarda le prime 3 carte del mazzo. Aggiungine 1 alla mano; le altre in fondo.',
    effect: { type: 'surveil', look: 3, take: 1 },
  },
  {
    base: 'negate',
    name: 'Negare',
    timing: 'instant',
    rarity: 'common',
    copies: 4,
    description: 'In risposta a una comune o rara avversaria: annulla quella carta.',
    effect: { type: 'negate' },
  },
  {
    base: 'teleport',
    name: 'Teletrasporto',
    timing: 'action',
    rarity: 'rare',
    copies: 2,
    description: 'Sposta armate tra due tuoi territori, anche non adiacenti (min 1 sulla partenza).',
    effect: { type: 'teleport_move' },
  },
  {
    base: 'isolation',
    name: 'Isolamento',
    timing: 'instant',
    rarity: 'rare',
    copies: 2,
    description: 'Un territorio non può attaccare né spostare fino al tuo prossimo turno.',
    effect: { type: 'isolation' },
  },
  {
    base: 'theft',
    name: 'Furto',
    timing: 'action',
    rarity: 'rare',
    copies: 2,
    description: 'Guarda la mano avversaria e prendi 1 carta.',
    effect: { type: 'steal_card' },
  },
  {
    base: 'supplies',
    name: 'Approvvigionamenti',
    timing: 'action',
    rarity: 'rare',
    copies: 2,
    description: '+4 armate sui tuoi territori (anche tutte sullo stesso).',
    effect: { type: 'add_armies', value: 4, split: true },
  },
  {
    base: 'jackal',
    name: 'Sciacallo',
    timing: 'instant',
    rarity: 'rare',
    copies: 2,
    description: 'In risposta a una comune: risolve, poi la prendi in mano.',
    effect: { type: 'jackal' },
  },
  {
    base: 'foresight',
    name: 'Preveggenza',
    timing: 'action',
    rarity: 'rare',
    copies: 2,
    description: 'Guarda le prime 4 carte del mazzo. Aggiungine 2 alla mano; le altre in fondo.',
    effect: { type: 'surveil', look: 4, take: 2 },
  },
  {
    base: 'resurrection',
    name: 'Riesumazione',
    timing: 'instant',
    rarity: 'epic',
    copies: 1,
    description: 'Ogni giocatore recluta armate pari a quelle perse in questo turno.',
    effect: { type: 'resurrection' },
  },
  {
    base: 'chaos',
    name: 'Chaos',
    timing: 'action',
    rarity: 'epic',
    copies: 1,
    description: 'Scarta tutti gli eventi attivi e ne rivela 3 nuovi (max 3 attivi).',
    effect: { type: 'chaos_events', count: 3 },
  },
  {
    base: 'arcana',
    name: 'Arcana',
    timing: 'action',
    rarity: 'epic',
    copies: 1,
    description: 'Ogni giocatore sceglie una reliquia tra quelle pescate.',
    effect: { type: 'arcana' },
  },
  {
    base: 'plague',
    name: 'Pestilenza',
    timing: 'action',
    rarity: 'epic',
    copies: 1,
    description: 'Su ogni territorio, −⅓ armate arrotondato per difetto (1–2 restano).',
    effect: { type: 'plague' },
  },
  {
    base: 'omniscience',
    name: 'Onniscienza',
    timing: 'action',
    rarity: 'epic',
    copies: 1,
    description: 'Guarda le mani altrui e fai scartare 1 carta a ciascuno.',
    effect: { type: 'omniscience' },
  },
  {
    base: 'betrayal',
    name: 'Tradimento',
    timing: 'action',
    rarity: 'epic',
    copies: 1,
    description: 'Conquista un territorio nemico con esattamente 1 armata.',
    effect: { type: 'betrayal' },
  },
  {
    base: 'turncoat',
    name: 'Voltagabbana',
    timing: 'action',
    rarity: 'jolly',
    copies: 1,
    description: 'Puoi scambiare il tuo obiettivo con quello di un avversario. Poi +1 evento (Disordine).',
    effect: { type: 'turncoat' },
  },
  {
    base: 'double_mandate',
    name: 'Doppio mandato',
    timing: 'action',
    rarity: 'jolly',
    copies: 1,
    description: 'Puoi sostituire il tuo obiettivo con uno dal mazzo missioni. Poi +1 evento.',
    effect: { type: 'double_mandate' },
  },
];

function buildCardCatalog() {
  /** @type {Record<string, object>} */
  const cards = {};
  const deckIds = [];
  const territories = [...TERRITORY_IDS].sort();
  let tIdx = 0;

  for (const bp of CARD_BLUEPRINTS) {
    for (let i = 0; i < bp.copies; i++) {
      const territoryId = bp.rarity === 'jolly' ? null : territories[tIdx++];
      const id = territoryId ? `${bp.base}_${territoryId}` : bp.base;
      cards[id] = {
        id,
        baseId: bp.base,
        name: bp.name,
        timing: bp.timing,
        rarity: bp.rarity,
        territoryId,
        territoryName: territoryId ? TERRITORIES[territoryId].name : null,
        description: bp.description,
        effect: { ...bp.effect },
      };
      deckIds.push(id);
    }
  }

  return { cards, deckIds };
}

const built = buildCardCatalog();
export const CARDS = built.cards;
export const CARD_IDS = Object.keys(CARDS);
export const STANDARD_DECK_IDS = built.deckIds;

/** @param {string} cardId */
export function getCard(cardId) {
  return CARDS[cardId] ?? null;
}

/** Playable on your turn in reinforce / attack / fortify (stack v1: instant also here). */
export function isHandPlayable(card, phase) {
  if (!card) return false;
  if (card.timing === 'action' || card.timing === 'instant') {
    return phase === 'reinforce' || phase === 'attack' || phase === 'fortify';
  }
  return false;
}

export function isCombatCard(card) {
  return card?.timing === 'combat';
}

/** Combat cards where the player must pick which die to affect. */
export function combatCardNeedsDiePick(card) {
  const t = card?.effect?.type;
  return t === 'die_bonus' || t === 'reroll_low' || t === 'att_reroll_low';
}

export function riderBonus(relicEffect) {
  if (relicEffect?.type === 'dominion_rider') return relicEffect.bonus ?? 3;
  return 2;
}

/** Build a shuffled 44-card deck for the match. */
export function createCardDeck(rng) {
  const deck = [...STANDARD_DECK_IDS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** One representative card id per unique effect (for sandbox kit). */
export function getSandboxKitIds() {
  const seen = new Set();
  const ids = [];
  for (const id of STANDARD_DECK_IDS) {
    const card = CARDS[id];
    if (!card || seen.has(card.baseId)) continue;
    seen.add(card.baseId);
    ids.push(id);
  }
  return ids;
}
