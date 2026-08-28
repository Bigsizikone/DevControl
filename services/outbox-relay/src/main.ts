import { createPool, connectBroker, publishEvent, type EventEnvelope } from '../../../packages/shared-kernel/src/runtime';

async function bootstrap() {
const pool = createPool(process.env.OUTBOX_DATABASE_URL ?? process.env.DATABASE_URL);
const broker = await connectBroker();
const serviceName = process.env.SERVICE_NAME ?? 'outbox-relay';
const intervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000);
let stopping = false;

async function poll() {
  if (!pool || !broker) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = (await client.query('SELECT event_id,event_type,event_version,correlation_id,payload,occurred_at FROM outbox_events WHERE published_at IS NULL ORDER BY occurred_at FOR UPDATE SKIP LOCKED LIMIT 50')).rows;
    for (const row of rows) {
      const event: EventEnvelope = { eventId: row.event_id, eventType: row.event_type, eventVersion: row.event_version, occurredAt: row.occurred_at.toISOString(), producer: serviceName, correlationId: row.correlation_id, payload: row.payload };
      const published = await publishEvent(broker.channel, event);
      if (published) await client.query('UPDATE outbox_events SET published_at=now(),attempts=attempts+1,last_error=NULL WHERE event_id=$1', [row.event_id]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); console.error(JSON.stringify({level:'error',service:serviceName,error:error instanceof Error?error.message:'outbox failure'})); }
  finally { client.release(); }
}

const timer = setInterval(() => { if (!stopping) void poll(); }, intervalMs);
void poll();
const shutdown = async () => { stopping=true; clearInterval(timer); await pool?.end(); await broker?.connection.close(); process.exit(0); };
process.once('SIGTERM',()=>void shutdown());process.once('SIGINT',()=>void shutdown());
}
void bootstrap();
