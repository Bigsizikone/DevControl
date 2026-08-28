import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eventEnvelope } from '../packages/shared-kernel/src/runtime';

const root = process.cwd();

describe('microservice architecture foundation', () => {
  test('has independent service database schemas and architecture docs', () => {
    for (const file of ['identity.sql', 'service-desk.sql', 'development.sql', 'camera.sql', 'audit.sql', 'notification.sql', 'analytics.sql', 'file.sql']) {
      expect(existsSync(join(root, 'database', 'service-databases', file))).toBe(true);
    }
    expect(readFileSync(join(root, 'docs', 'architecture', 'microservices.md'), 'utf8')).toContain('Cross-service foreign keys');
  });

  test('event envelope is versioned and carries correlation id', () => {
    const event = eventEnvelope('test-service', 'TicketCreated', { ticketId: 'ticket-1' }, 'corr-1');
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.eventVersion).toBe(1);
    expect(event.correlationId).toBe('corr-1');
    expect(event.payload).toEqual({ ticketId: 'ticket-1' });
  });

  test('legacy and v1 routing are documented separately', () => {
    const gateway = readFileSync(join(root, 'apps', 'api-gateway', 'src', 'main.ts'), 'utf8');
    expect(gateway).toContain("url.pathname.startsWith('/api/')");
    expect(gateway).toContain('/api/v1/development');
    expect(gateway).toContain('x-correlation-id');
  });
});
