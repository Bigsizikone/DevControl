import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Injectable()
export class TicketsService {
  private readonly systemAuthorId = '00000000-0000-0000-0000-000000000001';

  constructor(private readonly database: DatabaseService) {}

  async listUsers() {
    const result = await this.database.query<{ id: string; display_name: string; email: string }>(
      'SELECT id, display_name, email FROM users WHERE is_active = true ORDER BY display_name',
    );
    return { users: result.rows };
  }

  async listCatalog() {
    const [types, kinds, equipment] = await Promise.all([
      this.database.query('SELECT id, code, name FROM ticket_types WHERE is_active = true ORDER BY name'),
      this.database.query('SELECT id, ticket_type_id, code, name FROM ticket_kinds WHERE is_active = true ORDER BY name'),
      this.database.query("SELECT id, inventory_number, name, status FROM equipment_items WHERE is_active = true AND status <> 'written_off' ORDER BY inventory_number"),
    ]);
    return { types: types.rows, kinds: kinds.rows, equipment: equipment.rows };
  }

  async listDocuments() {
    const result = await this.database.query(
      `SELECT t.id, t.number, t.subject, t.description, t.status, t.created_at,
              t.visit_required, t.visit_scheduled_at,
              t.purchase_required, t.erp_request_numbers, t.repair_required, t.equipment_id,
              tt.name AS ticket_type_name, tk.name AS ticket_kind_name,
              equipment.inventory_number AS equipment_inventory_number, equipment.name AS equipment_name,
              u.display_name AS requester_name, u.email AS requester_email,
              assignee.display_name AS assignee_name
       FROM tickets t JOIN users u ON u.id = t.created_by
       LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id LEFT JOIN ticket_kinds tk ON tk.id = t.ticket_kind_id
       LEFT JOIN equipment_items equipment ON equipment.id::text = t.equipment_id
       LEFT JOIN users assignee ON assignee.id = t.assignee_id
       ORDER BY t.created_at DESC LIMIT 100`,
    );
    return { tickets: result.rows };
  }

  async getDocument(id: string) {
    const ticket = await this.database.query(
      `SELECT t.id, t.number, t.subject, t.description, t.status, t.priority, t.created_at,
              t.visit_required, t.visit_scheduled_at,
              t.purchase_required, t.erp_request_numbers, t.repair_required, t.equipment_id,
              tt.name AS ticket_type_name, tk.name AS ticket_kind_name,
              equipment.inventory_number AS equipment_inventory_number, equipment.name AS equipment_name,
              u.display_name AS requester_name, u.email AS requester_email,
              assignee.display_name AS assignee_name
       FROM tickets t JOIN users u ON u.id = t.created_by
       LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id LEFT JOIN ticket_kinds tk ON tk.id = t.ticket_kind_id
       LEFT JOIN equipment_items equipment ON equipment.id::text = t.equipment_id
       LEFT JOIN users assignee ON assignee.id = t.assignee_id
       WHERE t.id = $1`, [id],
    );
    if (!ticket.rows[0]) throw new NotFoundException('Тикет не найден');
    const comments = await this.database.query(
      `SELECT c.id, c.body, c.created_at, u.display_name AS author_name
       FROM ticket_comments c JOIN users u ON u.id = c.author_id
       WHERE c.ticket_id = $1 ORDER BY c.created_at ASC`, [id],
    );
    return { ticket: { ...ticket.rows[0], comments: comments.rows } };
  }

