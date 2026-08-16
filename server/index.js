import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { createRoom, joinRoom, startRoom, handleAction, disconnect, sanitizeName } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function safeFile(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  let rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const full = path.resolve(SRC, rel);
  if (!full.startsWith(SRC)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/healthz')) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }

  const file = safeFile(req.url);
  if (!file) {
    res.writeHead(400);
    res.end();
    return;
  }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws) => {
  ws.clientId = null;
  ws.roomId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, { type: 'error', message: 'Messaggio non valido.' });
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'hello') {
      ws.clientId = typeof msg.clientId === 'string' && msg.clientId.length < 80 ? msg.clientId : randomUUID();
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
      });
      if (result.error) send(ws, { type: 'error', message: result.error });
      else send(ws, { type: 'room', room: result.room });
      return;
    }

    if (msg.type === 'join') {
      const roomId = String(msg.roomId || '').toLowerCase();
      const result = joinRoom({
        roomId,
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
      return;
    }
  });

  ws.on('close', () => disconnect(ws));
  ws.on('error', () => disconnect(ws));
});

server.listen(PORT, () => {
  console.log(`Krisiko http://localhost:${PORT}`);
});
