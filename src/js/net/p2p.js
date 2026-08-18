import { handleNetMessage, parseNetPayload } from './protocol.js';
import { disconnect, newRoomId } from './rooms.js';

export function peerIdForRoom(roomId) {
  return `krs${String(roomId).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function destroyPeer(peer) {
  try {
    peer?.destroy?.();
  } catch {
    /* ignore */
  }
}

function waitPeerOpen(peer, ms, extraOk) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('peer-timeout')), ms);
    const done = (err) => {
      clearTimeout(t);
      if (err) reject(err);
      else resolve();
    };
    peer.on('open', () => done());
    peer.on('error', (err) => {
      if (extraOk?.(err)) return;
      done(err);
    });
  });
}

async function openNamedPeer(peerId) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const peer = new globalThis.Peer(peerId);
    try {
      await waitPeerOpen(peer, 10000);
      return peer;
    } catch (err) {
      destroyPeer(peer);
      const t = String(err?.type || err?.message || err);
      if (!/unavailable-id/i.test(t) || attempt === 5) throw err;
      await sleep(1500);
    }
  }
  throw new Error('peer-timeout');
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
export async function openP2pHost({ clientId, onMessage, roomId: forcedId }) {
  await loadPeerJs();
  const roomId = String(forcedId || newRoomId()).toLowerCase();
  const peer = await openNamedPeer(peerIdForRoom(roomId));

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
      destroyPeer(peer);
    },
  };
}

function isHostMissing(err) {
  const t = String(err?.type || err?.message || err);
  return /host-offline|peer-unavailable|unavailable|Could not connect|peer-timeout/i.test(t);
}

/** Guest: connect to the host tab that created the room. Retries while host is offline. */
export async function openP2pGuest({ roomId, onMessage, onWaiting, onClose, shouldAbort }) {
  await loadPeerJs();
  const id = peerIdForRoom(roomId);
  let attempt = 0;

  while (!shouldAbort?.()) {
    attempt += 1;
    const peer = new globalThis.Peer();
    try {
      await waitPeerOpen(peer, 8000);
      if (shouldAbort?.()) {
        destroyPeer(peer);
        throw new Error('aborted');
      }
      const conn = peer.connect(id, { reliable: true });
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('host-offline')), 8000);
        const fail = (err) => {
          clearTimeout(t);
          reject(err || new Error('host-offline'));
        };
        conn.on('open', () => {
          clearTimeout(t);
          resolve();
        });
        conn.on('error', fail);
        peer.on('error', fail);
      });

      conn.on('data', (raw) => {
        const msg = parseNetPayload(raw);
        if (msg) onMessage(msg);
      });
      const notifyClose = () => {
        if (!shouldAbort?.()) onClose?.();
      };
      conn.on('close', notifyClose);
      conn.on('error', notifyClose);

      return {
        send(msg) {
          if (conn.open) conn.send(msg);
        },
        close() {
          try {
            conn.close();
          } catch {
            /* ignore */
          }
          destroyPeer(peer);
        },
      };
    } catch (err) {
      destroyPeer(peer);
      if (shouldAbort?.() || String(err?.message) === 'aborted') throw new Error('aborted');
      if (!isHostMissing(err)) throw err;
      onWaiting?.({ attempt });
      await sleep(2500);
    }
  }
  throw new Error('aborted');
}
