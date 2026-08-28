import { createPool, createServiceServer, dependencyStatus, sendJson, connectRedis, connectBroker, cacheAside, type EventEnvelope } from '../../../packages/shared-kernel/src/runtime';

async function bootstrap() {
const pool = createPool(process.env.ANALYTICS_DATABASE_URL ?? process.env.DATABASE_URL);
const redis = await connectRedis();
const broker = await connectBroker();
const port = Number(process.env.PORT ?? 4005);

async function consumeEvents() {
  if (!pool || !broker) return;
  const queue = `analytics.${process.env.HOSTNAME ?? 'local'}`;
  await broker.channel.assertQueue(queue, { durable: true });
  await broker.channel.bindQueue(queue, process.env.EVENT_EXCHANGE ?? 'service-desk.events', '#');
  await broker.channel.consume(queue, async (message) => {
    if (!message) return;
    try {
      const event = JSON.parse(message.content.toString()) as EventEnvelope;
      await pool.query('INSERT INTO analytics_event_log (event_id,event_type,event_version,correlation_id,occurred_at,producer,payload) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (event_id) DO NOTHING', [event.eventId,event.eventType,event.eventVersion,event.correlationId,event.occurredAt,event.producer,event.payload]);
      broker.channel.ack(message);
    } catch { broker.channel.nack(message, false, true); }
  });
}
void consumeEvents();

async function cubeRun(runType: 'refresh' | 'rebuild') {
  if (!pool) throw new Error('Analytics DB не настроена');
  const run = (await pool.query('INSERT INTO cube_runs (run_type,status) VALUES ($1,\'running\') RETURNING id', [runType])).rows[0];
  try {
    await pool.query(`INSERT INTO dim_date (date_key,date,day,day_of_week,week,month,month_name,quarter,year,is_weekend) SELECT to_char(d,'YYYYMMDD')::int,d,extract(day from d)::int,extract(isodow from d)::int,extract(week from d)::int,extract(month from d)::int,to_char(d,'TMMonth'),extract(quarter from d)::int,extract(year from d)::int,extract(isodow from d) IN (6,7) FROM generate_series(current_date - interval '5 years', current_date + interval '5 years', interval '1 day') d ON CONFLICT (date_key) DO NOTHING`);
    const processed = (await pool.query('SELECT count(*)::int AS count FROM analytics_event_log')).rows[0]?.count ?? 0;
    await pool.query('UPDATE cube_runs SET status=\'completed\',finished_at=now(),processed_records=$2,checkpoint=$3 WHERE id=$1', [run.id, processed, new Date().toISOString()]);
    return { id: run.id, status: 'completed', processedRecords: processed };
  } catch (error) { await pool.query('UPDATE cube_runs SET status=\'failed\',finished_at=now(),error=$2 WHERE id=$1', [run.id, error instanceof Error ? error.message : 'Ошибка куба']); throw error; }
}

const server = createServiceServer({
  serviceName: 'analytics-service',
  port,
  readiness: () => dependencyStatus(pool, redis, broker?.connection ?? null),
  routes: {
    'GET /analytics/tickets': async (_request, response, _url, context) => { if (!pool) return sendJson(response,503,{error:'Analytics DB не настроена'},context); return sendJson(response,200,{data:await cacheAside(redis,'analytics:report:tickets',60,async()=> (await pool.query('SELECT count(*)::int AS tickets, count(*) FILTER (WHERE sla_breached)::int AS breached FROM fact_tickets')).rows[0])},context); },
    'GET /analytics/development': async (_request, response, _url, context) => { if (!pool) return sendJson(response,503,{error:'Analytics DB не настроена'},context); return sendJson(response,200,{data:(await pool.query('SELECT count(*)::int AS tasks, coalesce(sum(total_hours),0) AS total_hours FROM fact_development_tasks')).rows[0]},context); },
    'GET /analytics/cameras': async (_request, response, _url, context) => { if (!pool) return sendJson(response,503,{error:'Analytics DB не настроена'},context); return sendJson(response,200,{data:(await pool.query('SELECT count(*)::int AS shifts FROM fact_camera_shifts')).rows[0]},context); },
    'GET /analytics/sla': async (_request, response, _url, context) => { if (!pool) return sendJson(response,503,{error:'Analytics DB не настроена'},context); return sendJson(response,200,{data:(await pool.query('SELECT count(*)::int AS total, count(*) FILTER (WHERE breached)::int AS breached FROM fact_sla')).rows[0]},context); },
    'GET /analytics/cube/status': async (_request, response, _url, context) => { if (!pool) return sendJson(response,503,{error:'Analytics DB не настроена'},context); const run=(await pool.query('SELECT id,run_type,status,started_at,finished_at,processed_records,error,checkpoint FROM cube_runs ORDER BY started_at DESC LIMIT 1')).rows[0] ?? null; return sendJson(response,200,{run},context); },
    'POST /analytics/cube/refresh': async (_request, response, _url, context) => { if (context.role !== 'admin') return sendJson(response,403,{error:'Требуется роль администратора'},context); return sendJson(response,202,{run:await cubeRun('refresh')},context); },
    'POST /analytics/cube/rebuild': async (_request, response, _url, context) => { if (context.role !== 'admin') return sendJson(response,403,{error:'Требуется роль администратора'},context); return sendJson(response,202,{run:await cubeRun('rebuild')},context); },
  },
});

const shutdown = async () => { server.close(); await pool?.end(); await broker?.connection.close(); redis?.disconnect(); process.exit(0); };
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
}
void bootstrap();
