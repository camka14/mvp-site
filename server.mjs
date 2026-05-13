#!/usr/bin/env node

import { createServer } from 'node:http';

const MATCH_REALTIME_PATH = '/api/realtime/matches';
const MATCH_REALTIME_SCOPE = 'event-match-updates';

const parsePort = (args) => {
  const equalsArg = args.find((arg) => arg.startsWith('--port='));
  if (equalsArg) {
    const parsed = Number(equalsArg.slice('--port='.length));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === '--port') {
      const parsed = Number(args[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  const fromEnv = Number(process.env.PORT);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 3000;
};

const normalizeToken = (value) => {
  if (Array.isArray(value)) return normalizeToken(value[0]);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseRequestUrl = (value) => {
  try {
    return new URL(value || '/', 'http://localhost');
  } catch {
    return new URL('/', 'http://localhost');
  }
};

const getAuthSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }
  return secret;
};

const verifyRealtimeToken = (token, eventId) => {
  try {
    const decoded = jwt.verify(token, getAuthSecret());
    if (!decoded || typeof decoded !== 'object') return null;
    if (decoded.scope !== MATCH_REALTIME_SCOPE) return null;
    if (decoded.eventId !== eventId) return null;
    const userId = normalizeToken(decoded.userId);
    return userId ? { userId } : null;
  } catch {
    return null;
  }
};

const sendUpgradeError = (socket, status, message) => {
  socket.write(
    `HTTP/1.1 ${status} ${message}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain\r\n' +
      `Content-Length: ${Buffer.byteLength(message)}\r\n` +
      '\r\n' +
      message,
  );
  socket.destroy();
};

const args = process.argv.slice(2);
const dev = args.includes('--dev');
const port = parsePort(args);
const hostname = process.env.HOSTNAME || '0.0.0.0';
process.env.NODE_ENV = dev ? 'development' : 'production';

const nextEnvModule = await import('@next/env');
const nextModule = await import('next');
const jwtModule = await import('jsonwebtoken');
const wsModule = await import('ws');
const nextEnv = nextEnvModule.default ?? nextEnvModule;
const next = nextModule.default ?? nextModule;
const jwt = jwtModule.default ?? jwtModule;
const WebSocket = wsModule.WebSocket ?? wsModule.default;
const { WebSocketServer } = wsModule;

nextEnv.loadEnvConfig(process.cwd(), dev);

const app = next({
  dev,
  hostname,
  port,
  customServer: true,
  ...(dev ? { webpack: true } : {}),
});
const handle = app.getRequestHandler();
const matchSocketServer = new WebSocketServer({ noServer: true });
const eventClients = new Map();

const removeClient = (eventId, socket) => {
  const clients = eventClients.get(eventId);
  if (!clients) return;
  clients.delete(socket);
  if (clients.size === 0) {
    eventClients.delete(eventId);
  }
};

const addClient = (eventId, socket) => {
  const clients = eventClients.get(eventId) ?? new Set();
  clients.add(socket);
  eventClients.set(eventId, clients);
};

globalThis.__mvpMatchRealtimeBroadcast = (message) => {
  if (!message || typeof message !== 'object') return 0;
  const eventId = normalizeToken(message.eventId);
  if (!eventId) return 0;
  const clients = eventClients.get(eventId);
  if (!clients || clients.size === 0) return 0;

  const body = JSON.stringify(message);
  let sent = 0;
  for (const client of clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(body);
    sent += 1;
  }
  return sent;
};

matchSocketServer.on('connection', (socket, request, context) => {
  const eventId = context?.eventId;
  const userId = context?.userId;
  socket.isAlive = true;
  addClient(eventId, socket);

  socket.on('pong', () => {
    socket.isAlive = true;
  });
  socket.on('close', () => removeClient(eventId, socket));
  socket.on('error', () => removeClient(eventId, socket));
  socket.send(JSON.stringify({
    type: 'subscribed',
    eventId,
    userId,
    sentAt: new Date().toISOString(),
  }));
});

const heartbeat = setInterval(() => {
  for (const socket of matchSocketServer.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30_000);

heartbeat.unref?.();

await app.prepare();
const handleUpgrade = app.getUpgradeHandler();

const server = createServer((req, res) => {
  void handle(req, res);
});

server.on('upgrade', (req, socket, head) => {
  const parsedUrl = parseRequestUrl(req.url);
  if (parsedUrl.pathname !== MATCH_REALTIME_PATH) {
    void handleUpgrade(req, socket, head);
    return;
  }

  const eventId = normalizeToken(parsedUrl.searchParams.get('eventId'));
  const token = normalizeToken(parsedUrl.searchParams.get('token'));
  if (!eventId || !token) {
    sendUpgradeError(socket, 400, 'Bad Request');
    return;
  }

  const verified = verifyRealtimeToken(token, eventId);
  if (!verified) {
    sendUpgradeError(socket, 401, 'Unauthorized');
    return;
  }

  matchSocketServer.handleUpgrade(req, socket, head, (ws) => {
    matchSocketServer.emit('connection', ws, req, { eventId, userId: verified.userId });
  });
});

const shutdown = () => {
  clearInterval(heartbeat);
  delete globalThis.__mvpMatchRealtimeBroadcast;
  matchSocketServer.close();
  server.close(() => {
    void app.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5000).unref?.();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(port, hostname, () => {
  console.log(`[server] mode: ${dev ? 'development' : 'production'}`);
  console.log(`[server] ready on http://${hostname}:${port}`);
  console.log(`[server] match realtime websocket mounted at ${MATCH_REALTIME_PATH}`);
});
