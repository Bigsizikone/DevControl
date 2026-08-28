import { createPool, createServiceServer, dependencyStatus, readJson, sendJson, connectRedis, cacheAside, invalidate } from '../../../packages/shared-kernel/src/runtime';

async function bootstrap() {
const pool = createPool(process.env.CAMERA_DATABASE_URL ?? process.env.DATABASE_URL);
const redis = await connectRedis();
const port = Number(process.env.PORT ?? 4004);
const canManage = (role: string | null) => role === 'admin' || role === 'senior_operator';

const server = createServiceServer({
  serviceName: 'camera-service',
  port,
  readiness: () => dependencyStatus(pool, redis, null),
  routes: {
    'GET /cameras/schedule': async (_request, response, url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Camera DB не настроена' }, context);
      const date = url.searchParams.get('date');
      const shifts = await cacheAside(redis, `camera:schedule:${date ?? 'all'}`, Number(process.env.CACHE_CAMERA_TTL ?? 300), async () => (await pool.query('SELECT id,operator_id,work_date,start_time,end_time,status,camera_object_id,comment FROM camera_work_shifts WHERE ($1::date IS NULL OR work_date=$1) ORDER BY work_date,start_time', [date])).rows);
      return sendJson(response, 200, { shifts }, context);
    },
    'GET /cameras/violations': async (_request, response, url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Camera DB не настроена' }, context);
      const result = await pool.query('SELECT id,event_datetime,author_id,camera_object_id,status,severity,comment,created_at FROM camera_violations ORDER BY event_datetime DESC LIMIT 100');
      return sendJson(response, 200, { violations: result.rows }, context);
    },
    'POST /cameras/schedule': async (request, response, _url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Camera DB не настроена' }, context);
      if (!canManage(context.role)) return sendJson(response, 403, { error: 'Недостаточно прав' }, context);
      const body = await readJson(request); const result = await pool.query('INSERT INTO camera_work_shifts (operator_id,work_date,start_time,end_time,status,camera_object_id,comment) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [body.operatorId,body.workDate,body.startTime,body.endTime,body.status ?? 'planned',body.cameraObjectId ?? null,body.comment ?? null]);
      await invalidate(redis, `camera:schedule:${body.workDate}`);
      return sendJson(response, 201, { shift: result.rows[0] }, context);
    },
    'POST /cameras/violations': async (request, response, _url, context) => {
      if (!pool) return sendJson(response, 503, { error: 'Camera DB не настроена' }, context);
      if (!context.actorId) return sendJson(response, 401, { error: 'Требуется аутентификация' }, context);
      const body = await readJson(request); const result = await pool.query('INSERT INTO camera_violations (event_datetime,author_id,camera_object_id,status,severity,comment) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [body.eventDatetime,context.actorId,body.cameraObjectId ?? null,body.status ?? 'new',body.severity ?? null,body.comment ?? null]);
      return sendJson(response, 201, { violation: result.rows[0] }, context);
    },
  },
});

const shutdown = async () => { server.close(); await pool?.end(); redis?.disconnect(); process.exit(0); };
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
}
void bootstrap();