  async updateDocument(id: string, input: { visitRequired?: boolean; visitScheduledAt?: string | null; purchaseRequired?: boolean; erpRequestNumbers?: string[]; repairRequired?: boolean }) {
    const required = Boolean(input.visitRequired);
    const scheduledAt = input.visitScheduledAt ? new Date(input.visitScheduledAt) : null;
    if (required && (!scheduledAt || Number.isNaN(scheduledAt.getTime()))) throw new BadRequestException('Укажите дату и время выезда');
    const purchaseRequired = Boolean(input.purchaseRequired);
    const repairRequired = Boolean(input.repairRequired);
    const erpRequestNumbers = [...new Set((input.erpRequestNumbers ?? []).map((value) => String(value).trim()).filter(Boolean))];
    if (erpRequestNumbers.some((value) => value.length > 20)) throw new BadRequestException('Номер заявки ERP не должен превышать 20 символов');
    if (purchaseRequired && erpRequestNumbers.length === 0) throw new BadRequestException('Укажите хотя бы один номер заявки ERP');
    const current = await this.database.query<{ id: string; erp_request_numbers: string[] | null }>(
      'SELECT id, erp_request_numbers FROM tickets WHERE id = $1', [id],
    );
    if (!current.rows[0]) throw new NotFoundException('Тикет не найден');
    const previousNumbers = current.rows[0].erp_request_numbers ?? [];
    const addedNumbers = purchaseRequired ? erpRequestNumbers.filter((number) => !previousNumbers.includes(number)) : [];
    const result = await this.database.query(
      `UPDATE tickets SET visit_required = $2, visit_scheduled_at = $3,
                          purchase_required = $4, erp_request_numbers = $5,
                          repair_required = $6, status = CASE WHEN $6 THEN 'repair' ELSE status END, updated_at = now()
       WHERE id = $1 RETURNING id, visit_required, visit_scheduled_at, purchase_required, erp_request_numbers, repair_required, status`,
      [id, required, required ? scheduledAt : null, purchaseRequired, erpRequestNumbers, repairRequired],
    );
    for (const number of addedNumbers) {
      await this.database.query(
        `INSERT INTO ticket_comments (ticket_id, author_id, body)
         VALUES ($1, $2, $3)`,
        [id, this.systemAuthorId, `Создана заявка на приобретение №${number}`],
      );
    }
    return { ticket: result.rows[0] };
  }

  async addComment(id: string, input: { body?: string; authorId?: string }) {
    const body = String(input.body ?? '').trim();
    const authorId = String(input.authorId ?? '00000000-0000-0000-0000-000000000001').trim();
    if (!body) throw new BadRequestException('Комментарий не может быть пустым');
    const ticket = await this.database.query('SELECT id FROM tickets WHERE id = $1', [id]);
    if (!ticket.rows[0]) throw new NotFoundException('Тикет не найден');
    const result = await this.database.query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, body, created_at`, [id, authorId, body],
    );
    return { comment: result.rows[0] };
  }

  async createDocument(input: { userId?: string; subject?: string; description?: string; ticketTypeId?: string; ticketKindId?: string; equipmentId?: string }) {
    const userId = String(input.userId ?? '').trim();
    const subject = String(input.subject ?? '').trim();
    const description = String(input.description ?? '').trim();
    if (!userId || !subject) throw new BadRequestException('Пользователь и тема обращения обязательны');
    const user = await this.database.query<{ id: string; display_name: string; email: string }>(
      'SELECT id, display_name, email FROM users WHERE id = $1 AND is_active = true', [userId],
    );
    if (!user.rows[0]) throw new NotFoundException('Пользователь не найден');
    const typeId = String(input.ticketTypeId ?? '').trim();
    const kindId = String(input.ticketKindId ?? '').trim();
    const equipmentId = String(input.equipmentId ?? '').trim();
    const kind = kindId ? await this.database.query<{ code: string; name: string }>('SELECT tk.code, tk.name FROM ticket_kinds tk WHERE tk.id = $1 AND tk.ticket_type_id = $2 AND tk.is_active = true', [kindId, typeId]) : { rows: [] };
    const type = typeId ? await this.database.query<{ name: string }>('SELECT name FROM ticket_types WHERE id = $1 AND is_active = true', [typeId]) : { rows: [] };
    const equipmentRequired = kind.rows[0]?.code === 'repair' || type.rows[0]?.name === 'Запрос на обслуживание';
    if (equipmentRequired && !equipmentId) throw new BadRequestException('Для запроса на обслуживание выберите оборудование');
    if (equipmentId) {
      const equipment = await this.database.query('SELECT id FROM equipment_items WHERE id = $1 AND is_active = true', [equipmentId]);
      if (!equipment.rows[0]) throw new NotFoundException('Оборудование не найдено');
    }
    const ticket = await this.database.query(
      `INSERT INTO tickets (created_by, subject, description, ticket_type_id, ticket_kind_id, equipment_id, status)
       VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, '')::uuid, NULLIF($5, '')::uuid, NULLIF($6, ''), 'new')
       RETURNING id, number, subject, description, status, created_at`,
      [userId, subject, description, typeId, kindId, equipmentId],
    );
    return { ticket: { ...ticket.rows[0], requester_name: user.rows[0].display_name, requester_email: user.rows[0].email } };
  }
}
