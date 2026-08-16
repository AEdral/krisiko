function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
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
  const queue = [];

  function emit(type, payload) {
    handlers[type]?.(payload);
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      queue.push(msg);
    }
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }
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
      }, 4000);
      ws.onopen = () => {
        opened = true;
        send({ type: 'hello', clientId });
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
        if (msg.type === 'error') emit('error', msg.message);
        else if (msg.type === 'room') emit('room', msg.room);
        else if (msg.type === 'state') emit('state', msg);
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('ws'));
        }
        emit('error', 'Server online non raggiungibile. Avvia Krisiko con npm start (non Pages).');
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

  return {
    get clientId() {
      return clientId;
    },
    get connected() {
      return opened && ws?.readyState === WebSocket.OPEN;
    },
    connect,
    create({ name, extraHumans, aiCount }) {
      send({ type: 'create', name, extraHumans, aiCount });
    },
    join({ roomId, name }) {
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
      ws = null;
      opened = false;
    },
  };
}
