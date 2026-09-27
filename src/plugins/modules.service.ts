import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../infrastructure/database.service';
import { isServiceId, SERVICE_DEFINITIONS, serviceConfig, ServiceId, serviceIds } from './contracts';
import { ServiceActor, signRequest } from './service-auth';

@Injectable()
export class ModulesService {
  constructor(private readonly database: DatabaseService) {}
  async list() {
    const { rows } = await this.database.query('SELECT code, enabled, revision FROM connected_services ORDER BY code');
    return { services: serviceIds.map(code => ({ code, name: SERVICE_DEFINITIONS[code].name, enabled: rows.find(r => r.code === code)?.enabled ?? false, revision: rows.find(r => r.code === code)?.revision ?? 0, configured: !!serviceConfig(code).url && (serviceConfig(code).secret?.length ?? 0) >= 32 })) };
  }
  async requireEnabled(id: ServiceId) {
    const result = await this.database.query('SELECT enabled FROM connected_services WHERE code=$1', [id]);
    if (result.rows[0]?.enabled !== true) throw new ServiceUnavailableException({ code: 'SERVICE_DISABLED', message: `Блок «${SERVICE_DEFINITIONS[id].name}» отключён` });
  }
  async setEnabled(code: string, enabled: unknown, revision: unknown, actor: string) {
    if (!isServiceId(code) || typeof enabled !== 'boolean' || !Number.isInteger(revision)) throw new BadRequestException('Некорректные параметры блока');
    if (enabled) {
      const health = await this.call(code, '/internal/health', 'GET', '', { userId: actor, role: 'admin' }, false);
      if (!health.ok || (await health.json() as { ready?: boolean }).ready !== true) throw new ServiceUnavailableException('Сервис не готов. Проверьте запуск и перенос данных');
    }
    const result = await this.database.query(`WITH changed AS (
      UPDATE connected_services SET enabled=$2, revision=revision+1, updated_by=$3::uuid, updated_at=now()
      WHERE code=$1 AND revision=$4 RETURNING code, enabled, revision
    ), logged AS (
      INSERT INTO audit_log(actor_id,action,resource_type,resource_id,after_data,reason)
      SELECT $3::uuid,'configure','connected_service',code,jsonb_build_object('enabled',enabled),'Подключаемые блоки' FROM changed
    ) SELECT * FROM changed`, [code, enabled, actor, revision]);
    if (!result.rows[0]) throw new ConflictException('Настройки уже изменены. Обновите страницу');
    return result.rows[0];
  }
  async call(id: ServiceId, path: string, method: string, body: string, actor: ServiceActor, checkEnabled = true, timeoutMs = 30_000): Promise<Response> {
    if (checkEnabled) await this.requireEnabled(id);
    const config = serviceConfig(id);
    if (!config.url || !config.secret || config.secret.length < 32) throw new ServiceUnavailableException('Подключение сервиса не настроено');
    try {
      const url = new URL(path, config.url);
      if (url.origin !== new URL(config.url).origin) throw new Error('Invalid service origin');
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-SD-Token': signRequest(config.secret, id, method, path, body, actor) }, body: body || undefined, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
      return response;
    } catch { throw new ServiceUnavailableException(`Сервис «${SERVICE_DEFINITIONS[id].name}» временно недоступен`); }
  }
  async equipmentCatalog() {
    try {
      const response = await this.call('equipment', '/assets/equipment', 'GET', '', { userId: '00000000-0000-0000-0000-000000000001', role: 'catalog_reader' }, true, 2000);
      if (!response.ok) throw new Error('Equipment unavailable');
      const rows = await response.json() as Array<{ id: string; name: string; inventory_number: string; is_active: boolean; status: string }>;
      return { rows: rows.filter(r => r.is_active && r.status !== 'written_off'), available: true };
    } catch { return { rows: [], available: false }; }
  }
}
