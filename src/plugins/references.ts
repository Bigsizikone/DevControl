import { DatabaseService } from '../infrastructure/database.service';
import { ServiceId, serviceConfig } from './contracts';
import { signRequest } from './service-auth';

// Only public directory fields; credentials, sessions and business data never leave SD.
export const REFERENCE_COLUMNS = {
  organizations: ['id', 'name', 'is_active'],
  departments: ['id', 'name', 'organization_id', 'is_active'],
  users: ['id', 'display_name', 'email', 'department_id', 'is_active', 'created_at'],
  roles: ['id', 'code', 'name', 'is_active'],
  user_roles: ['user_id', 'role_id'],
} as const;
export async function referenceSnapshot(database: DatabaseService) {
  // A consistent snapshot, including role assignments.
  return database.transaction(async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result: Record<string, unknown[]> = {};
    for (const [table, columns] of Object.entries(REFERENCE_COLUMNS)) result[table] = (await client.query(`SELECT ${columns.join(',')} FROM ${table}`)).rows;
    return result;
  });
}
export function referenceSynchronizer(database: DatabaseService, id: ServiceId) {
  let refreshedAt = 0;
  let pending: Promise<void> | undefined;
  return async () => {
    if (Date.now() - refreshedAt < 5000) return;
    if (!pending) pending = (async () => {
      const path = `/internal/services/${id}/references`;
      const secret = serviceConfig(id).secret!;
      const response = await fetch(new URL(path, process.env.CORE_URL || 'http://app:3000'), { headers: { 'X-SD-Token': signRequest(secret, 'core', 'GET', path, '', { userId: id, role: 'service' }) }, signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok) throw new Error('Reference data unavailable');
      const snapshot = await response.json() as Record<string, Array<Record<string, unknown>>>;
      await database.transaction(async client => {
        for (const [table, columns] of Object.entries(REFERENCE_COLUMNS)) {
          if (!Array.isArray(snapshot[table])) throw new Error('Invalid reference snapshot');
          if (table === 'user_roles') await client.query('DELETE FROM user_roles');
          else await client.query(`UPDATE ${table} SET is_active=false`);
          for (const row of snapshot[table]) {
            const conflict = table === 'user_roles' ? 'DO NOTHING' : `DO UPDATE SET ${columns.filter(c => c !== 'id').map(c => `${c}=EXCLUDED.${c}`).join(',')}`;
            await client.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT ${table === 'user_roles' ? '' : '(id)'} ${conflict}`, columns.map(c => row[c]));
          }
        }
      });
      refreshedAt = Date.now();
    })().finally(() => { pending = undefined; });
    return pending;
  };
}
