/** Global round events — revealed from end of round 2. */

export const EVENTS = {
  storm: {
    id: 'storm',
    name: 'Tempesta',
    description: 'Tutti gli attacchi: -1 al dado più alto (min 1).',
    tag: 'harm',
    effect: { type: 'attack_high_die_penalty', value: 1 },
  },
  harvest: {
    id: 'harvest',
    name: 'Raccolto',
    description: 'Tutti i giocatori: +1 rinforzo all’inizio turno.',
    tag: 'buff',
    effect: { type: 'extra_reinforcement', value: 1 },
  },
  chaos: {
    id: 'chaos',
    name: 'Caos',
    description: 'Se puoi attaccare, devi dichiarare almeno un attacco nel turno (l’IA e l’UI lo segnalano).',
    tag: 'harm',
    effect: { type: 'must_attack_once' },
  },
  fog: {
    id: 'fog',
    name: 'Nebbia di Guerra',
    description: 'Attacchi e difese con al massimo 2 dadi attacco / 1 difesa.',
    tag: 'harm',
    effect: { type: 'dice_cap', attack: 2, defend: 1 },
  },
  boom: {
    id: 'boom',
    name: 'Boom Demografico',
    description: 'Rinforzi da territori: floor(territori/2) invece di /3 (min 3 resta).',
    tag: 'buff',
    effect: { type: 'reinforce_divisor', value: 2 },
  },
  plague: {
    id: 'plague',
    name: 'Peste',
    description: 'All’inizio del turno, perdi 1 armata su un territorio casuale con >1 armata (se esiste).',
    tag: 'harm',
    effect: { type: 'start_turn_lose_army' },
  },
  supply_lines: {
    id: 'supply_lines',
    name: 'Linee di Rifornimento',
    description: 'Lo spostamento può attraversare una catena di tuoi territori (fortify illimitato in distanza).',
    tag: 'buff',
    effect: { type: 'fortify_chain' },
  },
};

export const EVENT_IDS = Object.keys(EVENTS);

export function createEventDeck(rng) {
  const deck = [...EVENT_IDS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
