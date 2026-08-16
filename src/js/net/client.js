import { openP2pHost, openP2pGuest } from './p2p.js';

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

function isStaticPagesHost() {
  return /\.github\.io$/i.test(location.hostname);
}

export function describeNetError(err) {
  const m = String(err?.type || err?.message || err || '');
  if (/host-offline|peer-unavailable|unavailable/i.test(m)) {
    return 'L’host non è raggiungibile. Deve tenere aperta la pagina della stanza.';
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

function loadClientId() {
  try {
    let id = sessionStorage.getItem('krisiko.clientId');
    if (!id) {
      id = newId();
      sessionStorage.setItem('krisiko.clientId', id);
    }
    return id;
  } catch {
    return newId();
  }
}

export function createNet(handlers = {}) {
  let ws = null;
  let clientId = loadClientId();
  let opened = false;
  let mode = null; // 'ws' | 'p2p'
  let p2p = null;
  const queue = [];

  function emit(type, payload) {
    handlers[type]?.(payload);
  }

  function onUiMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello_ok') {
      clientId = msg.clientId;
      try {
        sessionStorage.setItem('krisiko.clientId', clientId);
      } catch {
        /* ignore */
      }
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
          try {
            sessionStorage.setItem('krisiko.clientId', clientId);
          } catch {
            /* ignore */
          }
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
    async create({ name, extraHumans, aiCount }) {
      if (mode === 'p2p') {
        p2p = await openP2pHost({ clientId, onMessage: onUiMessage });
        p2p.sendToEngine({ type: 'hello', clientId });
        p2p.sendToEngine({
          type: 'create',
          name,
          extraHumans,
          aiCount,
          roomId: p2p.roomId,
        });
        return;
      }
      send({ type: 'create', name, extraHumans, aiCount });
    },
    async join({ roomId, name }) {
      if (mode === 'p2p') {
        p2p = await openP2pGuest({ roomId, onMessage: onUiMessage });
        p2p.send({ type: 'hello', clientId });
        p2p.send({ type: 'join', roomId, name });
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
