import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { handleNetMessage, parseNetPayload } from '../src/js/net/protocol.js';
import { disconnect } from '../src/js/net/rooms.js';
import { log } from '../src/js/net/logger.js';

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
  log.debug('http', `${req.method} ${req.url}`);

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

wss.on('connection', (ws, req) => {
  ws.clientId = null;
  ws.roomId = null;
  log.info('ws', 'connection', { ip: req.socket?.remoteAddress });

  ws.on('message', (raw) => {
    const msg = parseNetPayload(raw);
    if (!msg) {
      log.warn('ws', 'invalid payload');
      send(ws, { type: 'error', message: 'Messaggio non valido.' });
      return;
    }
    log.info('ws', `← ${msg.type}`, {
      room: ws.roomId || msg.roomId || null,
      client: ws.clientId,
      action: msg.action?.type || msg.type,
    });
    handleNetMessage(ws, msg, send);
  });

  ws.on('close', () => {
    log.info('ws', 'close', { client: ws.clientId, room: ws.roomId });
    disconnect(ws);
  });
  ws.on('error', (err) => {
    log.warn('ws', 'error', { message: err?.message, client: ws.clientId });
    disconnect(ws);
  });
});

server.listen(PORT, () => {
  log.info('server', `Krisiko listening on :${PORT}`, { logLevel: process.env.LOG_LEVEL || 'info' });
});