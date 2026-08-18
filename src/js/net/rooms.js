import {
  createGame,
  applyAction,
  viewForPlayer,
  PLAYER_SLOTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from '../engine/game.js';
import { runAiTurn } from '../ai/ai.js';

const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
const EMPTY_TTL_MS = 15 * 60 * 1000;
const OVER_TTL_MS = 30 * 60 * 1000;
const MAX_ROOMS = 200;

const rooms = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function newRoomId() {
  const bytes = new Uint8Array(4);
  (globalThis.crypto || {}).getRandomValues?.(bytes);
  if (!bytes[0] && !bytes[1]) {
    return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  }
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function sanitizeName(raw) {
  const s = String(raw || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
  return s || 'Giocatore';
}

function clampCounts(extraHumans, aiCount) {
  let extra = Math.max(1, Math.min(MAX_PLAYERS - 1, Math.floor(Number(extraHumans) || 1)));
  let ai = Math.max(0, Math.min(MAX_PLAYERS - 2, Math.floor(Number(aiCount) || 0)));
  if (1 + extra + ai > MAX_PLAYERS) {
    ai = Math.max(0, MAX_PLAYERS - 1 - extra);
  }
  if (1 + extra + ai < MIN_PLAYERS) extra = 1;
  return { extraHumans: extra, aiCount: ai };
}

function publicRoom(room, clientId) {
  const you = room.seats.find((s) => s.clientId === clientId);
  return {
    id: room.id,
    status: room.status,
    extraHumans: room.extraHumans,
    aiCount: room.aiCount,
    vanillaMode: room.vanillaMode,
    drawEveryTurn: room.drawEveryTurn,
    hostClientId: room.hostClientId,
    you: {
      clientId,
      playerId: you?.id ?? null,
      isHost: clientId === room.hostClientId,
    },
    seats: room.seats.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      color: s.color,
      taken: s.kind === 'ai' || !!s.clientId,
      connected: s.kind === 'ai' ? true : !!s.connected,
    })),
  };
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoom(room) {
  for (const ws of room.sockets) {
    send(ws, { type: 'room', room: publicRoom(room, ws.clientId) });
  }
}

function broadcastState(room) {
  if (!room.state) return;
  for (const ws of room.sockets) {
    const seat = room.seats.find((s) => s.clientId === ws.clientId);
    if (!seat || seat.kind !== 'human') continue;
    send(ws, {
      type: 'state',
      playerId: seat.id,
      state: viewForPlayer(room.state, seat.id),
    });
  }
}

export function createRoom({
  hostClientId,
  hostName,
  extraHumans,
  aiCount,
  vanillaMode,
  drawEveryTurn,
  ws,
  id: forcedId,
}) {
  sweep();
  const counts = clampCounts(extraHumans, aiCount);
  const extra = counts.extraHumans;
  const ai = counts.aiCount;
  const humanSeats = 1 + extra;
  const total = humanSeats + ai;
  const id = (forcedId || newRoomId()).toLowerCase();
  const existing = rooms.get(id);
  if (existing) {
    if (existing.hostClientId !== hostClientId) {
      return { error: 'Questa stanza è già aperta da un altro host.' };
    }
    if (ws) {
      ws.clientId = hostClientId;
      ws.roomId = id;
      existing.sockets.add(ws);
    }
    const hostSeat = existing.seats.find((s) => s.clientId === hostClientId);
    if (hostSeat) {
      hostSeat.connected = true;
      if (hostName) hostSeat.name = hostName;
    }
    existing.lastActive = Date.now();
    broadcastRoom(existing);
    return { room: publicRoom(existing, hostClientId) };
  }
  if (rooms.size >= MAX_ROOMS) {
    return { error: 'Troppe stanze attive, riprova tra poco.' };
  }
  const seats = [];
  for (let i = 0; i < total; i++) {
    const slot = PLAYER_SLOTS[i];
    const isHumanSeat = i < humanSeats;
    seats.push({
      id: slot.id,
      kind: isHumanSeat ? 'human' : 'ai',
      name: isHumanSeat ? (i === 0 ? hostName : 'In attesa…') : slot.name,
      color: slot.color,
      clientId: i === 0 ? hostClientId : null,
      connected: i === 0,
    });
  }
  const room = {
    id,
    hostClientId,
    extraHumans: extra,
    aiCount: ai,
    vanillaMode: !!vanillaMode,
    drawEveryTurn: !vanillaMode && !!drawEveryTurn,
    seats,
    status: 'lobby',
    state: null,
    sockets: new Set(),
    lastActive: Date.now(),
    createdAt: Date.now(),
    aiRunning: false,
  };
  if (ws) {
    ws.clientId = hostClientId;
    ws.roomId = id;
    room.sockets.add(ws);
  }
  rooms.set(id, room);
  return { room: publicRoom(room, hostClientId) };
}

export function joinRoom({ roomId, clientId, name, ws }) {
  const room = rooms.get(String(roomId || '').toLowerCase());
  if (!room) return { error: 'Stanza non trovata. Il link è sbagliato o l’host ha chiuso la pagina.' };
  room.lastActive = Date.now();

  const existing = room.seats.find((s) => s.kind === 'human' && s.clientId === clientId);
  if (existing) {
    existing.connected = true;
    existing.name = name || existing.name;
    ws.clientId = clientId;
    ws.roomId = room.id;
    room.sockets.add(ws);
    broadcastRoom(room);
    if (room.state) {
      send(ws, { type: 'state', playerId: existing.id, state: viewForPlayer(room.state, existing.id) });
    }
    return { room: publicRoom(room, clientId) };
  }

  if (room.status !== 'lobby') {
    return { error: 'La partita è già iniziata e non ci sono posti per te.' };
  }

  const open = room.seats.find((s) => s.kind === 'human' && !s.clientId);
  if (!open) return { error: 'Stanza piena.' };

  open.clientId = clientId;
  open.connected = true;
  open.name = name;
  ws.clientId = clientId;
  ws.roomId = room.id;
  room.sockets.add(ws);
  broadcastRoom(room);
  return { room: publicRoom(room, clientId) };
}

export function startRoom(roomId, clientId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Stanza non trovata.' };
  if (room.hostClientId !== clientId) return { error: 'Solo chi ha creato la stanza può iniziare.' };
  if (room.status !== 'lobby') return { error: 'La partita è già iniziata.' };

  for (const seat of room.seats) {
    if (seat.kind === 'human' && !seat.clientId) {
      const slot = PLAYER_SLOTS.find((s) => s.id === seat.id);
      seat.kind = 'ai';
      seat.name = slot?.name || 'IA';
      seat.connected = true;
    }
  }

  const humans = room.seats.filter((s) => s.kind === 'human' && s.clientId);
  if (humans.length < 1) return { error: 'Serve almeno un giocatore.' };
  if (room.seats.length < MIN_PLAYERS) return { error: 'Servono almeno 2 giocatori.' };

  const seats = room.seats.map((s) => ({
    id: s.id,
    name: s.name,
    isHuman: s.kind === 'human',
  }));

  room.state = createGame({
    seed: Date.now() & 0xffffffff,
    seats,
    vanillaMode: room.vanillaMode,
    drawEveryTurn: room.drawEveryTurn,
  });
  room.status = 'playing';
  room.lastActive = Date.now();
  broadcastRoom(room);
  broadcastState(room);
  void pumpAi(room);
  return { ok: true };
}

export function handleAction(roomId, clientId, action) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Stanza non trovata.' };
  if (room.status !== 'playing' || !room.state) return { error: 'La partita non è in corso.' };
  if (room.state.phase === 'game_over') return { error: 'Partita finita.' };

  const seat = room.seats.find((s) => s.clientId === clientId);
  if (!seat || seat.kind !== 'human') return { error: 'Non sei in questa partita.' };
  if (room.state.currentPlayerId !== seat.id) return { error: 'Non è il tuo turno.' };
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
    return { error: 'Azione non valida.' };
  }

  applyAction(room.state, action);
  room.lastActive = Date.now();
  if (room.state.phase === 'game_over') room.status = 'done';
  broadcastState(room);
  void pumpAi(room);
  return { ok: true };
}

