import { TERRITORIES, SEA_ROUTES } from '../data/map.js';
import { MAP_VIEWBOX, TERRITORY_SHAPES } from '../data/shapes.js';
import { areAdjacent } from '../engine/game.js';

const NS = 'http://www.w3.org/2000/svg';
const [BASE_X, BASE_Y, BASE_W, BASE_H] = MAP_VIEWBOX.split(/\s+/).map(Number);
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.18;

const cam = { x: BASE_X, y: BASE_Y, w: BASE_W, h: BASE_H };
const pointers = new Map();
let cameraBound = false;
let suppressClick = false;
let lastPan = null;
let lastPinch = null;
let dragged = false;

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

function applyCam(svg) {
  svg.setAttribute('viewBox', `${cam.x} ${cam.y} ${cam.w} ${cam.h}`);
}

function svgPoint(svg, clientX, clientY) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: cam.x + cam.w / 2, y: cam.y + cam.h / 2 };
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function clampCam() {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, BASE_W / cam.w));
  cam.w = BASE_W / s;
  cam.h = BASE_H / s;
  cam.x = Math.min(BASE_X + BASE_W - cam.w, Math.max(BASE_X, cam.x));
  cam.y = Math.min(BASE_Y + BASE_H - cam.h, Math.max(BASE_Y, cam.y));
}

function zoomAt(svg, clientX, clientY, factor) {
  const p = svgPoint(svg, clientX, clientY);
  const nextW = cam.w / factor;
  const nextH = cam.h / factor;
  cam.x = p.x - (p.x - cam.x) * (nextW / cam.w);
  cam.y = p.y - (p.y - cam.y) * (nextH / cam.h);
  cam.w = nextW;
  cam.h = nextH;
  clampCam();
  applyCam(svg);
}

function zoomCenter(svg, factor) {
  const r = svg.getBoundingClientRect();
  zoomAt(svg, r.left + r.width / 2, r.top + r.height / 2, factor);
}

function resetCam(svg) {
  cam.x = BASE_X;
  cam.y = BASE_Y;
  cam.w = BASE_W;
  cam.h = BASE_H;
  applyCam(svg);
}

function bindMapCamera(svg) {
  if (cameraBound) return;
  cameraBound = true;

  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(svg, e.clientX, e.clientY, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    },
    { passive: false },
  );

  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragged = false;
    lastPinch = null;
    lastPan = { x: e.clientX, y: e.clientY };
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      const pts = [...pointers.values()];
      const a = pts[0];
      const b = pts[1];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      if (lastPinch && lastPinch.dist > 0) {
        zoomAt(svg, midX, midY, dist / lastPinch.dist);
        dragged = true;
      }
      lastPinch = { dist };
      lastPan = null;
      return;
    }

    if (!lastPan) return;
    const dx = e.clientX - lastPan.x;
    const dy = e.clientY - lastPan.y;
    if (Math.hypot(dx, dy) > 4) dragged = true;
    const p0 = svgPoint(svg, lastPan.x, lastPan.y);
    const p1 = svgPoint(svg, e.clientX, e.clientY);
    cam.x -= p1.x - p0.x;
    cam.y -= p1.y - p0.y;
    clampCam();
    applyCam(svg);
    lastPan = { x: e.clientX, y: e.clientY };
  });

  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    lastPinch = null;
    if (pointers.size === 0) {
      lastPan = null;
      if (dragged) {
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
    } else {
      const only = [...pointers.values()][0];
      lastPan = { x: only.x, y: only.y };
    }
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  svg.addEventListener('dblclick', (e) => {
    e.preventDefault();
    zoomAt(svg, e.clientX, e.clientY, ZOOM_STEP * ZOOM_STEP);
  });

  const panel = svg.closest('.map-panel');
  panel?.querySelector('#map-zoom-in')?.addEventListener('click', () => zoomCenter(svg, ZOOM_STEP));
  panel?.querySelector('#map-zoom-out')?.addEventListener('click', () => zoomCenter(svg, 1 / ZOOM_STEP));
  panel?.querySelector('#map-zoom-reset')?.addEventListener('click', () => resetCam(svg));
}

export function renderMap(svg, state, ui, onSelect) {
  bindMapCamera(svg);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  applyCam(svg);
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

    g.addEventListener('click', (ev) => {
      if (suppressClick) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      onSelect(id);
    });
    world.appendChild(g);
  }

  svg.appendChild(world);
}

export function computeHighlights(state, ui) {
  const pid = state.currentPlayerId;
  if (ui.localPlayerId && pid !== ui.localPlayerId) return null;
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
