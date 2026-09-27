import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from './database.service';

const movementStatuses = ['new', 'issued', 'repair', 'replacement', 'writeoff_process', 'written_off'] as const;

@Injectable()
export class AssetsService {
  constructor(private readonly database: DatabaseService) {}

  async overview() {
    const [equipment, warehouses, stock, nomenclature, movements, receipts, users, organizations, departments] = await Promise.all([
      this.listEquipment(), this.listWarehouses(), this.listStock(), this.listNomenclature(), this.listMovements(), this.listReceipts(),
      this.database.query('SELECT id, display_name FROM users WHERE is_active = true ORDER BY display_name'),
      this.database.query('SELECT id, name FROM organizations WHERE is_active = true ORDER BY name'),
      this.database.query('SELECT id, name, organization_id FROM departments WHERE is_active = true ORDER BY name'),
    ]);
    return { equipment, warehouses, stock, nomenclature, movements, receipts, users: users.rows, organizations: organizations.rows, departments: departments.rows };
  }

  async listEquipment() {
    const result = await this.database.query(`SELECT e.*, w.name AS warehouse_name, o.name AS organization_name, d.name AS department_name, u.display_name AS assigned_to_name
      FROM equipment_items e LEFT JOIN warehouses w ON w.id = e.warehouse_id LEFT JOIN organizations o ON o.id = e.organization_id
      LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN users u ON u.id = e.assigned_to ORDER BY e.created_at DESC`);
    return result.rows;
  }

  async listWarehouses() {
    const result = await this.database.query(`SELECT w.*, o.name AS organization_name, COUNT(ws.id)::int AS stock_lines
      FROM warehouses w LEFT JOIN organizations o ON o.id = w.organization_id LEFT JOIN warehouse_stock ws ON ws.warehouse_id = w.id
      GROUP BY w.id, o.name ORDER BY w.name`);
    return result.rows;
  }

  async listStock() {
    const result = await this.database.query(`SELECT ws.*, w.name AS warehouse_name, n.code AS nomenclature_code, n.name AS nomenclature_name, n.unit
      FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id JOIN nomenclature n ON n.id = ws.nomenclature_id ORDER BY w.name, n.name`);
    return result.rows;
  }

  async listNomenclature() {
    const result = await this.database.query('SELECT * FROM nomenclature ORDER BY name');
    return result.rows;
  }

  async listMovements() {
    const result = await this.database.query(`SELECT m.*, e.inventory_number, e.name AS equipment_name, o.name AS organization_name, d.name AS department_name,
      employee.display_name AS employee_name, issuer.display_name AS issued_by_name, approver.display_name AS approver_name
      FROM equipment_movements m LEFT JOIN equipment_items e ON e.id = m.equipment_id LEFT JOIN organizations o ON o.id = m.organization_id
      LEFT JOIN departments d ON d.id = m.department_id LEFT JOIN users employee ON employee.id = m.employee_id
      LEFT JOIN users issuer ON issuer.id = m.issued_by LEFT JOIN users approver ON approver.id = m.approver_id ORDER BY m.created_at DESC`);
    return result.rows;
  }

  async listReceipts() {
    const result = await this.database.query(`SELECT r.*, o.name AS organization_name, w.name AS warehouse_name, u.display_name AS employee_name, n.code AS nomenclature_code, n.name AS nomenclature_name, n.unit
      FROM inventory_receipts r LEFT JOIN organizations o ON o.id = r.organization_id JOIN warehouses w ON w.id = r.warehouse_id
      LEFT JOIN users u ON u.id = r.employee_id JOIN nomenclature n ON n.id = r.nomenclature_id ORDER BY r.created_at DESC`);
    return result.rows;
  }

