import { createPool, createServiceServer, dependencyStatus, sendJson, connectBroker, type EventEnvelope } from '../../../packages/shared-kernel/src/runtime';

async function bootstrap() {
const pool = createPool(process.env.AUDIT_DATABASE_URL ?? process.env.DATABASE_URL);
const broker = await connectBroker();
const port = Number(process.env.PORT ?? 4006);

async function consumeEvents() {
  if (!pool || !broker) return;
  const queue = `audit.${process.env.HOSTNAME ?? 'local'}`;
  await broker.channel.assertQueue(queue, { durable: true });
  await broker.channel.bindQueue(queue, process.env.EVENT_EXCHANGE ?? 'service-desk.events', '#');
  await broker.channel.consume(queue, async (message) => {
    if (!message) return;
    try {
      const event = JSON.parse(message.content.toString()) as EventEnvelope;
      await pool.query('INSERT INTO audit_events (event_id,correlation_id,entity_type,entity_id,action,user_id,service,new_value) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (event_id) DO NOTHING', [event.eventId,event.correlationId,event.payload.table ?? event.eventType,String(event.payload.ticketId ?? event.payload.taskId ?? ''),event.eventType,event.payload.userId ?? null,event.producer,event.payload]);
      broker.channel.ack(message);
    } catch { broker.channel.nack(message, false, true); }
  });
}
void consumeEvents();

const server = createServiceServer({
  serviceName: 'audit-service',
  port,
  readiness: () => dependencyStatus(pool, null, broker?.connection ?? null),
  routes: {
    'GET /audit/events': async (_request, response, url, context) => { if (!pool) return sendJson(response,503,{error:'Audit DB не настроена'},context); const limit=Math.min(Number(url.searchParams.get('limit')??100),500); return sendJson(response,200,{events:(await pool.query('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT $1',[limit])).rows},context); },
  },
});
const shutdown = async () => { server.close(); await pool?.end(); await broker?.connection.close(); process.exit(0); };
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
}
void bootstrap();
