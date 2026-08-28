import { createPool, createServiceServer, dependencyStatus, sendJson, connectBroker, type EventEnvelope } from '../../../packages/shared-kernel/src/runtime';

async function bootstrap() {
const pool = createPool(process.env.NOTIFICATION_DATABASE_URL ?? process.env.DATABASE_URL);
const broker = await connectBroker();
const port = Number(process.env.PORT ?? 4007);

async function consumeEvents() {
  if (!pool || !broker) return;
  const queue = `notifications.${process.env.HOSTNAME ?? 'local'}`;
  await broker.channel.assertQueue(queue, { durable: true }); await broker.channel.bindQueue(queue, process.env.EVENT_EXCHANGE ?? 'service-desk.events', '#');
  await broker.channel.consume(queue, async (message) => {
    if (!message) return;
    try {
      const event = JSON.parse(message.content.toString()) as EventEnvelope;
      const processed = await pool.query('INSERT INTO processed_events (event_id,consumer) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING event_id',[event.eventId,'notification-service']);
      const userId = event.payload.userId;
      if (processed.rowCount && userId) await pool.query('INSERT INTO notifications (event_id,user_id,channel,title,body) VALUES ($1,$2,\'in-app\',$3,$4)', [event.eventId,userId,event.eventType,JSON.stringify(event.payload)]);
      broker.channel.ack(message);
    } catch { broker.channel.nack(message, false, true); }
  });
}
void consumeEvents();
const server = createServiceServer({ serviceName:'notification-service', port, readiness:()=>dependencyStatus(pool,null,broker?.connection??null), routes:{
  'GET /notifications': async (_request,response,_url,context) => { if (!pool) return sendJson(response,503,{error:'Notification DB не настроена'},context); return sendJson(response,200,{notifications:(await pool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100')).rows},context); },
} });
const shutdown = async () => { server.close(); await pool?.end(); await broker?.connection.close(); process.exit(0); };
process.once('SIGTERM',()=>void shutdown()); process.once('SIGINT',()=>void shutdown());
}
void bootstrap();
