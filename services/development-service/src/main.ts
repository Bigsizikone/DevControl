import { createPool, createServiceServer, dependencyStatus, readJson, sendJson, connectRedis, connectBroker, cacheAside, invalidatePrefix, eventEnvelope, type EventEnvelope } from '../../../packages/shared-kernel/src/runtime';

async function bootstrap() {
const pool = createPool(process.env.DEVELOPMENT_DATABASE_URL ?? process.env.DATABASE_URL);
const redis = await connectRedis();
const broker = await connectBroker();
const port = Number(process.env.PORT ?? 4003);

async function consumeIdentityProjection() {
  if (!pool || !broker) return;
  const queue = `development.identity-projection.${process.env.HOSTNAME ?? 'local'}`;
  await broker.channel.assertQueue(queue, { durable: true });
  for (const eventType of ['UserCreated', 'UserUpdated', 'UserDisabled']) await broker.channel.bindQueue(queue, process.env.EVENT_EXCHANGE ?? 'service-desk.events', eventType);
  await broker.channel.consume(queue, async (message) => {
    if (!message) return;
    try {
      const event = JSON.parse(message.content.toString()) as EventEnvelope;
      const processed = await pool.query('INSERT INTO processed_events (event_id,consumer) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING event_id',[event.eventId,'development-identity-projection']);
      if (processed.rowCount) await pool.query('INSERT INTO user_projection (user_id,full_name,email,department,active,source_updated_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id) DO UPDATE SET full_name=EXCLUDED.full_name,email=EXCLUDED.email,department=EXCLUDED.department,active=EXCLUDED.active,source_updated_at=EXCLUDED.source_updated_at,projected_at=now()', [event.payload.userId,event.payload.fullName,event.payload.email,event.payload.departmentId ?? null,event.payload.active,event.occurredAt]);
      broker.channel.ack(message);
    } catch { broker.channel.nack(message, false, true); }
  });
}
void consumeIdentityProjection();

function canWrite(role: string | null) { return role === 'admin' || role === 'analyst' || role === 'developer'; }

const server = createServiceServer({
  serviceName: 'development-service',
  port,
  readiness: () => dependencyStatus(pool, redis, broker?.connection ?? null),
  routes: {
    'GET /development/statuses': async (_request, response, _url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Development DB не настроена' }, context);
      const statuses = await cacheAside(redis, 'development:dictionary:statuses', Number(process.env.CACHE_DICTIONARY_TTL ?? 1800), async () => (await pool.query('SELECT code, name, sort_order, is_final FROM development_statuses WHERE is_active ORDER BY sort_order')).rows);
      return sendJson(response, 200, { statuses }, context);
    },
    'GET /development/tasks': async (_request, response, url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Development DB не настроена' }, context);
      const q = url.searchParams.get('q'); const status = url.searchParams.get('status');
      const tasks = await cacheAside(redis, `development:kanban:${q ?? ''}:${status ?? ''}`, Number(process.env.CACHE_KANBAN_TTL ?? 60), async () => (await pool.query('SELECT t.id,t.code,t.number,t.title,t.description,t.status,s.name AS status_name,t.service_desk_request_id,t.parent_task_id,t.root_task_id,t.analyst_id,analyst.full_name AS analyst_name,t.developer_id,developer.full_name AS developer_name,t.planned_hours,t.analytics_hours,t.development_hours,t.total_hours,t.priority,t.created_at,t.updated_at FROM development_tasks t JOIN development_statuses s ON s.code=t.status LEFT JOIN user_projection analyst ON analyst.user_id=t.analyst_id LEFT JOIN user_projection developer ON developer.user_id=t.developer_id WHERE ($1::text IS NULL OR t.title ILIKE $1 OR t.code ILIKE $1 OR t.service_desk_request_id::text ILIKE $1) AND ($2::text IS NULL OR t.status=$2) ORDER BY s.sort_order,t.updated_at DESC LIMIT 500', [q?.trim() ? `%${q.trim()}%` : null, status])).rows);
      return sendJson(response, 200, { tasks }, context);
    },
    'GET /development/tasks/:id': async (_request, response, url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Development DB не настроена' }, context);
      const id = url.pathname.split('/').pop();
      const task = (await pool.query('SELECT t.*,s.name AS status_name,analyst.full_name AS analyst_name,developer.full_name AS developer_name FROM development_tasks t JOIN development_statuses s ON s.code=t.status LEFT JOIN user_projection analyst ON analyst.user_id=t.analyst_id LEFT JOIN user_projection developer ON developer.user_id=t.developer_id WHERE t.id=$1', [id])).rows[0];
      if (!task) return sendJson(response, 404, { error: 'Карточка разработки не найдена' }, context);
      const subtasks = (await pool.query('SELECT id,code,number,title,status,planned_hours,total_hours FROM development_tasks WHERE parent_task_id=$1 ORDER BY number', [id])).rows;
      const comments = (await pool.query('SELECT id,author_id,comment,created_at,updated_at FROM development_task_comments WHERE task_id=$1 AND deleted_at IS NULL ORDER BY created_at', [id])).rows;
      return sendJson(response, 200, { task: { ...task, subtasks, comments } }, context);
    },
    'POST /development/tasks': async (request, response, _url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Development DB не настроена' }, context);
      if (!canWrite(context.role)) return sendJson(response, 403, { error: 'Недостаточно прав' }, context);
      const body = await readJson(request); const title = String(body.title ?? '').trim(); if (!title || !body.serviceDeskRequestId) return sendJson(response, 400, { error: 'Наименование и serviceDeskRequestId обязательны' }, context);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const task = (await client.query('INSERT INTO development_tasks (service_desk_request_id,board_id,system_id,title,description,created_by,root_task_id,status) VALUES ($1,$2,$3,$4,$5,$6,NULL,\'backlog\') RETURNING *', [body.serviceDeskRequestId, body.boardId ?? null, body.systemId ?? null, title, body.description ?? null, context.actorId])).rows[0];
        await client.query('UPDATE development_tasks SET root_task_id=id WHERE id=$1', [task.id]);
        const event = eventEnvelope('development-service', 'DevelopmentTaskCreated', { taskId: task.id, serviceDeskRequestId: task.service_desk_request_id }, context.correlationId);
        await client.query('INSERT INTO outbox_events (event_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,payload) VALUES ($1,$2,$3,$4,$5,$6,$7)', [event.eventId,event.eventType,event.eventVersion,'development_task',task.id,event.correlationId,event.payload]);
        await client.query('COMMIT'); await invalidatePrefix(redis, 'development:kanban:');
        return sendJson(response, 201, { task, eventId: event.eventId }, context);
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
    'PATCH /development/tasks/:id/status': async (request, response, url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Development DB не настроена' }, context);
      if (!canWrite(context.role)) return sendJson(response, 403, { error: 'Недостаточно прав' }, context);
      const body = await readJson(request); const id = url.pathname.split('/').pop(); const status = String(body.status ?? '');
      if (!status) return sendJson(response, 400, { error: 'Статус обязателен' }, context);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const current = (await client.query('SELECT id,status FROM development_tasks WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!current) { await client.query('ROLLBACK'); return sendJson(response, 404, { error: 'Карточка разработки не найдена' }, context); }
        if (!(await client.query('SELECT code FROM development_statuses WHERE code=$1 AND is_active', [status])).rows[0]) { await client.query('ROLLBACK'); return sendJson(response, 400, { error: 'Неизвестный статус' }, context); }
        const task = (await client.query('UPDATE development_tasks SET status=$2,updated_at=now() WHERE id=$1 RETURNING *', [id,status])).rows[0];
        const event = eventEnvelope('development-service', 'DevelopmentTaskStatusChanged', { taskId: id, from: current.status, to: status }, context.correlationId);
        await client.query('INSERT INTO outbox_events (event_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,payload) VALUES ($1,$2,$3,$4,$5,$6,$7)', [event.eventId,event.eventType,event.eventVersion,'development_task',id,event.correlationId,event.payload]);
        await client.query('COMMIT'); await invalidatePrefix(redis, 'development:kanban:');
        return sendJson(response, 200, { task, eventId: event.eventId }, context);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  },
});

const shutdown = async () => { server.close(); await pool?.end(); await broker?.connection.close(); redis?.disconnect(); process.exit(0); };
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
}
void bootstrap();
