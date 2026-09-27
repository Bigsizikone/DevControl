import { HttpException } from '@nestjs/common';
import { DatabaseService } from '../infrastructure/database.service';
import { AdminService } from '../infrastructure/admin.service';
import { isServiceId, routeOwner, serviceConfig } from './contracts';
import { ModulesService } from './modules.service';
import { referenceSnapshot } from './references';
import { RequestVerifier } from './service-auth';

// Installed before session authentication. Only signed service directory requests are accepted here.
export function installReferenceEndpoint(server: any, database: DatabaseService) {
  const verifier = new RequestVerifier();
  server.use(async (req: any, res: any, next: () => void) => {
    if (!/^\/internal(?:\/|$)/i.test(req.path)) return next();
    const id = /^\/internal\/services\/([a-z]+)\/references$/.exec(req.path)?.[1];
    try {
      if (req.method !== 'GET' || !id || !isServiceId(id)) throw new Error('Invalid service');
      const actor = verifier.verify(String(req.headers['x-sd-token'] || ''), serviceConfig(id).secret || '', 'core', req.method, req.url, '');
      if (actor.userId !== id || actor.role !== 'service') throw new Error('Invalid actor');
    } catch { return res.status(401).json({ message: 'Требуется подпись сервиса' }); }
    try { res.setHeader('Cache-Control', 'no-store'); return res.json(await referenceSnapshot(database)); }
    catch { return res.status(503).json({ message: 'Справочники временно недоступны' }); }
  });
}

// Installed after session authentication; never forwards cookies or caller-supplied identity headers.
export function installServiceGateway(server: any, modules: ModulesService, admin: AdminService) {
  server.use(async (req: any, res: any, next: () => void) => {
    if (/^\/admin\/tables\/?$/i.test(req.path) && req.method === 'GET') {
      if (req.headers['x-role'] !== 'admin') return res.status(403).json({ message: 'Требуется роль администратора' });
      try {
        const core = await admin.listTables();
        const { services } = await modules.list();
        const remote = await Promise.all(services.filter(s => s.enabled).map(async s => {
          try {
            const result = await modules.call(s.code, '/admin/tables', 'GET', '', { userId: req.headers['x-user-id'], role: 'admin' });
            if (!result.ok) throw new Error('Unavailable');
            return await result.json() as { tables: typeof core.tables };
          } catch { return { tables: [], unavailable: s.code }; }
        }));
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ tables: [...core.tables, ...remote.flatMap(r => r.tables)], unavailableServices: remote.filter(r => 'unavailable' in r).map(r => (r as { unavailable: string }).unavailable) });
      } catch { return res.status(503).json({ message: 'НСИ временно недоступны' }); }
    }
    let owner;
    try { owner = routeOwner(req.path); } catch { return res.status(400).json({ message: 'Некорректный адрес' }); }
    if (!owner || /^\/assets\/[\w-]+\.(js|css|woff2?)$/.test(req.path)) return next();
    try {
      const method = req.method;
      const body = ['GET', 'HEAD'].includes(method) ? '' : JSON.stringify(req.body ?? {});
      const upstream = await modules.call(owner, req.url, method, body, { userId: req.headers['x-user-id'], role: req.headers['x-role'] });
      res.status(upstream.status);
      for (const name of ['content-type', 'content-disposition', 'cache-control']) {
        const value = upstream.headers.get(name); if (value) res.setHeader(name, value);
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 503;
      return res.status(status).json(error instanceof HttpException ? error.getResponse() : { message: 'Сервис временно недоступен' });
    }
  });
}
