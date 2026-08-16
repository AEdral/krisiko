import { TERRITORIES, SEA_ROUTES } from '../data/map.js';
import { MAP_VIEWBOX, TERRITORY_SHAPES } from '../data/shapes.js';
import { areAdjacent } from '../engine/game.js';

const NS = 'http://www.w3.org/2000/svg';

function addSeaPath(layer, d, label) {
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'rgba(130, 210, 255, 0.7)');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-dasharray', '7 5');
  path.setAttribute('stroke-linecap', 'round');
  const title = document.createElementNS(NS, 'title');
  title.textContent = label;
  path.appendChild(title);
  layer.appendChild(path);
}

function drawSeaRoutes(world) {
  const seaLayer = document.createElementNS(NS, 'g');
  seaLayer.setAttribute('class', 'sea-links');

  for (const route of SEA_ROUTES) {
    const sa = TERRITORY_SHAPES[route.from];
    const sb = TERRITORY_SHAPES[route.to];
    if (!sa || !sb) continue;
    const label = `Rotta: ${TERRITORIES[route.from].name} ↔ ${TERRITORIES[route.to].name}`;

    if (route.wrap) {
      // Alaska ↔ Kamchatka across the Pacific (left/right edges)
      addSeaPath(seaLayer, `M ${sa.cx} ${sa.cy} Q 140 180 155 200`, label);
      addSeaPath(seaLayer, `M ${sb.cx} ${sb.cy} Q 920 170 905 195`, label);
      continue;
    }

    const [vx, vy] = route.via || [(sa.cx + sb.cx) / 2, (sa.cy + sb.cy) / 2 + 40];
    addSeaPath(seaLayer, `M ${sa.cx} ${sa.cy} Q ${vx} ${vy} ${sb.cx} ${sb.cy}`, label);
  }

  world.appendChild(seaLayer);
}

export function renderMap(svg, state, ui, onSelect) {
  svg.setAttribute('viewBox', MAP_VIEWBOX);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.innerHTML = '';

  const world = document.createElementNS(NS, 'g');

  drawSeaRoutes(world);

  const highlights = ui.highlightIds;

  for (const id of Object.keys(TERRITORY_SHAPES)) {
    const shape = TERRITORY_SHAPES[id];
    const meta = TERRITORIES[id];
    const t = state.territories[id];
    const owner = state.players[t.owner];

    const g = document.createElementNS(NS, 'g');
    g.classList.add('territory');
    g.dataset.id = id;
    if (ui.selectedId === id) g.classList.add('selected');
    if (highlights?.length) {
      if (highlights.includes(id)) g.classList.add('highlight');
      else if (ui.selectedId !== id) g.classList.add('dim');
    }

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', shape.d);
    path.setAttribute('fill', owner.color);
    path.setAttribute('fill-opacity', '0.9');
    g.appendChild(path);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', shape.cx);
    label.setAttribute('y', shape.cy);
    label.textContent = String(t.armies);
    g.appendChild(label);

    const title = document.createElementNS(NS, 'title');
    title.textContent = `${meta.name} — ${owner.name} (${t.armies})`;
    g.appendChild(title);

    g.addEventListener('click', () => onSelect(id));
    world.appendChild(g);
  }

  svg.appendChild(world);
}

export function computeHighlights(state, ui) {
  const pid = state.currentPlayerId;
  if (!state.players[pid]?.isHuman) return null;

  if (state.phase === 'setup') {
    return Object.keys(state.territories).filter((id) => state.territories[id].owner === pid);
  }

  if (!ui.selectedId) return null;

  const sel = ui.selectedId;
  const t = state.territories[sel];

  if (state.phase === 'reinforce') {
    if (t.owner === pid) return [sel];
    return [];
  }

  if (state.phase === 'attack' && t.owner === pid && t.armies >= 2) {
    return state.adjacency[sel].filter((n) => state.territories[n].owner !== pid);
  }

  if (state.phase === 'fortify' && t.owner === pid && t.armies >= 2) {
    return Object.keys(state.territories).filter((n) => {
      if (n === sel) return false;
      if (state.territories[n].owner !== pid) return false;
      return areAdjacent(sel, n) || state.activeEventId === 'supply_lines';
    });
  }

  return null;
}
