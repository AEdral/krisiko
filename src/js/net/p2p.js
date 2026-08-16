import { handleNetMessage, parseNetPayload } from './protocol.js';
import { disconnect, newRoomId } from './rooms.js';

export function peerIdForRoom(roomId) {
  return `krs${String(roomId).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

function loadPeerJs() {
  if (globalThis.Peer) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('peerjs'));
    document.head.appendChild(s);
  });
}

function wrapConn(conn) {
  const ws = {
    readyState: 1,
    clientId: null,
    roomId: null,
    send(json) {
      if (!conn.open) return;
      try {
        conn.send(typeof json === 'string' ? JSON.parse(json) : json);
      } catch {
        /* ignore */
      }
    },
  };
  return ws;
}

function wireIncoming(conn, ws, send) {
  conn.on('data', (raw) => {
    const msg = parseNetPayload(raw);
    if (msg) handleNetMessage(ws, msg, send);
  });
  conn.on('close', () => disconnect(ws));
  conn.on('error', () => disconnect(ws));
}

/** Host: this tab is the room server. Guests connect via PeerJS. */
export async function openP2pHost({ clientId, onMessage }) {
  await loadPeerJs();
  const roomId = newRoomId();
  const peer = new globalThis.Peer(peerIdForRoom(roomId));

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('peer-timeout')), 10000);
    peer.on('open', () => {
      clearTimeout(t);
      resolve();
    });
    peer.on('error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });

  const send = (ws, msg) => {
    if (ws && ws.isLocal) {
      onMessage(msg);
      return;
    }
    ws.send(JSON.stringify(msg));
  };

  const localWs = {
    readyState: 1,
    isLocal: true,
    clientId,
    roomId: null,
    send(json) {
      onMessage(typeof json === 'string' ? JSON.parse(json) : json);
    },
  };

  peer.on('connection', (conn) => {
    wireIncoming(conn, wrapConn(conn), send);
  });

  return {
    roomId,
    localWs,
    sendToEngine(msg) {
      handleNetMessage(localWs, msg, send);
    },
    close() {
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Guest: connect to the host tab that created the room. */
export async function openP2pGuest({ roomId, onMessage }) {
  await loadPeerJs();
  const peer = new globalThis.Peer();

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('peer-timeout')), 10000);
    peer.on('open', () => {
      clearTimeout(t);
      resolve();
    });
    peer.on('error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });

  const conn = peer.connect(peerIdForRoom(roomId), { reliable: true });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('host-offline')), 12000);
    conn.on('open', () => {
      clearTimeout(t);
      resolve();
    });
    conn.on('error', (err) => {
      clearTimeout(t);
      reject(err);
    });
    peer.on('error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });

  conn.on('data', (raw) => {
    const msg = parseNetPayload(raw);
    if (msg) onMessage(msg);
  });

  return {
    send(msg) {
      if (conn.open) conn.send(msg);
    },
    close() {
      try {
        conn.close();
        peer.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}
