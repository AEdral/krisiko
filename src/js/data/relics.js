/** Passive relics — one assigned at setup. */

export const RELICS = {
  lucky_die: {
    id: 'lucky_die',
    name: 'Dado Fortunato',
    description: 'Nei tuoi attacchi, il dado più basso riceve +1 (max 6).',
    effect: { type: 'attack_low_die_bonus', value: 1 },
  },
  iron_shield: {
    id: 'iron_shield',
    name: 'Scudo di Ferro',
    description: 'In difesa, il tuo dado più alto riceve +1 (max 6).',
    effect: { type: 'defend_high_die_bonus', value: 1 },
  },
  war_chest: {
    id: 'war_chest',
    name: 'Cassa di Guerra',
    description: '+1 rinforzo all’inizio di ogni tuo turno.',
    effect: { type: 'extra_reinforcement', value: 1 },
  },
  first_strike: {
    id: 'first_strike',
    name: 'Primo Colpo',
    description: 'Nel primo attacco del turno, attacchi con +1 dado virtuale (max 3 dadi fisici, +1 al confronto).',
    effect: { type: 'first_attack_bonus_die', value: 1 },
  },
  border_patrol: {
    id: 'border_patrol',
    name: 'Pattuglia di Confine',
    description: 'Dopo lo spostamento, puoi spostare 1 armata extra tra due territori adiacenti tuoi.',
    effect: { type: 'extra_fortify_move', value: 1 },
  },
  scavenger: {
    id: 'scavenger',
    name: 'Raccoglitore',
    description: 'Quando conquisti un territorio, guadagni +1 armata sul territorio conquistato.',
    effect: { type: 'conquer_bonus_army', value: 1 },
  },
  storm_caller: {
    id: 'storm_caller',
    name: 'Invocatore di Tempeste',
    description: 'Gli eventi globali negativi non ti colpiscono (solo effetti con tag “harm”).',
    effect: { type: 'immune_harm_events', value: 1 },
  },
  quartermaster: {
    id: 'quartermaster',
    name: 'Quartiermastro',
    description: 'Mano massima carte +1 (6 invece di 5).',
    effect: { type: 'hand_size_bonus', value: 1 },
  },
};

export const RELIC_IDS = Object.keys(RELICS);
