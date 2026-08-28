import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Pool } from 'pg';
import Redis from 'ioredis';
import amqp, { type Channel, type ChannelModel } from 'amqplib';

export type EventEnvelope<T extends Record<string, unknown> = Record<string, unknown>> = {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  producer: string;
  correlationId: string;
  payload: T;
};

export type ServiceRoute = (request: IncomingMessage, response: ServerResponse, url: URL, context: RequestContext) => Promise<void>;

export type RequestContext = {
  requestId: string;
  correlationId: string;
  actorId: string | null;
  role: string | null;
};

export function createRequestContext(request: IncomingMessage): RequestContext {
  return {
    requestId: String(request.headers['x-request-id'] ?? randomUUID()),
    correlationId: String(request.headers['x-correlation-id'] ?? randomUUID()),
    actorId: request.headers['x-user-id'] ? String(request.headers['x-user-id']) : null,
    role: request.headers['x-role'] ? String(request.headers['x-role']) : null,
  };
}

export function sendJson(response: ServerResponse, status: number, body: unknown, context?: RequestContext) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  if (context) {
    response.setHeader('x-request-id', context.requestId);
    response.setHeader('x-correlation-id', context.correlationId);
  }
  response.end(JSON.stringify(body));
}

export async function readJson<T extends Record<string, unknown> = Record<string, unknown>>(request: IncomingMessage, maxBytes = 5 * 1024 * 1024): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error('request entity too large');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {} as T;
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

export function createServiceServer(options: {
  serviceName: string;
  port: number;
  routes: Record<string, ServiceRoute>;
  readiness?: () => Promise<Record<string, string>>;
}) {
  const server = createServer(async (request, response) => {
    const context = createRequestContext(request);
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    try {
      response.setHeader('x-request-id', context.requestId);
      response.setHeader('x-correlation-id', context.correlationId);
      if (url.pathname === '/health/live') return sendJson(response, 200, { status: 'ok', service: options.serviceName }, context);
      if (url.pathname === '/health/ready') {
        const dependencies = options.readiness ? await options.readiness() : {};
        const ready = Object.values(dependencies).every((value) => value === 'up' || value === 'disabled');
        return sendJson(response, ready ? 200 : 503, { status: ready ? 'ok' : 'degraded', service: options.serviceName, dependencies }, context);
      }
      if (url.pathname === '/metrics') {
        response.statusCode = 200;
        response.setHeader('content-type', 'text/plain; version=0.0.4');
        response.end(`process_uptime_seconds ${process.uptime()}\nprocess_resident_memory_bytes ${process.memoryUsage().rss}\n`);
        return;
      }
      const exactRoute = options.routes[`${request.method ?? 'GET'} ${url.pathname}`];
      const route = exactRoute ?? Object.entries(options.routes).find(([key]) => {
        const [method, pattern] = key.split(' ');
        const expected = pattern.split('/').filter(Boolean);
        const actual = url.pathname.split('/').filter(Boolean);
        return method === (request.method ?? 'GET') && expected.length === actual.length && expected.every((segment, index) => segment.startsWith(':') || segment === actual[index]);
      })?.[1];
      if (!route) return sendJson(response, 404, { error: 'Маршрут не найден' }, context);
      await route(request, response, url, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Внутренняя ошибка сервиса';
      const status = message === 'request entity too large' ? 413 : 500;
      console.error(JSON.stringify({ level: 'error', service: options.serviceName, requestId: context.requestId, correlationId: context.correlationId, error: message }));
      if (!response.headersSent) sendJson(response, status, { error: message }, context);
      else response.end();
    }
  });
  server.listen(options.port, '0.0.0.0', () => console.log(JSON.stringify({ level: 'info', service: options.serviceName, port: options.port })));
  return server;
}

export function createPool(connectionString: string | undefined) {
  return connectionString ? new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 10), connectionTimeoutMillis: 5000 }) : null;
}

export async function dependencyStatus(pool: Pool | null, redis: Redis | null, broker: ChannelModel | null) {
  const result: Record<string, string> = {};
  if (!pool) result.database = 'disabled';
  else { try { await pool.query('SELECT 1'); result.database = 'up'; } catch { result.database = 'down'; } }
  if (!redis) result.redis = 'disabled';
  else { try { await redis.ping(); result.redis = 'up'; } catch { result.redis = 'down'; } }
  result.broker = broker ? 'up' : 'disabled';
  return result;
}

export async function connectRedis(url = process.env.REDIS_URL) {
  if (!url) return null;
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  try { await redis.connect(); return redis; } catch { redis.disconnect(); return null; }
}

export async function connectBroker(url = process.env.RABBITMQ_URL): Promise<{ connection: ChannelModel; channel: Channel } | null> {
  if (!url) return null;
  try {
    const connection = await amqp.connect(url);
    const channel = await connection.createChannel();
    await channel.assertExchange(process.env.EVENT_EXCHANGE ?? 'service-desk.events', 'topic', { durable: true });
    return { connection, channel };
  } catch { return null; }
}

export function eventEnvelope<T extends Record<string, unknown>>(producer: string, eventType: string, payload: T, correlationId: string): EventEnvelope<T> {
  return { eventId: randomUUID(), eventType, eventVersion: 1, occurredAt: new Date().toISOString(), producer, correlationId, payload };
}

export async function publishEvent(channel: Channel | null, event: EventEnvelope) {
  if (!channel) return false;
  return channel.publish(process.env.EVENT_EXCHANGE ?? 'service-desk.events', event.eventType, Buffer.from(JSON.stringify(event)), { persistent: true, contentType: 'application/json', messageId: event.eventId, headers: { 'x-correlation-id': event.correlationId } });
}

export async function cacheAside<T>(redis: Redis | null, key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  if (redis) {
    try { const cached = await redis.get(key); if (cached) return JSON.parse(cached) as T; } catch { /* DB remains source of truth. */ }
  }
  const value = await loader();
  if (redis) { try { await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds); } catch { /* cache is optional */ } }
  return value;
}

export async function invalidate(redis: Redis | null, ...keys: string[]) {
  if (redis && keys.length) { try { await redis.del(...keys); } catch { /* cache is optional */ } }
}

export async function invalidatePrefix(redis: Redis | null, prefix: string) {
  if (!redis) return;
  try { const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); } catch { /* cache is optional */ }
}
