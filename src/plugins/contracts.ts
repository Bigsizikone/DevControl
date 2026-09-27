export const SERVICE_DEFINITIONS = {
  equipment: { name: 'Поступление и ремонт оборудования', prefix: '/assets', tables: ['nomenclature', 'warehouses', 'warehouse_stock', 'equipment_items', 'equipment_movements', 'inventory_receipts', 'equipment_repairs'] },
  surveillance: { name: 'Видеонаблюдение', prefix: '/cameras', tables: ['camera_work_shifts', 'camera_schedule_templates', 'camera_violations', 'camera_violation_attachments', 'camera_schedule_recommendations', 'camera_tickets'] },
  security: { name: 'Информационная безопасность', prefix: '/security', tables: ['security_records', 'security_record_comments', 'security_record_links', 'security_record_attachments'] },
} as const;
export type ServiceId = keyof typeof SERVICE_DEFINITIONS;
export const serviceIds = Object.keys(SERVICE_DEFINITIONS) as ServiceId[];
export const isServiceId = (value: string): value is ServiceId => Object.hasOwn(SERVICE_DEFINITIONS, value);
export function tableOwner(table: string): ServiceId | undefined {
  return serviceIds.find(id => (SERVICE_DEFINITIONS[id].tables as readonly string[]).includes(table));
}
export function routeOwner(path: string): ServiceId | undefined {
  // Canonical paths only: Express decodes route parameters, so the gateway must too.
  let decoded: string;
  try { decoded = decodeURIComponent(path.split('?')[0]); } catch { throw new Error('Invalid path'); }
  if (decoded.includes('%') || decoded.includes('\\') || decoded.split('/').some(p => p === '.' || p === '..')) throw new Error('Invalid path');
  const table = /^\/admin\/tables\/([^/]+)(?:\/|$)/i.exec(decoded)?.[1];
  if (table) return tableOwner(table.toLowerCase());
  return serviceIds.find(id => new RegExp(`^${SERVICE_DEFINITIONS[id].prefix}(?:/|$)`, 'i').test(decoded));
}
export function serviceConfig(id: ServiceId) {
  return { url: process.env[`${id.toUpperCase()}_URL`], secret: process.env[`${id.toUpperCase()}_SECRET`] };
}
