/** Mixed deck: combat (during battle) and action (out of battle). */

export const CARDS = {
  sharpen: {
    id: 'sharpen',
    name: 'Affilatura',
    type: 'combat',
    description: '+1 al tuo dado d’attacco più alto (max 6).',
    effect: { type: 'att_high_die_bonus', value: 1 },
  },
  reroll_attack: {
    id: 'reroll_attack',
    name: 'Rilancio',
    type: 'combat',
    description: 'Rilancia il tuo dado d’attacco più basso.',
    effect: { type: 'att_reroll_low' },
  },
  sabotage: {
    id: 'sabotage',
    name: 'Sabotaggio',
    type: 'combat',
    description: '-1 al dado di difesa più alto del nemico (min 1).',
    effect: { type: 'def_high_die_penalty', value: 1 },
  },
  fortify_die: {
    id: 'fortify_die',
    name: 'Muro Improviso',
    type: 'combat',
    description: '+1 al tuo dado di difesa più alto (max 6). Usabile solo se stai difendendo.',
    effect: { type: 'def_high_die_bonus', value: 1 },
  },
  recruit: {
    id: 'recruit',
    name: 'Reclutamento',
    type: 'action',
    description: '+2 armate su un tuo territorio.',
    effect: { type: 'add_armies', value: 2 },
    phases: ['reinforce', 'attack', 'fortify'],
  },
  forced_march: {
    id: 'forced_march',
    name: 'Marcia Forzata',
    type: 'action',
    description: 'Sposta fino a 3 armate tra due tuoi territori adiacenti (non conta come spostamento di fase).',
    effect: { type: 'free_move', value: 3 },
    phases: ['reinforce', 'attack', 'fortify'],
  },
  scout: {
    id: 'scout',
    name: 'Esploratore',
    type: 'action',
    description: 'Scarta questa carta e pesca 2 carte (rispettando il limite mano).',
    effect: { type: 'draw', value: 2 },
    phases: ['reinforce', 'attack', 'fortify'],
  },
  raid: {
    id: 'raid',
    name: 'Incursione',
    type: 'action',
    description: 'Rimuovi 1 armata da un territorio nemico adiacente a uno tuo (non può scendere sotto 1).',
    effect: { type: 'damage_adjacent_enemy', value: 1 },
    phases: ['reinforce', 'attack'],
  },
};

export const CARD_IDS = Object.keys(CARDS);

/** Build a shuffled multi-copy deck for the match. */
export function createCardDeck(rng) {
  const copies = {
    sharpen: 4,
    reroll_attack: 3,
    sabotage: 3,
    fortify_die: 3,
    recruit: 4,
    forced_march: 3,
    scout: 2,
    raid: 3,
  };
  const deck = [];
  for (const [id, n] of Object.entries(copies)) {
    for (let i = 0; i < n; i++) deck.push(id);
  }
  return shuffle(deck, rng);
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
