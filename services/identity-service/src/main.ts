import { createPool, createServiceServer, dependencyStatus, readJson, sendJson, connectRedis, cacheAside, eventEnvelope, invalidate } from '../../../packages/shared-kernel/src/runtime';

async function bootstrap() {
const pool = createPool(process.env.IDENTITY_DATABASE_URL ?? process.env.DATABASE_URL);
const redis = await connectRedis();
const port = Number(process.env.PORT ?? 4001);

const server = createServiceServer({
  serviceName: 'identity-service',
  port,
  readiness: () => dependencyStatus(pool, redis, null),
  routes: {
    'GET /internal/users/:id': async (_request, response, url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Identity DB не настроена' }, context);
      const id = url.pathname.split('/').pop();
      const user = await cacheAside(redis, `identity:user:${id}`, Number(process.env.CACHE_USER_TTL ?? 600), async () => (await pool.query('SELECT id, external_id, email, display_name, department_id, is_active, updated_at FROM users WHERE id = $1', [id])).rows[0] ?? null);
      if (!user) return sendJson(response, 404, { error: 'Пользователь не найден' }, context);
      return sendJson(response, 200, { user }, context);
    },
    'GET /users': async (_request, response, url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Identity DB не настроена' }, context);
      const q = url.searchParams.get('q');
      const result = await pool.query('SELECT id, external_id, email, display_name, department_id, is_active FROM users WHERE is_active = true AND ($1::text IS NULL OR display_name ILIKE $1 OR email ILIKE $1) ORDER BY display_name LIMIT 50', [q?.trim() ? `%${q.trim()}%` : null]);
      return sendJson(response, 200, { users: result.rows }, context);
    },
    'POST /users': async (request, response, _url, context) => {
      if (context.role !== 'admin') return sendJson(response, 403, { error: 'Требуется роль администратора' }, context);
      if (!pool) return sendJson(response, 503, { error: 'Identity DB не настроена' }, context);
      const body = await readJson(request); const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const user = (await client.query('INSERT INTO users (external_id,email,display_name,department_id) VALUES ($1,$2,$3,$4) RETURNING id,external_id,email,display_name,department_id,is_active,created_at,updated_at', [body.externalId ?? null,body.email,body.displayName,body.departmentId ?? null])).rows[0];
        const event = eventEnvelope('identity-service','UserCreated',{userId:user.id,fullName:user.display_name,email:user.email,departmentId:user.department_id,active:user.is_active},context.correlationId);
        await client.query('INSERT INTO outbox_events (event_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,payload) VALUES ($1,$2,$3,$4,$5,$6,$7)', [event.eventId,event.eventType,event.eventVersion,'user',user.id,event.correlationId,event.payload]);
        await client.query('COMMIT'); await invalidate(redis,`identity:user:${user.id}`); return sendJson(response,201,{user,eventId:event.eventId},context);
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
    'PATCH /users/:id': async (request, response, url, context) => {
      if (context.role !== 'admin') return sendJson(response, 403, { error: 'Требуется роль администратора' }, context);
      if (!pool) return sendJson(response, 503, { error: 'Identity DB не настроена' }, context);
      const body=await readJson(request); const id=url.pathname.split('/').pop(); const user=(await pool.query('UPDATE users SET email=COALESCE($2,email),display_name=COALESCE($3,display_name),department_id=COALESCE($4,department_id),is_active=COALESCE($5,is_active),updated_at=now() WHERE id=$1 RETURNING id,external_id,email,display_name,department_id,is_active,updated_at',[id,body.email,body.displayName,body.departmentId,body.isActive])).rows[0];
      if (!user) return sendJson(response,404,{error:'Пользователь не найден'},context);
      const event=eventEnvelope('identity-service',user.is_active?'UserUpdated':'UserDisabled',{userId:user.id,fullName:user.display_name,email:user.email,departmentId:user.department_id,active:user.is_active},context.correlationId);
      await pool.query('INSERT INTO outbox_events (event_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,payload) VALUES ($1,$2,$3,$4,$5,$6,$7)',[event.eventId,event.eventType,event.eventVersion,'user',user.id,event.correlationId,event.payload]);
      await invalidate(redis,`identity:user:${id}`); return sendJson(response,200,{user,eventId:event.eventId},context);
    },
    'POST /sync': async (request, response, _url, context) => {
      if (context.role !== 'admin') return sendJson(response, 403, { error: 'Требуется роль администратора' }, context);
      const body = await readJson(request);
      return sendJson(response, 202, { status: 'accepted', source: body.source ?? 'active-directory', correlationId: context.correlationId }, context);
    },
  },
});

const shutdown = async () => { server.close(); await pool?.end(); redis?.disconnect(); process.exit(0); };
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
}
void bootstrap();
