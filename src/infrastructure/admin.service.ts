import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from './database.service';
import { ADMIN_FIELD_LABELS, ADMIN_REFERENCE_COLUMNS, ADMIN_TABLE_BLOCKS, ADMIN_TABLE_LABELS, type AdminReference } from './admin-catalog';

const ADMIN_TABLES = [
  'users', 'roles', 'permissions', 'user_roles', 'role_permissions',
  'organizations', 'departments', 'territories', 'competencies', 'user_competencies',
  'support_groups', 'support_group_members', 'categories', 'ticket_types', 'ticket_kinds',
  'ticket_type_competencies', 'routing_rules', 'routing_rule_versions',
  'nomenclature', 'warehouses', 'warehouse_stock', 'equipment_items', 'equipment_movements', 'inventory_receipts', 'system_integrations',
  'camera_work_shifts', 'camera_schedule_templates', 'camera_violations', 'camera_violation_attachments', 'camera_schedule_recommendations',
] as const;

type Column = {
  name: string;
  label: string;
  reference?: AdminReference;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  generated: boolean;
};

export type TableMetadata = {
  name: string;
  columns: Column[];
  primaryKey: string[];
};

@Injectable()
export class AdminService {
  constructor(private readonly database: DatabaseService) {}

  async listTables() {
    const result = await this.database.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [ADMIN_TABLES],
    );
    const tables = await Promise.all(result.rows.map(async ({ table_name }) => {
      const count = await this.database.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${this.identifier(table_name)}`);
      return { name: table_name, label: ADMIN_TABLE_LABELS[table_name] ?? 'Раздел НСИ', block: ADMIN_TABLE_BLOCKS[table_name] ?? 'Прочее', rowCount: Number(count.rows[0]?.count ?? 0) };
    }));
    return { tables };
  }

  async getRows(table: string, limit = 100, offset = 0) {
    const metadata = await this.getMetadata(table);
    const order = metadata.primaryKey[0] ?? metadata.columns[0]?.name;
    const result = await this.database.query(`SELECT * FROM ${this.identifier(table)}${order ? ` ORDER BY ${this.identifier(order)}` : ''} LIMIT $1 OFFSET $2`, [Math.min(limit, 500), Math.max(offset, 0)]);
    return { ...metadata, rows: result.rows, displayRows: await this.buildDisplayRows(table, result.rows, metadata), limit, offset };
  }

  async createRow(table: string, values: Record<string, unknown>) {
    const metadata = await this.getMetadata(table);
    const codeColumn = metadata.columns.find((column) => column.name === 'code' && !column.generated);
    const inputValues = { ...values };
    delete inputValues.id;
    delete inputValues.code;
    if (codeColumn) inputValues.code = this.generatedCode(table);
    const allowed = metadata.columns.filter((column) => Object.hasOwn(inputValues, column.name) && !column.generated && column.name !== 'id');
    if (allowed.length === 0) throw new BadRequestException('Не переданы поля для создания записи');
    const columns = allowed.map((column) => this.identifier(column.name)).join(', ');
    const params = allowed.map((column) => inputValues[column.name]);
    const placeholders = params.map((_, index) => `$${index + 1}`).join(', ');
    const result = await this.database.query(`INSERT INTO ${this.identifier(table)} (${columns}) VALUES (${placeholders}) RETURNING *`, params);
    return result.rows[0];
  }

  async updateRow(table: string, key: Record<string, unknown>, values: Record<string, unknown>) {
    const metadata = await this.getMetadata(table);
    const editable = metadata.columns.filter((column) => Object.hasOwn(values, column.name) && !metadata.primaryKey.includes(column.name) && column.name !== 'code' && !column.generated);
    if (editable.length === 0) throw new BadRequestException('Не переданы изменяемые поля');
    const set = editable.map((column, index) => `${this.identifier(column.name)} = $${index + 1}`).join(', ');
    const updateValues = editable.map((column) => values[column.name]);
    const where = this.keyClause(metadata, key, updateValues.length + 1);
    const result = await this.database.query(`UPDATE ${this.identifier(table)} SET ${set} WHERE ${where.sql} RETURNING *`, [...updateValues, ...where.values]);
    return result.rows[0] ?? null;
  }

  async deleteRow(table: string, key: Record<string, unknown>) {
    const metadata = await this.getMetadata(table);
    const where = this.keyClause(metadata, key, 1);
    await this.database.query(`DELETE FROM ${this.identifier(table)} WHERE ${where.sql}`, where.values);
    return { deleted: true };
  }

  async getMetadata(table: string): Promise<TableMetadata> {
    this.assertTable(table);
    const columns = await this.database.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      is_generated: string;
    }>(`SELECT column_name, data_type, is_nullable, column_default, is_generated
        FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table]);
    const primary = await this.database.query<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
       ORDER BY kcu.ordinal_position`,
      [table],
    );
    if (columns.rows.length === 0) throw new BadRequestException('Таблица не найдена');
    return {
      name: table,
      columns: columns.rows.map((column) => ({ name: column.column_name, label: ADMIN_FIELD_LABELS[table]?.[column.column_name] ?? 'Поле', reference: ADMIN_REFERENCE_COLUMNS[table]?.[column.column_name], dataType: column.data_type, nullable: column.is_nullable === 'YES', defaultValue: column.column_default, generated: column.is_generated === 'ALWAYS' })),
      primaryKey: primary.rows.map((column) => column.column_name),
    };
  }

  private async buildDisplayRows(table: string, rows: QueryResultRow[], metadata: TableMetadata) {
    const references = metadata.columns.filter((column) => column.reference);
    const lookups = new Map<string, Map<string, string>>();
    for (const column of references) {
      const reference = column.reference!;
      const lookupKey = `${reference.table}:${reference.label}`;
      if (!lookups.has(lookupKey)) {
        const result = await this.database.query<{ id: string; label: string }>(`SELECT ${this.identifier('id')}::text AS id, ${this.identifier(reference.label)}::text AS label FROM ${this.identifier(reference.table)}`);
        lookups.set(lookupKey, new Map(result.rows.map((row) => [row.id, row.label])));
      }
    }
    return rows.map((row) => {
      const displayRow = { ...row } as Record<string, unknown>;
      for (const column of references) {
        const reference = column.reference!;
        const lookup = lookups.get(`${reference.table}:${reference.label}`);
        const value = row[column.name];
        if (value !== null && value !== undefined) displayRow[column.name] = lookup?.get(String(value)) ?? value;
      }
      return displayRow;
    });
  }

  private keyClause(metadata: TableMetadata, key: Record<string, unknown>, startIndex: number) {
    if (metadata.primaryKey.length === 0) throw new BadRequestException('У таблицы нет первичного ключа');
    const values = metadata.primaryKey.map((column) => key[column]);
    if (values.some((value) => value === undefined || value === null || value === '')) throw new BadRequestException('Не указан ключ записи');
    return { sql: metadata.primaryKey.map((column, index) => `${this.identifier(column)} = $${startIndex + index}`).join(' AND '), values };
  }

  private assertTable(table: string): asserts table is typeof ADMIN_TABLES[number] {
    if (!ADMIN_TABLES.includes(table as typeof ADMIN_TABLES[number])) throw new BadRequestException('Таблица недоступна для администрирования');
  }

  private identifier(value: string) {
    this.assertTableName(value);
    return `"${value.replaceAll('"', '""')}"`;
  }

  private assertTableName(value: string) {
    if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new BadRequestException('Недопустимое имя поля');
  }

  private generatedCode(table: string) {
    return `nsi_${table}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
  }
}
