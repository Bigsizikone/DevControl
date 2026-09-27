import 'reflect-metadata';
import { Type, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DatabaseService } from '../infrastructure/database.service';
import { ServiceId, serviceConfig, routeOwner, tableOwner } from './contracts';
import { RequestVerifier } from './service-auth';
import { referenceSynchronizer } from './references';

export async function bootstrapService(module: Type, id: ServiceId) {
  if (process.env.SERVICE_ID !== id) throw new Error(`SERVICE_ID must be ${id}`);
  const secret = serviceConfig(id).secret;
  if (!secret || secret.length < 32) throw new Error('Service secret is required');
  const app = await NestFactory.create<NestExpressApplication>(module, { bodyParser: false });
  app.useBodyParser('json', { limit: `${Math.max(10, Math.ceil(Number(process.env.MAX_VIOLATION_FILE_SIZE_MB ?? 200) * 1.4))}mb` });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const database = app.get(DatabaseService);
  const verifier = new RequestVerifier();
  const sync = referenceSynchronizer(database, id);
  app.use(async (req: any, res: any, next: () => void) => {
    delete req.headers['x-user-id']; delete req.headers['x-role'];
    if (req.path === '/health/live' && req.method === 'GET') return res.json({ status: 'ok', service: id });
    try {
      const body = ['GET', 'HEAD'].includes(req.method) ? '' : JSON.stringify(req.body ?? {});
      const actor = verifier.verify(String(req.headers['x-sd-token'] || ''), secret, id, req.method, req.url, body);
      req.headers['x-user-id'] = actor.userId; req.headers['x-role'] = actor.role;
    } catch { return res.status(401).json({ message: 'Требуется подпись Service Desk' }); }
    if (req.path === '/internal/health' && req.method === 'GET') {
      try { const { rows } = await database.query('SELECT service FROM service_migrations WHERE service=$1', [id]); return res.json({ ready: rows.length === 1, service: id }); }
      catch { return res.status(503).json({ ready: false, service: id }); }
    }
    try {
      const adminIndex = req.path === '/admin/tables' && req.method === 'GET';
      if (!adminIndex && routeOwner(req.path) !== id) return res.status(404).json({ message: 'Не найдено' });
      if (/^\/admin/i.test(req.path) && req.headers['x-role'] !== 'admin') return res.status(403).json({ message: 'Требуется администратор' });
      if (req.headers['x-role'] === 'catalog_reader' && !(req.path === '/assets/equipment' && req.method === 'GET')) return res.status(403).json({ message: 'Недостаточно прав' });
      // Equipment mutations require a service role, in addition to SD authentication.
      if (id === 'equipment' && !['GET', 'HEAD'].includes(req.method) && !['admin', 'agent', 'executor', 'dispatcher', 'equipment_manager', 'support_specialist'].includes(req.headers['x-role'])) return res.status(403).json({ message: 'Нет прав на изменение оборудования' });
      await sync();
      next();
    } catch { return res.status(503).json({ message: 'Справочники сервиса временно недоступны' }); }
  });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT || 3000);
}
