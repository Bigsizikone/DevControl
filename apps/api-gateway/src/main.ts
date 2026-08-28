import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

type Target = { baseUrl: string; pathPrefix: string };
const serviceTargets: Array<{ prefix: string; target: Target }> = [
  { prefix: '/api/v1/identity', target: { baseUrl: process.env.IDENTITY_SERVICE_URL ?? 'http://identity-service:4001', pathPrefix: '' } },
  { prefix: '/api/v1/tickets', target: { baseUrl: process.env.SERVICE_DESK_SERVICE_URL ?? 'http://service-desk-service:4002', pathPrefix: '/tickets' } },
  { prefix: '/api/v1/development', target: { baseUrl: process.env.DEVELOPMENT_SERVICE_URL ?? 'http://development-service:4003', pathPrefix: '/development' } },
  { prefix: '/api/v1/cameras', target: { baseUrl: process.env.CAMERA_SERVICE_URL ?? 'http://camera-service:4004', pathPrefix: '/cameras' } },
  { prefix: '/api/v1/analytics', target: { baseUrl: process.env.ANALYTICS_SERVICE_URL ?? 'http://analytics-service:4005', pathPrefix: '/analytics' } },
];
const metrics = new Map<string, number>();
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const maxBodyBytes = Number(process.env.GATEWAY_MAX_BODY_BYTES ?? 50 * 1024 * 1024);

function increment(key: string) { metrics.set(key, (metrics.get(key) ?? 0) + 1); }

function json(response: ServerResponse, status: number, body: unknown, requestId: string, correlationId: string) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('x-request-id', requestId);
  response.setHeader('x-correlation-id', correlationId);
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage) {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > maxBodyBytes) throw new Error('request entity too large');
    parts.push(part);
  }
  return parts.length ? Buffer.concat(parts) : undefined;
}

function targetFor(pathname: string): { target: Target; suffix: string } | null {
  const match = serviceTargets.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));
  if (!match) return null;
  return { target: match.target, suffix: pathname.slice(match.prefix.length) || '/' };
}

function isPrivilegedRoute(pathname: string) { return /^\/api\/v1\/analytics\/cube\/(rebuild|refresh)$/.test(pathname); }
function isAuthenticated(request: IncomingMessage) {
  if (process.env.GATEWAY_REQUIRE_AUTH !== 'true') return true;
  const token = process.env.GATEWAY_DEV_TOKEN;
  return Boolean(token && request.headers.authorization === `Bearer ${token}`);
}

async function proxy(request: IncomingMessage, response: ServerResponse, url: URL, target: Target, suffix: string, requestId: string, correlationId: string) {
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request);
  const upstreamUrl = new URL(`${target.pathPrefix}${suffix}${url.search}`, target.baseUrl);
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (value && !['host', 'connection', 'content-length'].includes(key)) headers[key] = Array.isArray(value) ? value.join(',') : value;
  }
  headers['x-request-id'] = requestId;
  headers['x-correlation-id'] = correlationId;
  headers['x-gateway'] = 'api-gateway';
  const upstream = await fetch(upstreamUrl, { method: request.method, headers, body, signal: AbortSignal.timeout(Number(process.env.GATEWAY_TIMEOUT_MS ?? 15000)) });
  response.statusCode = upstream.status;
  response.setHeader('x-request-id', requestId);
  response.setHeader('x-correlation-id', correlationId);
  const contentType = upstream.headers.get('content-type'); if (contentType) response.setHeader('content-type', contentType);
  const data = Buffer.from(await upstream.arrayBuffer());
  response.end(data);
  increment(`http_requests_total{route="${target.baseUrl}" ,status="${upstream.status}"}`);
}

const server = createServer(async (request, response) => {
  const requestId = String(request.headers['x-request-id'] ?? randomUUID());
  const correlationId = String(request.headers['x-correlation-id'] ?? randomUUID());
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  try {
    if (url.pathname === '/health/live') return json(response, 200, { status: 'ok', service: 'api-gateway' }, requestId, correlationId);
    if (url.pathname === '/health/ready') return json(response, 200, { status: 'ok', service: 'api-gateway', dependencies: { routing: 'up' } }, requestId, correlationId);
    if (url.pathname === '/metrics') {
      const lines = [...metrics.entries()].map(([key, value]) => `${key} ${value}`);
      response.statusCode = 200;
      response.setHeader('content-type', 'text/plain; version=0.0.4');
      response.setHeader('x-request-id', requestId);
      response.setHeader('x-correlation-id', correlationId);
      response.end(`${lines.join('\n')}\n`);
      return;
    }
    const remote = request.socket.remoteAddress ?? 'unknown';
    const now = Date.now(); const windowMs = 60_000; const limit = Number(process.env.GATEWAY_RATE_LIMIT ?? 600);
    const bucket = rateLimit.get(remote); if (!bucket || bucket.resetAt <= now) rateLimit.set(remote, { count: 1, resetAt: now + windowMs }); else if (++bucket.count > limit) return json(response, 429, { error: 'Слишком много запросов' }, requestId, correlationId);
    const routed = targetFor(url.pathname);
    if (routed) {
      if (!isAuthenticated(request)) return json(response, 401, { error: 'Требуется access token' }, requestId, correlationId);
      if (isPrivilegedRoute(url.pathname) && request.headers['x-role'] !== 'admin' && !request.headers.authorization) return json(response, 403, { error: 'Требуется роль администратора' }, requestId, correlationId);
      return await proxy(request, response, url, routed.target, routed.suffix, requestId, correlationId);
    }
    if (url.pathname.startsWith('/api/')) {
      const legacy = new URL(url.pathname.slice(4) + url.search, process.env.LEGACY_MONOLITH_URL ?? 'http://service-desk-legacy:3000');
      return await proxy(request, response, legacy, { baseUrl: legacy.origin, pathPrefix: '' }, `${legacy.pathname}`, requestId, correlationId);
    }
    return json(response, 404, { error: 'Маршрут gateway не найден' }, requestId, correlationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка gateway';
    increment('service_errors_total{service="api-gateway"}');
    return json(response, message === 'request entity too large' ? 413 : 502, { error: message }, requestId, correlationId);
  }
});

server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => console.log(JSON.stringify({ level: 'info', service: 'api-gateway', port: process.env.PORT ?? 3000 })));
