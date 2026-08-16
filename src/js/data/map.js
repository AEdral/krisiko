/** Classic Risk map: 42 territories, continents, adjacencies. */

export const TERRITORIES = {
  alaska: { id: 'alaska', name: 'Alaska', continent: 'na', x: 8, y: 18 },
  northwest_territory: { id: 'northwest_territory', name: 'Northwest Territory', continent: 'na', x: 18, y: 16 },
  greenland: { id: 'greenland', name: 'Greenland', continent: 'na', x: 38, y: 10 },
  alberta: { id: 'alberta', name: 'Alberta', continent: 'na', x: 16, y: 26 },
  ontario: { id: 'ontario', name: 'Ontario', continent: 'na', x: 26, y: 28 },
  quebec: { id: 'quebec', name: 'Quebec', continent: 'na', x: 34, y: 28 },
  western_us: { id: 'western_us', name: 'Western United States', continent: 'na', x: 16, y: 38 },
  eastern_us: { id: 'eastern_us', name: 'Eastern United States', continent: 'na', x: 26, y: 40 },
  central_america: { id: 'central_america', name: 'Central America', continent: 'na', x: 18, y: 52 },

  venezuela: { id: 'venezuela', name: 'Venezuela', continent: 'sa', x: 28, y: 60 },
  peru: { id: 'peru', name: 'Peru', continent: 'sa', x: 26, y: 72 },
  brazil: { id: 'brazil', name: 'Brazil', continent: 'sa', x: 34, y: 68 },
  argentina: { id: 'argentina', name: 'Argentina', continent: 'sa', x: 28, y: 84 },

  iceland: { id: 'iceland', name: 'Iceland', continent: 'eu', x: 48, y: 18 },
  scandinavia: { id: 'scandinavia', name: 'Scandinavia', continent: 'eu', x: 56, y: 16 },
  ukraine: { id: 'ukraine', name: 'Ukraine', continent: 'eu', x: 64, y: 28 },
  great_britain: { id: 'great_britain', name: 'Great Britain', continent: 'eu', x: 48, y: 30 },
  northern_europe: { id: 'northern_europe', name: 'Northern Europe', continent: 'eu', x: 54, y: 32 },
  western_europe: { id: 'western_europe', name: 'Western Europe', continent: 'eu', x: 48, y: 42 },
  southern_europe: { id: 'southern_europe', name: 'Southern Europe', continent: 'eu', x: 56, y: 42 },

  north_africa: { id: 'north_africa', name: 'North Africa', continent: 'af', x: 50, y: 58 },
  egypt: { id: 'egypt', name: 'Egypt', continent: 'af', x: 58, y: 54 },
  east_africa: { id: 'east_africa', name: 'East Africa', continent: 'af', x: 62, y: 66 },
  congo: { id: 'congo', name: 'Congo', continent: 'af', x: 56, y: 72 },
  south_africa: { id: 'south_africa', name: 'South Africa', continent: 'af', x: 58, y: 84 },
  madagascar: { id: 'madagascar', name: 'Madagascar', continent: 'af', x: 66, y: 82 },

  ural: { id: 'ural', name: 'Ural', continent: 'as', x: 72, y: 22 },
  siberia: { id: 'siberia', name: 'Siberia', continent: 'as', x: 78, y: 16 },
  yakutsk: { id: 'yakutsk', name: 'Yakutsk', continent: 'as', x: 88, y: 12 },
  kamchatka: { id: 'kamchatka', name: 'Kamchatka', continent: 'as', x: 96, y: 16 },
  irkutsk: { id: 'irkutsk', name: 'Irkutsk', continent: 'as', x: 84, y: 26 },
  mongolia: { id: 'mongolia', name: 'Mongolia', continent: 'as', x: 84, y: 36 },
  japan: { id: 'japan', name: 'Japan', continent: 'as', x: 94, y: 36 },
  afghanistan: { id: 'afghanistan', name: 'Afghanistan', continent: 'as', x: 70, y: 38 },
  china: { id: 'china', name: 'China', continent: 'as', x: 82, y: 46 },
  middle_east: { id: 'middle_east', name: 'Middle East', continent: 'as', x: 64, y: 48 },
  india: { id: 'india', name: 'India', continent: 'as', x: 74, y: 52 },
  siam: { id: 'siam', name: 'Siam', continent: 'as', x: 82, y: 56 },

  indonesia: { id: 'indonesia', name: 'Indonesia', continent: 'oc', x: 86, y: 68 },
  new_guinea: { id: 'new_guinea', name: 'New Guinea', continent: 'oc', x: 94, y: 70 },
  western_australia: { id: 'western_australia', name: 'Western Australia', continent: 'oc', x: 88, y: 82 },
  eastern_australia: { id: 'eastern_australia', name: 'Eastern Australia', continent: 'oc', x: 96, y: 84 },
};

export const CONTINENTS = {
  na: {
    id: 'na',
    name: 'North America',
    bonus: 5,
    territories: [
      'alaska', 'northwest_territory', 'greenland', 'alberta', 'ontario',
      'quebec', 'western_us', 'eastern_us', 'central_america',
    ],
  },
  sa: {
    id: 'sa',
    name: 'South America',
    bonus: 2,
    territories: ['venezuela', 'peru', 'brazil', 'argentina'],
  },
  eu: {
    id: 'eu',
    name: 'Europe',
    bonus: 5,
    territories: [
      'iceland', 'scandinavia', 'ukraine', 'great_britain',
      'northern_europe', 'western_europe', 'southern_europe',
    ],
  },
  af: {
    id: 'af',
    name: 'Africa',
    bonus: 3,
    territories: [
      'north_africa', 'egypt', 'east_africa', 'congo', 'south_africa', 'madagascar',
    ],
  },
  as: {
    id: 'as',
    name: 'Asia',
    bonus: 7,
    territories: [
      'ural', 'siberia', 'yakutsk', 'kamchatka', 'irkutsk', 'mongolia', 'japan',
      'afghanistan', 'china', 'middle_east', 'india', 'siam',
    ],
  },
  oc: {
    id: 'oc',
    name: 'Oceania',
    bonus: 2,
    territories: ['indonesia', 'new_guinea', 'western_australia', 'eastern_australia'],
  },
};