async function pumpAi(room) {
  if (room.aiRunning || !room.state) return;
  room.aiRunning = true;
  try {
    while (room.state && room.state.phase !== 'game_over') {
      const pid = room.state.currentPlayerId;
      const p = room.state.players[pid];
      if (!p || p.isHuman) break;
      if (room.state.phase === 'setup') {
        runAiTurn(room.state, { maxSteps: 5 });
        broadcastState(room);
        await sleep(90);
      } else {
        runAiTurn(room.state);
        if (room.state.phase === 'game_over') room.status = 'done';
        broadcastState(room);
        await sleep(380);
      }
    }
  } finally {
    room.aiRunning = false;
  }
}

export function disconnect(ws) {
  const roomId = ws.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  room.sockets.delete(ws);
  const seat = room.seats.find((s) => s.clientId === ws.clientId);
  if (seat) seat.connected = false;
  room.lastActive = Date.now();
  broadcastRoom(room);
}

function sweep() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    const empty = room.sockets.size === 0;
    const age = now - room.lastActive;
    const kill =
      age > ROOM_TTL_MS ||
      (empty && age > EMPTY_TTL_MS) ||
      (room.status === 'done' && age > OVER_TTL_MS) ||
      (room.status === 'lobby' && empty && age > EMPTY_TTL_MS);
    if (kill) rooms.delete(id);
  }
}

const sweepTimer = setInterval(sweep, 60_000);
sweepTimer.unref?.();
