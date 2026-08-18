/** Passive relics — one assigned at random at setup (Krisiko mode). */

export const RELICS = {
  war_chest: {
    id: 'war_chest',
    name: 'Cassa di Guerra',
    description: '+1 rinforzo all’inizio di ogni tuo turno.',
    effect: { type: 'extra_reinforcement', value: 1 },
  },
  continental_identity: {
    id: 'continental_identity',
    name: 'Identità Continentale',
    description:
      'Per ogni continente che controlli, il suo bonus rinforzi vale +50% arrotondato per difetto (+2→+3, +5→+7, +7→+10).',
    effect: { type: 'continent_bonus_multiplier', value: 1.5 },
  },
  mobility_net: {
    id: 'mobility_net',
    name: 'Rete di mobilità',
    description:
      'Dopo lo spostamento di fase, puoi fare fino a 2 spostamenti extra da 1 armata tra territori tuoi adiacenti.',
    effect: { type: 'extra_fortify_moves', value: 2 },
  },
  aggressor: {
    id: 'aggressor',
    name: 'Aggressore',
    description:
      'Quando conquisti un territorio in combattimento, +1 armata su quel territorio. Max 3 volte per turno.',
    effect: { type: 'conquer_bonus_army', value: 1, maxPerTurn: 3 },
  },
  conquest_thirst: {
    id: 'conquest_thirst',
    name: 'Sete di conquista',
    description:
      'Se conquisti almeno 2 territori in combattimento nello stesso turno, a fine fase Attacco pesca 1 carta aggiuntiva.',
    effect: { type: 'conquest_draw_bonus', minConquers: 2 },
  },
  guerrilla: {
    id: 'guerrilla',
    name: 'Guerriglia',
    description:
      'Attaccando da un territorio con esattamente 2 armate: +1 al tuo dado d’attacco più alto in quel lancio (max 6).',
    effect: { type: 'guerrilla_attack', value: 1 },
  },
  bastion: {
    id: 'bastion',
    name: 'Bastione',
    description:
      'Una volta per giro: quando un avversario ti attacca nel suo turno, puoi applicare +1 al tuo dado di difesa più alto in quel lancio (max 6).',
    effect: { type: 'bastion_defense', value: 1 },
  },
  redoubt: {
    id: 'redoubt',
    name: 'Ridotta',
    description:
      'La prima volta per turno che resisti a un attacco (territorio non conquistato): +1 armata su quel territorio.',
    effect: { type: 'redoubt_defense', value: 1 },
  },
  dominion: {
    id: 'dominion',
    name: 'Dominio',
    description: 'Se il rider scatta, +3 armate invece di +2.',
    effect: { type: 'dominion_rider', bonus: 3, base: 2 },
  },
  quartermaster: {
    id: 'quartermaster',
    name: 'Quartiermastro',
    description: 'Mano massima carte +2 (7 invece di 5).',
    effect: { type: 'hand_size_bonus', value: 2 },
  },
  seer: {
    id: 'seer',
    name: 'Veggente',
    description:
      'Ogni volta che peschi una carta, guardi la cima del mazzo e puoi metterla in fondo al mazzo prima di pescare.',
    effect: { type: 'draw_scry', value: 1 },
  },
  recycling: {
    id: 'recycling',
    name: 'Riciclaggio',
    description: 'All’inizio del tuo turno, puoi scartare 1 carta per pescarne 1.',
    effect: { type: 'start_turn_recycle', value: 1 },
  },
  alert: {
    id: 'alert',
    name: 'Allerta',
    description: 'Negare e Sciacallo avversari non hanno effetto sulle tue carte.',
    effect: { type: 'immune_negate_swoop', value: 1 },
  },
};

export const RELIC_IDS = Object.keys(RELICS);