/** Undirected adjacencies (each pair listed once; engine mirrors both ways). */
export const ADJACENCY_PAIRS = [
  ['alaska', 'northwest_territory'],
  ['alaska', 'alberta'],
  ['alaska', 'kamchatka'],
  ['northwest_territory', 'alberta'],
  ['northwest_territory', 'ontario'],
  ['northwest_territory', 'greenland'],
  ['greenland', 'ontario'],
  ['greenland', 'quebec'],
  ['greenland', 'iceland'],
  ['alberta', 'ontario'],
  ['alberta', 'western_us'],
  ['ontario', 'quebec'],
  ['ontario', 'western_us'],
  ['ontario', 'eastern_us'],
  ['quebec', 'eastern_us'],
  ['western_us', 'eastern_us'],
  ['western_us', 'central_america'],
  ['eastern_us', 'central_america'],
  ['central_america', 'venezuela'],
  ['venezuela', 'peru'],
  ['venezuela', 'brazil'],
  ['peru', 'brazil'],
  ['peru', 'argentina'],
  ['brazil', 'argentina'],
  ['brazil', 'north_africa'],
  ['iceland', 'great_britain'],
  ['iceland', 'scandinavia'],
  ['scandinavia', 'ukraine'],
  ['scandinavia', 'northern_europe'],
  ['scandinavia', 'great_britain'],
  ['ukraine', 'ural'],
  ['ukraine', 'afghanistan'],
  ['ukraine', 'middle_east'],
  ['ukraine', 'southern_europe'],
  ['ukraine', 'northern_europe'],
  ['great_britain', 'northern_europe'],
  ['great_britain', 'western_europe'],
  ['northern_europe', 'western_europe'],
  ['northern_europe', 'southern_europe'],
  ['western_europe', 'southern_europe'],
  ['western_europe', 'north_africa'],
  ['southern_europe', 'north_africa'],
  ['southern_europe', 'egypt'],
  ['southern_europe', 'middle_east'],
  ['north_africa', 'egypt'],
  ['north_africa', 'east_africa'],
  ['north_africa', 'congo'],
  ['egypt', 'middle_east'],
  ['egypt', 'east_africa'],
  ['east_africa', 'middle_east'],
  ['east_africa', 'congo'],
  ['east_africa', 'south_africa'],
  ['east_africa', 'madagascar'],
  ['congo', 'south_africa'],
  ['south_africa', 'madagascar'],
  ['ural', 'siberia'],
  ['ural', 'china'],
  ['ural', 'afghanistan'],
  ['siberia', 'yakutsk'],
  ['siberia', 'irkutsk'],
  ['siberia', 'mongolia'],
  ['siberia', 'china'],
  ['yakutsk', 'kamchatka'],
  ['yakutsk', 'irkutsk'],
  ['kamchatka', 'irkutsk'],
  ['kamchatka', 'mongolia'],
  ['kamchatka', 'japan'],
  ['irkutsk', 'mongolia'],
  ['mongolia', 'japan'],
  ['mongolia', 'china'],
  ['afghanistan', 'china'],
  ['afghanistan', 'india'],
  ['afghanistan', 'middle_east'],
  ['china', 'india'],
  ['china', 'siam'],
  ['middle_east', 'india'],
  ['india', 'siam'],
  ['siam', 'indonesia'],
  ['indonesia', 'new_guinea'],
  ['indonesia', 'western_australia'],
  ['new_guinea', 'western_australia'],
  ['new_guinea', 'eastern_australia'],
  ['western_australia', 'eastern_australia'],
];

export function buildAdjacencyMap() {
  const map = {};
  for (const id of Object.keys(TERRITORIES)) map[id] = [];
  for (const [a, b] of ADJACENCY_PAIRS) {
    map[a].push(b);
    map[b].push(a);
  }
  return map;
}

export const TERRITORY_IDS = Object.keys(TERRITORIES);
export const INITIAL_ARMIES_2P = 40;

/**
 * Sea routes drawn on the map. `via` = quadratic control point in map coords
 * so lines bend through the ocean (not across Europe).
 * Still playable via ADJACENCY_PAIRS.
 */
export const SEA_ROUTES = [
  // Pacific wrap: drawn as two segments in map.js
  { from: 'alaska', to: 'kamchatka', wrap: true },
  { from: 'greenland', to: 'iceland', via: [450, 165] },
  { from: 'brazil', to: 'north_africa', via: [430, 510] },
  { from: 'western_europe', to: 'north_africa', via: [470, 390] },
  { from: 'siam', to: 'indonesia', via: [780, 450] },
  { from: 'east_africa', to: 'madagascar', via: [640, 530] },
  { from: 'south_africa', to: 'madagascar', via: [620, 575] },
  { from: 'japan', to: 'kamchatka', via: [860, 250] },
  { from: 'japan', to: 'mongolia', via: [820, 320] },
  { from: 'great_britain', to: 'iceland', via: [470, 250] },
];
