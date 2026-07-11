#!/usr/bin/env node

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const MATCH_REALTIME_PATH = '/api/realtime/matches';
const MATCH_REALTIME_SCOPE = 'event-match-updates';
const BROADCAST_OVERLAY_REALTIME_PATH = '/api/realtime/broadcast-overlays';
const BROADCAST_OVERLAY_SOCKET_SCOPE = 'broadcast-overlay-read';
const BROADCAST_OVERLAY_SOCKET_ISSUER = 'bracket-iq';
const BROADCAST_OVERLAY_SOCKET_AUDIENCE = 'bracket-iq-broadcast-overlay';
const BROADCAST_OVERLAY_SOCKET_TOKEN_TYPE = 'broadcast_overlay_stream';

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

const verifyBroadcastOverlaySocketTicket = (token) => {
  try {
    const decoded = jwt.verify(token, getAuthSecret(), {
      algorithms: ['HS256'],
      issuer: BROADCAST_OVERLAY_SOCKET_ISSUER,
      audience: BROADCAST_OVERLAY_SOCKET_AUDIENCE,
    });
    if (!decoded || typeof decoded !== 'object') return null;
    if (decoded.tokenType !== BROADCAST_OVERLAY_SOCKET_TOKEN_TYPE) return null;
    if (decoded.scope !== BROADCAST_OVERLAY_SOCKET_SCOPE) return null;
    const overlayId = normalizeToken(decoded.overlayId);
    const accessTokenId = normalizeToken(decoded.accessTokenId);
    return overlayId && accessTokenId ? { overlayId, accessTokenId } : null;
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

const serverInstanceId = normalizeToken(process.env.MVP_REALTIME_ORIGIN_ID) || randomUUID();
process.env.MVP_REALTIME_ORIGIN_ID = serverInstanceId;
globalThis.__mvpMatchRealtimeOriginId = serverInstanceId;

const redisUrl = process.env.REDIS_DISABLED === 'true'
  ? null
  : normalizeToken(process.env.REDIS_URL);
const redisKeyPrefix = normalizeToken(process.env.REDIS_KEY_PREFIX) || 'bracketiq';
const MATCH_REALTIME_REDIS_CHANNEL = `${redisKeyPrefix}:realtime:matches`;
const BROADCAST_OVERLAY_REALTIME_REDIS_CHANNEL = `${redisKeyPrefix}:realtime:broadcast-overlays`;

const app = next({
  dev,
  hostname,
  port,
  customServer: true,
  ...(dev ? { webpack: true } : {}),
});
const handle = app.getRequestHandler();
const matchSocketServer = new WebSocketServer({ noServer: true });
const broadcastOverlaySocketServer = new WebSocketServer({ noServer: true });
const eventClients = new Map();
const overlayClients = new Map();
const overlayTokenClients = new Map();
let redisRealtimeSubscriber = null;
let redisRealtimeReconnectTimer = null;
let isShuttingDown = false;

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

const removeOverlayClient = (overlayId, accessTokenId, socket) => {
  const clients = overlayClients.get(overlayId);
  if (clients) {
    clients.delete(socket);
    if (clients.size === 0) overlayClients.delete(overlayId);
  }
  const tokenClients = overlayTokenClients.get(accessTokenId);
  if (tokenClients) {
    tokenClients.delete(socket);
    if (tokenClients.size === 0) overlayTokenClients.delete(accessTokenId);
  }
};

const addOverlayClient = (overlayId, accessTokenId, socket) => {
  const clients = overlayClients.get(overlayId) ?? new Set();
  clients.add(socket);
  overlayClients.set(overlayId, clients);
  const tokenClients = overlayTokenClients.get(accessTokenId) ?? new Set();
  tokenClients.add(socket);
  overlayTokenClients.set(accessTokenId, tokenClients);
};

const closeOverlayTokenClients = (accessTokenId) => {
  const clients = overlayTokenClients.get(accessTokenId);
  if (!clients) return;
  for (const client of clients) {
    try {
      client.close(4001, 'Capability revoked');
    } catch {
      client.terminate();
    }
  }
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

const isBroadcastOverlayRealtimeMessage = (value) => {
  if (!value || typeof value !== 'object') return false;
  const overlayId = normalizeToken(value.overlayId);
  if (!overlayId) return false;
  if (value.type === 'overlay.revoked') {
    return Boolean(normalizeToken(value.accessTokenId));
  }
  if (value.type === 'overlay.subscribed') {
    return Number.isInteger(value.revision) && value.revision >= 0;
  }
  if (value.type !== 'overlay.state') return false;
  if (!Number.isInteger(value.revision) || value.revision < 0) return false;
  if (!value.state || typeof value.state !== 'object' || value.state.revision !== value.revision) return false;
  if (!value.event || typeof value.event !== 'object' || typeof value.event.type !== 'string' || typeof value.event.animate !== 'boolean') return false;
  return true;
};

globalThis.__mvpBroadcastOverlayRealtimeBroadcast = (message) => {
  if (!isBroadcastOverlayRealtimeMessage(message)) return 0;
  const overlayId = normalizeToken(message.overlayId);
  if (!overlayId) return 0;
  // Revocation is intentionally delivered only to the sockets authenticated
  // with the revoked capability. Other capability holders for the same
  // overlay remain live and never learn another token-row identifier.
  const clients = message.type === 'overlay.revoked'
    ? overlayTokenClients.get(message.accessTokenId)
    : overlayClients.get(overlayId);
  let sent = 0;
  const body = JSON.stringify(message);
  if (clients) {
    for (const client of clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      client.send(body);
      sent += 1;
    }
  }
  if (message.type === 'overlay.revoked') {
    closeOverlayTokenClients(message.accessTokenId);
  }
  return sent;
};

const normalizeMatchRealtimeMessage = (value) => {
  if (!value || typeof value !== 'object') return null;
  const eventId = normalizeToken(value.eventId);
  if (value.type !== 'match.changed' || !eventId) return null;

  return {
    type: 'match.changed',
    eventId,
    matches: Array.isArray(value.matches) ? value.matches : [],
    deleted: Array.from(
      new Set((Array.isArray(value.deleted) ? value.deleted : [])
        .map((id) => normalizeToken(id))
        .filter(Boolean)),
    ),
    sentAt: normalizeToken(value.sentAt) || new Date().toISOString(),
  };
};

const parseMatchRealtimeRedisEnvelope = (payload) => {
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object') return null;
    const originId = normalizeToken(parsed.originId);
    const message = normalizeMatchRealtimeMessage(parsed.message);
    if (!originId || !message) return null;
    return { originId, message };
  } catch {
    return null;
  }
};

const parseBroadcastOverlayRealtimeRedisEnvelope = (payload) => {
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object') return null;
    const originId = normalizeToken(parsed.originId);
    if (parsed.version !== 1 || !originId || !isBroadcastOverlayRealtimeMessage(parsed.message)) return null;
    return { originId, message: parsed.message };
  } catch {
    return null;
  }
};

const scheduleRedisRealtimeReconnect = () => {
  if (isShuttingDown || !redisUrl || redisRealtimeReconnectTimer) {
    return;
  }

  redisRealtimeReconnectTimer = setTimeout(() => {
    redisRealtimeReconnectTimer = null;
    void startRedisRealtimeSubscriber();
  }, 5_000);
  redisRealtimeReconnectTimer.unref?.();
};

const startRedisRealtimeSubscriber = async () => {
  if (!redisUrl || isShuttingDown || redisRealtimeSubscriber?.isOpen) {
    return;
  }

  try {
    const redisModule = await import('redis');
    const client = redisModule.createClient({ url: redisUrl });

    client.on('error', (error) => {
      console.error('[server] match realtime Redis subscriber error', error);
    });

    client.on('end', () => {
      if (redisRealtimeSubscriber === client) {
        redisRealtimeSubscriber = null;
      }
      scheduleRedisRealtimeReconnect();
    });

    await client.connect();
    await client.subscribe(MATCH_REALTIME_REDIS_CHANNEL, (payload) => {
      const envelope = parseMatchRealtimeRedisEnvelope(payload);
      if (!envelope || envelope.originId === serverInstanceId) {
        return;
      }
      globalThis.__mvpMatchRealtimeBroadcast?.(envelope.message);
    });

    await client.subscribe(BROADCAST_OVERLAY_REALTIME_REDIS_CHANNEL, (payload) => {
      const envelope = parseBroadcastOverlayRealtimeRedisEnvelope(payload);
      if (!envelope || envelope.originId === serverInstanceId) {
        return;
      }
      globalThis.__mvpBroadcastOverlayRealtimeBroadcast?.(envelope.message);
    });

    redisRealtimeSubscriber = client;
    console.log(`[server] match realtime Redis subscriber listening on ${MATCH_REALTIME_REDIS_CHANNEL}`);
    console.log(`[server] broadcast overlay Redis subscriber listening on ${BROADCAST_OVERLAY_REALTIME_REDIS_CHANNEL}`);
  } catch (error) {
    console.error('[server] failed to start match realtime Redis subscriber', error);
    redisRealtimeSubscriber = null;
    scheduleRedisRealtimeReconnect();
  }
};

void startRedisRealtimeSubscriber();

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

broadcastOverlaySocketServer.on('connection', (socket, request, context) => {
  const overlayId = context?.overlayId;
  const accessTokenId = context?.accessTokenId;
  socket.isAlive = true;
  addOverlayClient(overlayId, accessTokenId, socket);

  socket.on('pong', () => {
    socket.isAlive = true;
  });
  socket.on('close', () => removeOverlayClient(overlayId, accessTokenId, socket));
  socket.on('error', () => removeOverlayClient(overlayId, accessTokenId, socket));
  socket.send(JSON.stringify({
    type: 'overlay.subscribed',
    overlayId,
    revision: 0,
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
  for (const socket of broadcastOverlaySocketServer.clients) {
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
  if (parsedUrl.pathname === BROADCAST_OVERLAY_REALTIME_PATH) {
    const ticket = normalizeToken(parsedUrl.searchParams.get('ticket'));
    if (!ticket) {
      sendUpgradeError(socket, 400, 'Bad Request');
      return;
    }
    const verified = verifyBroadcastOverlaySocketTicket(ticket);
    if (!verified) {
      sendUpgradeError(socket, 401, 'Unauthorized');
      return;
    }
    broadcastOverlaySocketServer.handleUpgrade(req, socket, head, (ws) => {
      broadcastOverlaySocketServer.emit('connection', ws, req, verified);
    });
    return;
  }
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

const closeRedisRealtimeSubscriber = async () => {
  const client = redisRealtimeSubscriber;
  redisRealtimeSubscriber = null;
  if (!client) {
    return;
  }

  try {
    if (client.isOpen) {
      await client.quit();
    } else {
      client.destroy();
    }
  } catch {
    client.destroy();
  }
};

const shutdown = () => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  clearInterval(heartbeat);
  if (redisRealtimeReconnectTimer) {
    clearTimeout(redisRealtimeReconnectTimer);
    redisRealtimeReconnectTimer = null;
  }
  delete globalThis.__mvpMatchRealtimeBroadcast;
  delete globalThis.__mvpMatchRealtimeOriginId;
  delete globalThis.__mvpBroadcastOverlayRealtimeBroadcast;
  delete globalThis.__mvpBroadcastOverlayRealtimeOriginId;
  matchSocketServer.close();
  broadcastOverlaySocketServer.close();
  const redisClosePromise = closeRedisRealtimeSubscriber();
  server.close(() => {
    void redisClosePromise
      .finally(() => app.close())
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5000).unref?.();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(port, hostname, () => {
  console.log(`[server] mode: ${dev ? 'development' : 'production'}`);
  console.log(`[server] ready on http://${hostname}:${port}`);
  console.log(`[server] match realtime websocket mounted at ${MATCH_REALTIME_PATH}`);
  console.log(`[server] broadcast overlay websocket mounted at ${BROADCAST_OVERLAY_REALTIME_PATH}`);
});
