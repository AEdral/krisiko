import { createRoom, joinRoom, startRoom, handleAction, sanitizeName } from './rooms.js';

function newClientId() {
  try {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Shared WS / P2P message handler. `send(ws, obj)` must JSON-encode if needed. */
export function handleNetMessage(ws, msg, send) {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'hello') {
    ws.clientId =
      typeof msg.clientId === 'string' && msg.clientId.length < 80 ? msg.clientId : newClientId();
    send(ws, { type: 'hello_ok', clientId: ws.clientId });
    return;
  }

  if (!ws.clientId) {
    send(ws, { type: 'error', message: 'Invia hello prima.' });
    return;
  }

  if (msg.type === 'create') {
    const result = createRoom({
      hostClientId: ws.clientId,
      hostName: sanitizeName(msg.name),
      extraHumans: msg.extraHumans,
      aiCount: msg.aiCount,
      ws,
      id: msg.roomId,
    });
    if (result.error) send(ws, { type: 'error', message: result.error });
    else send(ws, { type: 'room', room: result.room });
    return;
  }

  if (msg.type === 'join') {
    const result = joinRoom({
      roomId: String(msg.roomId || '').toLowerCase(),
      clientId: ws.clientId,
      name: sanitizeName(msg.name),
      ws,
    });
    if (result.error) send(ws, { type: 'error', message: result.error });
    else send(ws, { type: 'room', room: result.room });
    return;
  }

  if (msg.type === 'start') {
    const result = startRoom(ws.roomId, ws.clientId);
    if (result.error) send(ws, { type: 'error', message: result.error });
    return;
  }

  if (msg.type === 'action') {
    const result = handleAction(ws.roomId, ws.clientId, msg.action);
    if (result.error) send(ws, { type: 'error', message: result.error });
  }
}

export function parseNetPayload(raw) {
  if (raw && typeof raw === 'object' && raw.constructor === Object) return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}
