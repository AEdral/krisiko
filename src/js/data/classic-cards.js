import { TERRITORIES, TERRITORY_IDS } from './map.js';

/** Traditional Risk territory cards: infantry, cavalry, cannon. */
export const CLASSIC_SYMBOLS = {
  infantry: { id: 'infantry', name: 'Fante', emoji: '🪖' },
  cavalry: { id: 'cavalry', name: 'Cavallo', emoji: '🐎' },
  cannon: { id: 'cannon', name: 'Cannone', emoji: '💣' },
};

/** Fixed symbol per territory (Italian classic Risk deck). */
export const TERRITORY_CLASSIC_SYMBOL = {
  alaska: 'cavalry',
  northwest_territory: 'infantry',
  greenland: 'infantry',
  alberta: 'cannon',
  ontario: 'cavalry',
  quebec: 'cannon',
  eastern_us: 'cavalry',
  western_us: 'infantry',
  central_america: 'cannon',

  venezuela: 'infantry',
  peru: 'cannon',
  brazil: 'cavalry',
  argentina: 'infantry',

  iceland: 'cannon',
  great_britain: 'cavalry',
  scandinavia: 'infantry',
  western_europe: 'cannon',
  northern_europe: 'cavalry',
  southern_europe: 'infantry',
  ukraine: 'cannon',

  north_africa: 'cavalry',
  egypt: 'infantry',
  east_africa: 'cannon',
  congo: 'cavalry',
  south_africa: 'infantry',
  madagascar: 'cannon',

  ural: 'cavalry',
  siberia: 'infantry',
  yakutsk: 'cannon',
  kamchatka: 'cavalry',
  irkutsk: 'infantry',
  afghanistan: 'infantry',
  middle_east: 'cannon',
  india: 'cavalry',
  siam: 'infantry',
  china: 'cannon',
  mongolia: 'cavalry',
  japan: 'infantry',

  indonesia: 'cannon',
  new_guinea: 'cavalry',
  western_australia: 'infantry',
  eastern_australia: 'cannon',
};

export const CLASSIC_HAND_LIMIT = 5;

const TRADE_TABLE = [4, 6, 8, 10, 12, 15];

export function classicTradeValue(tradeCount) {
  return TRADE_TABLE[Math.min(Math.max(0, tradeCount), TRADE_TABLE.length - 1)];
}

export function getClassicCard(territoryId) {
  const symId = TERRITORY_CLASSIC_SYMBOL[territoryId];
  const symbol = CLASSIC_SYMBOLS[symId];
  const territory = TERRITORIES[territoryId];
  if (!symbol || !territory) return null;
  return {
    id: territoryId,
    type: 'classic',
    name: territory.name,
    symbol: symId,
    symbolName: symbol.name,
    emoji: symbol.emoji,
    description: `${symbol.emoji} ${symbol.name} · ${territory.name}`,
  };
}

export function isClassicCardId(cardId) {
  return !!TERRITORY_CLASSIC_SYMBOL[cardId];
}

export function createClassicDeck(rng) {
  return rng.shuffle([...TERRITORY_IDS]);
}

export function isValidClassicSet(hand, indices) {
  if (!Array.isArray(indices) || indices.length !== 3) return false;
  const sorted = [...indices].sort((a, b) => a - b);
  if (sorted[0] === sorted[1] || sorted[1] === sorted[2]) return false;
  if (sorted.some((i) => i < 0 || i >= hand.length)) return false;
  const symbols = sorted.map((i) => TERRITORY_CLASSIC_SYMBOL[hand[i]]);
  if (symbols.some((s) => !s)) return false;
  const unique = new Set(symbols);
  return unique.size === 1 || unique.size === 3;
}

/** First valid triple of hand indices (for AI). */
export function findClassicTradeSet(hand) {
  for (let a = 0; a < hand.length - 2; a++) {
    for (let b = a + 1; b < hand.length - 1; b++) {
      for (let c = b + 1; c < hand.length; c++) {
        if (isValidClassicSet(hand, [a, b, c])) return [a, b, c];
      }
    }
  }
  return null;
}

export function classicCardLogName(territoryId) {
  const card = getClassicCard(territoryId);
  return card ? `${card.emoji} ${card.name}` : territoryId;
}
