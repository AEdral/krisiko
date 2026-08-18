import { openP2pHost, openP2pGuest } from './p2p.js';

const CLIENT_ID_KEY = 'krisiko.clientId';
const HOST_ROOM_KEY = 'krisiko.hostRoom';
const HOST_ROOM_TTL_MS = 3 * 60 * 60 * 1000;

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

function isStaticPagesHost() {
  return /\.github\.io$/i.test(location.hostname);
}

export function describeNetError(err) {
  const m = String(err?.type || err?.message || err || '');
  if (/aborted/i.test(m)) return '';
  if (/host-offline|peer-unavailable|unavailable/i.test(m)) {
    return 'L’host non è raggiungibile. Deve tenere aperta la pagina della stanza mentre entri.';
  }
  if (/peerjs|peer-timeout|network|server-error/i.test(m)) {
    return 'Collegamento peer non disponibile. Controlla la rete e riprova.';
  }
  return 'Impossibile aprire la stanza online. Riprova.';
}

function newId() {
  try {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function storeClientId(id) {
  try {
    localStorage.setItem(CLIENT_ID_KEY, id);
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

function loadClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY) || sessionStorage.getItem(CLIENT_ID_KEY);
    if (!id) id = newId();
    storeClientId(id);
    return id;
  } catch {
    return newId();
  }
}

export function loadHostedRoom() {
  try {
    const raw = localStorage.getItem(HOST_ROOM_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.roomId) return null;
    if (Date.now() - Number(data.savedAt || 0) > HOST_ROOM_TTL_MS) {
      localStorage.removeItem(HOST_ROOM_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveHostedRoom(data) {
  try {
    localStorage.setItem(
      HOST_ROOM_KEY,
      JSON.stringify({ ...data, roomId: String(data.roomId).toLowerCase(), savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function clearHostedRoom() {
  try {
    localStorage.removeItem(HOST_ROOM_KEY);
  } catch {
    /* ignore */
  }
}

export function isHostOfRoom(roomId) {
  const hosted = loadHostedRoom();
  return !!(hosted && hosted.roomId === String(roomId || '').toLowerCase());
}

export function createNet(handlers = {}) {
  let ws = null;
  let clientId = loadClientId();
  let opened = false;
  let mode = null; // 'ws' | 'p2p'
  let p2p = null;
  const queue = [];
  let joinAborted = false;
  let lastJoin = null;
  let joining = false;
  let reconnectQueued = false;

  function emit(type, payload) {
    handlers[type]?.(payload);
  }

  function onUiMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello_ok') {
      clientId = msg.clientId;
      storeClientId(clientId);
      return;
    }
    if (msg.type === 'error') emit('error', msg.message);
    else if (msg.type === 'room') emit('room', msg.room);
    else if (msg.type === 'state') emit('state', msg);
  }

  function send(msg) {
    if (mode === 'p2p' && p2p) {
      if (p2p.sendToEngine) p2p.sendToEngine(msg);
      else p2p.send?.(msg);
      return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      queue.push(msg);
    }
  }

  function connectWs() {
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        ws = new WebSocket(wsUrl());
      } catch (err) {
        reject(err);
        return;
      }
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('timeout'));
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        }
      }, 1500);
      ws.onopen = () => {
        opened = true;
        ws.send(JSON.stringify({ type: 'hello', clientId }));
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.type === 'hello_ok') {
          clientId = msg.clientId;
          storeClientId(clientId);
          while (queue.length) {
            const next = queue.shift();
            if (next.type !== 'hello') ws.send(JSON.stringify(next));
          }
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve();
          }
          return;
        }
        onUiMessage(msg);
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('ws'));
        }
      };
      ws.onclose = () => {
        opened = false;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('closed'));
        }
      };
    });
  }

  async function connect() {
    if (mode === 'ws' && ws?.readyState === WebSocket.OPEN) return;
    if (mode === 'p2p') return;
    if (!isStaticPagesHost()) {
      try {
        await connectWs();
        mode = 'ws';
        return;
      } catch {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
        ws = null;
      }
    }
    mode = 'p2p';
    opened = true;
  }

  async function joinP2p({ roomId, name }) {
    lastJoin = { roomId, name };
    joining = true;
    p2p = await openP2pGuest({
      roomId,
      onMessage: onUiMessage,
      shouldAbort: () => joinAborted,
      onWaiting: () => emit('waitingHost', { roomId }),
      onClose: () => {
        if (joinAborted || joining || reconnectQueued || !lastJoin) return;
        reconnectQueued = true;
        p2p = null;
        emit('waitingHost', { roomId: lastJoin.roomId, dropped: true });
        const again = lastJoin;
        void joinP2p(again)
          .catch((err) => {
            if (!joinAborted) emit('error', describeNetError(err) || 'Connessione persa.');
          })
          .finally(() => {
            reconnectQueued = false;
          });
      },
    });
    joining = false;
    if (joinAborted) {
      p2p?.close?.();
      p2p = null;
      throw new Error('aborted');
    }
    p2p.send({ type: 'hello', clientId });
    p2p.send({ type: 'join', roomId, name });
  }

  return {
    get clientId() {
      return clientId;
    },
    get connected() {
      return opened;
    },
    get mode() {
      return mode;
    },
    connect,
    async create({ name, extraHumans, aiCount, vanillaMode, drawEveryTurn, roomId }) {
      joinAborted = false;
      if (mode === 'p2p') {
        p2p = await openP2pHost({ clientId, onMessage: onUiMessage, roomId });
        p2p.sendToEngine({ type: 'hello', clientId });
        p2p.sendToEngine({
          type: 'create',
          name,
          extraHumans,
          aiCount,
          vanillaMode,
          drawEveryTurn,
          roomId: p2p.roomId,
        });
        return;
      }
      send({ type: 'create', name, extraHumans, aiCount, vanillaMode, drawEveryTurn, roomId });
    },
    async join({ roomId, name }) {
      joinAborted = false;
      if (mode === 'p2p') {
        await joinP2p({ roomId, name });
        return;
      }
      send({ type: 'join', roomId, name });
    },
    start() {
      send({ type: 'start' });
    },
    action(action) {
      send({ type: 'action', action });
    },
    close() {
      joinAborted = true;
      lastJoin = null;
      joining = false;
      reconnectQueued = false;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      try {
        p2p?.close?.();
      } catch {
        /* ignore */
      }
      ws = null;
      p2p = null;
      opened = false;
      mode = null;
    },
  };
}
