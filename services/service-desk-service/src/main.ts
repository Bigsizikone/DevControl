import { createPool, createServiceServer, dependencyStatus, readJson, sendJson, connectRedis, connectBroker, cacheAside, invalidatePrefix, eventEnvelope } from '../../../packages/shared-kernel/src/runtime';

async function bootstrap() {
const pool = createPool(process.env.SERVICE_DESK_DATABASE_URL ?? process.env.DATABASE_URL);
const redis = await connectRedis();
const broker = await connectBroker();
const port = Number(process.env.PORT ?? 4002);

async function writeOutbox(client: any, event: ReturnType<typeof eventEnvelope>, aggregateType: string, aggregateId: string) {
  await client.query('INSERT INTO outbox_events (event_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,payload) VALUES ($1,$2,$3,$4,$5,$6,$7)', [event.eventId, event.eventType, event.eventVersion, aggregateType, aggregateId, event.correlationId, event.payload]);
}

const server = createServiceServer({
  serviceName: 'service-desk-service',
  port,
  readiness: () => dependencyStatus(pool, redis, broker?.connection ?? null),
  routes: {
    'GET /tickets': async (_request, response, url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Service Desk DB не настроена' }, context);
      const q = url.searchParams.get('q');
      const tickets = await cacheAside(redis, `servicedesk:tickets:${q ?? 'all'}`, Number(process.env.CACHE_TICKET_TTL ?? 60), async () => (await pool.query('SELECT id, number, subject, description, status, priority, created_by, assignee_id, development_required, created_at, updated_at FROM tickets WHERE ($1::text IS NULL OR subject ILIKE $1 OR number::text ILIKE $1) ORDER BY created_at DESC LIMIT 100', [q?.trim() ? `%${q.trim()}%` : null])).rows);
      return sendJson(response, 200, { tickets }, context);
    },
    'GET /tickets/:id': async (_request, response, url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Service Desk DB не настроена' }, context);
      const id = url.pathname.split('/').pop();
      const ticket = (await pool.query('SELECT id, number, subject, description, status, priority, created_by, assignee_id, development_required, created_at, updated_at FROM tickets WHERE id = $1', [id])).rows[0];
      if (!ticket) return sendJson(response, 404, { error: 'Обращение не найдено' }, context);
      const comments = (await pool.query('SELECT id, author_id, body, is_internal, created_at FROM ticket_comments WHERE ticket_id = $1 ORDER BY created_at', [id])).rows;
      return sendJson(response, 200, { ticket: { ...ticket, comments } }, context);
    },
    'POST /tickets': async (request, response, _url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Service Desk DB не настроена' }, context);
      const body = await readJson(request);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ticket = (await client.query('INSERT INTO tickets (subject,description,created_by,priority,development_required) VALUES ($1,$2,$3,$4,$5) RETURNING id,number,subject,description,status,created_by,created_at', [String(body.subject ?? '').trim(), body.description ?? null, body.createdBy ?? context.actorId, Number(body.priority ?? 3), Boolean(body.developmentRequired)])).rows[0];
        if (!ticket?.subject || !ticket.created_by) throw new Error('Тема и пользователь обязательны');
        const event = eventEnvelope('service-desk-service', 'TicketCreated', { ticketId: ticket.id, number: ticket.number, subject: ticket.subject }, context.correlationId);
        await writeOutbox(client, event, 'ticket', ticket.id);
        await client.query('COMMIT');
        await invalidatePrefix(redis, 'servicedesk:tickets:');
        return sendJson(response, 201, { ticket, eventId: event.eventId }, context);
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
    'POST /tickets/:id/comments': async (request, response, url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Service Desk DB не настроена' }, context);
      const body = await readJson(request); const id = url.pathname.split('/').pop();
      const result = await pool.query('INSERT INTO ticket_comments (ticket_id,author_id,body,is_internal) VALUES ($1,$2,$3,$4) RETURNING id,body,author_id,created_at', [id, body.authorId ?? context.actorId, String(body.body ?? '').trim(), Boolean(body.isInternal)]);
      return sendJson(response, 201, { comment: result.rows[0] }, context);
    },
  },
});

const shutdown = async () => { server.close(); await pool?.end(); await broker?.connection.close(); redis?.disconnect(); process.exit(0); };
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
}
void bootstrap();