  async createNomenclature(input: { name?: string; category?: string; unit?: string }) {
    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('Наименование номенклатуры обязательно');
    const code = `NOM-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
    const result = await this.database.query('INSERT INTO nomenclature (code, name, category, unit) VALUES ($1, $2, $3, $4) RETURNING *', [code, name, String(input.category ?? 'Оборудование').trim() || 'Оборудование', String(input.unit ?? 'шт').trim() || 'шт']);
    return { nomenclature: result.rows[0] };
  }

  async createWarehouse(input: { name?: string; organizationId?: string; address?: string }) {
    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('Название склада обязательно');
    const code = `WH-${Date.now().toString(36).toUpperCase()}`;
    const result = await this.database.query('INSERT INTO warehouses (code, name, organization_id, address) VALUES ($1, $2, NULLIF($3, \'\')::uuid, NULLIF($4, \'\')) RETURNING *', [code, name, String(input.organizationId ?? ''), String(input.address ?? '').trim()]);
    return { warehouse: result.rows[0] };
  }

  async upsertStock(input: { warehouseId?: string; nomenclatureId?: string; quantity?: number; comment?: string; isUsed?: boolean }) {
    const warehouseId = String(input.warehouseId ?? '').trim();
    const nomenclatureId = String(input.nomenclatureId ?? '').trim();
    const quantity = Number(input.quantity ?? 0);
    if (!warehouseId || !nomenclatureId || !Number.isFinite(quantity) || quantity < 0) throw new BadRequestException('Склад, номенклатура и корректное количество обязательны');
    const result = await this.database.query(`INSERT INTO warehouse_stock (warehouse_id, nomenclature_id, quantity, comment, is_used)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT (warehouse_id, nomenclature_id) DO UPDATE SET quantity = EXCLUDED.quantity, comment = EXCLUDED.comment, is_used = EXCLUDED.is_used, updated_at = now() RETURNING *`, [warehouseId, nomenclatureId, quantity, String(input.comment ?? '').trim() || null, Boolean(input.isUsed)]);
    return { stock: result.rows[0] };
  }

  async createEquipment(input: { inventoryNumber?: string; name?: string; equipmentType?: string; serialNumber?: string; status?: string; tonerLevel?: number | null; tonerAvailable?: boolean | null; warehouseId?: string; organizationId?: string; departmentId?: string; assignedTo?: string; comment?: string }) {
    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('Наименование оборудования обязательно');
    const inventoryNumber = String(input.inventoryNumber ?? '').trim() || `INV-${Date.now().toString(36).toUpperCase()}`;
    const status = String(input.status ?? 'in_stock');
    if (status !== 'in_stock' && !movementStatuses.includes(status as typeof movementStatuses[number])) throw new BadRequestException('Недопустимый статус оборудования');
    const result = await this.database.query(`INSERT INTO equipment_items (inventory_number, name, equipment_type, serial_number, status, toner_level, toner_available, warehouse_id, organization_id, department_id, assigned_to, comment)
      VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, NULLIF($8, '')::uuid, NULLIF($9, '')::uuid, NULLIF($10, '')::uuid, NULLIF($11, '')::uuid, NULLIF($12, '')) RETURNING *`, [inventoryNumber, name, String(input.equipmentType ?? 'Оборудование').trim() || 'Оборудование', String(input.serialNumber ?? '').trim(), status, input.tonerLevel === null || input.tonerLevel === undefined ? null : Number(input.tonerLevel), input.tonerAvailable ?? null, String(input.warehouseId ?? ''), String(input.organizationId ?? ''), String(input.departmentId ?? ''), String(input.assignedTo ?? ''), String(input.comment ?? '').trim()]);
    return { equipment: result.rows[0] };
  }

  async createMovement(input: { equipmentId?: string; organizationId?: string; departmentId?: string; employeeId?: string; issuedBy?: string; status?: string; requiresApproval?: boolean; approverId?: string; comment?: string }) {
    const status = String(input.status ?? 'new');
    if (!movementStatuses.includes(status as typeof movementStatuses[number])) throw new BadRequestException('Недопустимый статус движения');
    const requiresApproval = Boolean(input.requiresApproval);
    const approverId = String(input.approverId ?? '').trim();
    if (requiresApproval && !approverId) throw new BadRequestException('Выберите сотрудника для согласования');
    const employeeId = String(input.employeeId ?? '').trim();
    const effectiveStatus = status === 'new' && employeeId ? 'issued' : status;
    const result = await this.database.query(`INSERT INTO equipment_movements (equipment_id, organization_id, department_id, employee_id, issued_by, status, requires_approval, approver_id, comment)
      VALUES (NULLIF($1, '')::uuid, NULLIF($2, '')::uuid, NULLIF($3, '')::uuid, NULLIF($4, '')::uuid, NULLIF($5, '')::uuid, $6, $7, NULLIF($8, '')::uuid, NULLIF($9, '')) RETURNING *`, [String(input.equipmentId ?? ''), String(input.organizationId ?? ''), String(input.departmentId ?? ''), String(input.employeeId ?? ''), String(input.issuedBy ?? ''), effectiveStatus, requiresApproval, approverId, String(input.comment ?? '').trim()]);
    if (input.equipmentId) await this.database.query('UPDATE equipment_items SET status = $2, assigned_to = NULLIF($3, \'\')::uuid, updated_at = now() WHERE id = $1', [input.equipmentId, effectiveStatus, employeeId]);
    return { movement: { ...result.rows[0], status: effectiveStatus, equipment_status: effectiveStatus } };
  }

  async createReceipt(input: { organizationId?: string; warehouseId?: string; employeeId?: string; nomenclatureId?: string; quantity?: number; comment?: string }) {
    const warehouseId = String(input.warehouseId ?? '').trim();
    const nomenclatureId = String(input.nomenclatureId ?? '').trim();
    const quantity = Number(input.quantity ?? 0);
    if (!warehouseId || !nomenclatureId || !Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('Склад, номенклатура и количество обязательны');
    const result = await this.database.query(`INSERT INTO inventory_receipts (organization_id, warehouse_id, employee_id, nomenclature_id, quantity, comment)
      VALUES (NULLIF($1, '')::uuid, $2, NULLIF($3, '')::uuid, $4, $5, NULLIF($6, '')) RETURNING *`, [String(input.organizationId ?? ''), warehouseId, String(input.employeeId ?? ''), nomenclatureId, quantity, String(input.comment ?? '').trim()]);
    await this.database.query(`INSERT INTO warehouse_stock (warehouse_id, nomenclature_id, quantity, comment) VALUES ($1, $2, $3, $4)
      ON CONFLICT (warehouse_id, nomenclature_id) DO UPDATE SET quantity = warehouse_stock.quantity + EXCLUDED.quantity, comment = COALESCE(EXCLUDED.comment, warehouse_stock.comment), updated_at = now()`, [warehouseId, nomenclatureId, quantity, String(input.comment ?? '').trim() || null]);
    return { receipt: result.rows[0] };
  }


}
