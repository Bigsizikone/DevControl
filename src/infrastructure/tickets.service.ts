import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { parseNonNegativeHours, validateDevelopmentDates } from './development.rules';

type DevelopmentTaskInput = {
  title?: string; description?: string | null; analystId?: string | null; developerId?: string | null;
  developmentStartDate?: string | null; releaseDate?: string | null; plannedReleaseDate?: string | null; actualReleaseDate?: string | null;
  analyticsHours?: number | string | null; developmentHours?: number | string | null; plannedHours?: number | string | null; totalHours?: number | string | null;
  priority?: number | string | null;
};

export type DevelopmentFilters = {
  boardId?: string; analystId?: string; developerId?: string; watcherId?: string; status?: string;
  startDate?: string; releaseDate?: string; rootTicketId?: string; hasSubtasks?: string; mine?: string; q?: string; actorId?: string;
};

@Injectable()
export class TicketsService {
  private readonly systemAuthorId = '00000000-0000-0000-0000-000000000001';
  constructor(private readonly database: DatabaseService) {}

  async listUsers() {
    const result = await this.database.query<{ id: string; display_name: string; email: string }>('SELECT id, display_name, email FROM users WHERE is_active = true ORDER BY display_name');
    return { users: result.rows };
  }

  async listCatalog() {
    const [types, kinds, equipment, developmentBoards] = await Promise.all([
      this.database.query<{ id: string; code: string; name: string; is_default: boolean }>('SELECT id, code, name, is_default FROM ticket_types WHERE is_active = true ORDER BY is_default DESC, name'),
      this.database.query('SELECT id, ticket_type_id, system_id, code, name FROM ticket_kinds WHERE is_active = true ORDER BY name'),
      this.database.query("SELECT id, inventory_number, name, status FROM equipment_items WHERE is_active = true AND status <> 'written_off' ORDER BY inventory_number"),
      this.listDevelopmentBoards(),
    ]);
    const defaultType = types.rows.find((item: { id: string; is_default?: boolean; name: string }) => item.is_default && item.name === 'Запрос на обслуживание') ?? types.rows.find((item: { id: string; is_default?: boolean }) => item.is_default);
    return { types: types.rows, kinds: kinds.rows, equipment: equipment.rows, developmentBoards, defaultTypeId: defaultType?.id ?? null };
  }

  async listDevelopmentBoards() {
    const result = await this.database.query(`SELECT db.id, db.code, db.name, db.status, db.description, db.system_id, s.name AS system_name FROM development_boards db JOIN systems s ON s.id = db.system_id AND s.is_active = true WHERE db.is_active = true AND db.status = 'Ведется разработка функционала' ORDER BY db.name`);
    return result.rows;
  }

  async listDevelopmentStatuses() {
    const result = await this.database.query(`SELECT code AS id, code, name, sort_order, is_active, is_final FROM development_statuses WHERE is_active = true ORDER BY sort_order, name`);
    return { statuses: result.rows };
  }

  async listDevelopmentUsers(roleCode: string, search?: string) {
    const allowedRole = roleCode === 'analyst' || roleCode === 'developer' ? roleCode : '';
    if (!allowedRole) throw new BadRequestException('Неизвестная роль разработки');
    const params: unknown[] = [allowedRole];
    const filter = search?.trim() ? (params.push(`%${search.trim()}%`), `AND (u.display_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`) : '';
    const result = await this.database.query(`SELECT u.id, u.display_name, u.email, d.name AS department_name FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id AND r.code = $1 AND r.is_active = true LEFT JOIN departments d ON d.id = u.department_id WHERE u.is_active = true ${filter} ORDER BY u.display_name LIMIT 20`, params);
    return { users: result.rows };
  }

  async listDocuments(options: { developmentOnly?: boolean; boardId?: string } = {}) {
    if (options.developmentOnly) return this.listDevelopmentTasks({ boardId: options.boardId });
    const result = await this.database.query(`
      SELECT t.id, t.number, t.subject, t.description, t.status, t.created_at, t.visit_required, t.visit_scheduled_at,
             t.purchase_required, t.erp_request_numbers, t.repair_required, t.equipment_id, t.development_required,
             ds.name AS development_status, dc.status AS development_status_code, t.development_board_id,
             dc.id AS development_card_id, dc.number AS development_card_number, dc.code AS development_card_code,
             dc.title AS development_card_title, dc.description AS development_card_description,
             db.name AS development_board_name, db.system_id AS development_system_id, systems.name AS development_system_name,
             tt.name AS ticket_type_name, tk.name AS ticket_kind_name, equipment.inventory_number AS equipment_inventory_number,
             equipment.name AS equipment_name, u.display_name AS requester_name, u.email AS requester_email, assignee.display_name AS assignee_name
      FROM tickets t JOIN users u ON u.id = t.created_by LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
      LEFT JOIN ticket_kinds tk ON tk.id = t.ticket_kind_id LEFT JOIN development_boards db ON db.id = t.development_board_id
      LEFT JOIN systems ON systems.id = db.system_id LEFT JOIN development_cards dc ON dc.ticket_id = t.id AND dc.parent_task_id IS NULL
      LEFT JOIN development_statuses ds ON ds.code = dc.status LEFT JOIN equipment_items equipment ON equipment.id::text = t.equipment_id
      LEFT JOIN users assignee ON assignee.id = t.assignee_id ORDER BY t.created_at DESC LIMIT 100`);
    return { tickets: result.rows };
  }

  async listDevelopmentDocuments(boardId?: string, filters: Omit<DevelopmentFilters, 'boardId'> = {}, actorId?: string) { return this.listDevelopmentTasks({ ...filters, boardId, actorId }); }

  async getDocument(id: string) {
    const ticket = await this.database.query(`
      SELECT t.id, t.number, t.subject, t.description, t.status, t.priority, t.created_at, t.visit_required, t.visit_scheduled_at,
             t.purchase_required, t.erp_request_numbers, t.repair_required, t.equipment_id, t.development_required,
             ds.name AS development_status, dc.status AS development_status_code, t.development_board_id,
             dc.id AS development_card_id, dc.number AS development_card_number, dc.code AS development_card_code,
             dc.title AS development_card_title, dc.description AS development_card_description, db.name AS development_board_name,
             db.system_id AS development_system_id, systems.name AS development_system_name, tt.name AS ticket_type_name,
             tk.name AS ticket_kind_name, equipment.inventory_number AS equipment_inventory_number, equipment.name AS equipment_name,
             u.display_name AS requester_name, u.email AS requester_email, assignee.display_name AS assignee_name
      FROM tickets t JOIN users u ON u.id = t.created_by LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
      LEFT JOIN ticket_kinds tk ON tk.id = t.ticket_kind_id LEFT JOIN development_boards db ON db.id = t.development_board_id
      LEFT JOIN systems ON systems.id = db.system_id LEFT JOIN development_cards dc ON dc.ticket_id = t.id AND dc.parent_task_id IS NULL
      LEFT JOIN development_statuses ds ON ds.code = dc.status LEFT JOIN equipment_items equipment ON equipment.id::text = t.equipment_id
      LEFT JOIN users assignee ON assignee.id = t.assignee_id WHERE t.id = $1`, [id]);
    if (!ticket.rows[0]) throw new NotFoundException('Обращение не найдено');
    const comments = await this.database.query(`SELECT c.id, c.body, c.created_at, u.display_name AS author_name FROM ticket_comments c JOIN users u ON u.id = c.author_id WHERE c.ticket_id = $1 ORDER BY c.created_at ASC`, [id]);
    return { ticket: { ...ticket.rows[0], comments: comments.rows } };
  }

  async updateDocument(id: string, input: { visitRequired?: boolean; visitScheduledAt?: string | null; purchaseRequired?: boolean; erpRequestNumbers?: string[]; repairRequired?: boolean }) {
    const required = Boolean(input.visitRequired); const scheduledAt = input.visitScheduledAt ? new Date(input.visitScheduledAt) : null;
    if (required && (!scheduledAt || Number.isNaN(scheduledAt.getTime()))) throw new BadRequestException('Укажите дату и время выезда');
    const purchaseRequired = Boolean(input.purchaseRequired); const repairRequired = Boolean(input.repairRequired);
    const erpRequestNumbers = [...new Set((input.erpRequestNumbers ?? []).map((value) => String(value).trim()).filter(Boolean))];
    if (erpRequestNumbers.some((value) => value.length > 20)) throw new BadRequestException('Номер заявки ERP не должен превышать 20 символов');
    if (purchaseRequired && erpRequestNumbers.length === 0) throw new BadRequestException('Укажите хотя бы один номер заявки ERP');
    const current = await this.database.query<{ id: string; erp_request_numbers: string[] | null }>('SELECT id, erp_request_numbers FROM tickets WHERE id = $1', [id]);
    if (!current.rows[0]) throw new NotFoundException('Обращение не найдено');
    const previousNumbers = current.rows[0].erp_request_numbers ?? []; const addedNumbers = purchaseRequired ? erpRequestNumbers.filter((number) => !previousNumbers.includes(number)) : [];
    const result = await this.database.query(`UPDATE tickets SET visit_required = $2, visit_scheduled_at = $3, purchase_required = $4, erp_request_numbers = $5, repair_required = $6, status = CASE WHEN $6 THEN 'repair' ELSE status END, updated_at = now() WHERE id = $1 RETURNING id, visit_required, visit_scheduled_at, purchase_required, erp_request_numbers, repair_required, status`, [id, required, required ? scheduledAt : null, purchaseRequired, erpRequestNumbers, repairRequired]);
    for (const number of addedNumbers) await this.database.query(`INSERT INTO ticket_comments (ticket_id, author_id, body) VALUES ($1, $2, $3)`, [id, this.systemAuthorId, `Создана заявка на приобретение №${number}`]);
    return { ticket: result.rows[0] };
  }

  async addComment(id: string, input: { body?: string; authorId?: string }) {
    const body = String(input.body ?? '').trim(); const authorId = String(input.authorId ?? this.systemAuthorId).trim();
    if (!body) throw new BadRequestException('Комментарий не может быть пустым');
    const ticket = await this.database.query('SELECT id FROM tickets WHERE id = $1', [id]); if (!ticket.rows[0]) throw new NotFoundException('Обращение не найдено');
    const result = await this.database.query(`INSERT INTO ticket_comments (ticket_id, author_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at`, [id, authorId, body]); return { comment: result.rows[0] };
  }

  async createDocument(input: { userId?: string; subject?: string; description?: string; ticketTypeId?: string; ticketKindId?: string; equipmentId?: string; developmentRequired?: boolean; developmentBoardId?: string }) {
    const userId = String(input.userId ?? '').trim(); const subject = String(input.subject ?? '').trim(); const description = String(input.description ?? '').trim();
    if (!userId || !subject) throw new BadRequestException('Пользователь и тема обращения обязательны');
    const user = await this.database.query<{ id: string; display_name: string; email: string }>('SELECT id, display_name, email FROM users WHERE id = $1 AND is_active = true', [userId]); if (!user.rows[0]) throw new NotFoundException('Пользователь не найден');
    const typeId = String(input.ticketTypeId ?? '').trim(); const kindId = String(input.ticketKindId ?? '').trim(); const equipmentId = String(input.equipmentId ?? '').trim(); const developmentRequired = Boolean(input.developmentRequired); const developmentBoardId = String(input.developmentBoardId ?? '').trim();
    const kind = kindId ? await this.database.query<{ code: string; name: string; system_id: string | null }>('SELECT tk.code, tk.name, tk.system_id FROM ticket_kinds tk WHERE tk.id = $1 AND tk.ticket_type_id = $2 AND tk.is_active = true', [kindId, typeId]) : { rows: [] };
    const type = typeId ? await this.database.query<{ name: string }>('SELECT name FROM ticket_types WHERE id = $1 AND is_active = true', [typeId]) : { rows: [] }; const equipmentRequired = kind.rows[0]?.code === 'repair' || type.rows[0]?.name === 'Запрос на обслуживание';
    if (equipmentRequired && !equipmentId) throw new BadRequestException('Для запроса на обслуживание выберите оборудование');
    if (equipmentId && !(await this.database.query('SELECT id FROM equipment_items WHERE id = $1 AND is_active = true', [equipmentId])).rows[0]) throw new NotFoundException('Оборудование не найдено');
    if (developmentRequired) {
      if (!kind.rows[0]?.system_id) throw new BadRequestException('Для обращения на разработку укажите вид заявки с системой');
      const board = await this.database.query<{ id: string }>("SELECT db.id FROM development_boards db WHERE db.id = $1 AND db.is_active = true AND db.status = 'Ведется разработка функционала' AND db.system_id = $2 AND EXISTS (SELECT 1 FROM systems s WHERE s.id = db.system_id AND s.is_active = true)", [developmentBoardId, kind.rows[0].system_id]); if (!board.rows[0]) throw new BadRequestException('Выберите доску разработки со статусом «Ведется разработка функционала»');
    }
    const ticket = await this.database.query(`INSERT INTO tickets (created_by, subject, description, ticket_type_id, ticket_kind_id, equipment_id, development_required, development_board_id, status) VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, '')::uuid, NULLIF($5, '')::uuid, NULLIF($6, ''), $7, NULLIF($8, '')::uuid, 'new') RETURNING id, number, subject, description, status, created_at`, [userId, subject, description, typeId, kindId, equipmentId, developmentRequired, developmentRequired ? developmentBoardId : '']);
    if (developmentRequired && ticket.rows[0] && kind.rows[0]?.system_id) { const card = await this.database.query<{ id: string }>(`INSERT INTO development_cards (ticket_id, board_id, system_id, title, description, created_by) VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6) RETURNING id`, [ticket.rows[0].id, developmentBoardId, kind.rows[0].system_id, subject, description, this.systemAuthorId]); await this.database.query(`UPDATE development_cards SET root_task_id = id WHERE id = $1`, [card.rows[0].id]); await this.writeAudit(this.systemAuthorId, 'create', card.rows[0].id, null, { status: 'backlog', title: subject }, 'Создание карточки разработки из обращения'); }
    return { ticket: { ...ticket.rows[0], requester_name: user.rows[0].display_name, requester_email: user.rows[0].email } };
  }

  async listDevelopmentTasks(filters: DevelopmentFilters = {}) {
    const params: unknown[] = []; const conditions: string[] = ["db.status = 'Ведется разработка функционала'", 'db.is_active = true', 's.is_active = true', 't.development_required = true'];
    const add = (value: unknown, expression: string) => { params.push(value); conditions.push(expression.replace('?', `$${params.length}`)); };
    if (filters.boardId) add(filters.boardId, 'dc.board_id = ?'); if (filters.analystId) add(filters.analystId, 'dc.analyst_id = ?'); if (filters.developerId) add(filters.developerId, 'dc.developer_id = ?'); if (filters.status) add(filters.status, 'dc.status = ?'); if (filters.startDate) add(filters.startDate, 'dc.development_start_date >= ?'); if (filters.releaseDate) add(filters.releaseDate, 'dc.release_date <= ?'); if (filters.rootTicketId?.trim()) { params.push(`%${filters.rootTicketId.trim()}%`); const n = params.length; conditions.push(`(('SD-' || t.number::text) ILIKE $${n} OR dc.ticket_id::text ILIKE $${n})`); }
    if (filters.q?.trim()) { params.push(`%${filters.q.trim()}%`); const n = params.length; conditions.push(`(dc.code ILIKE $${n} OR dc.title ILIKE $${n} OR ('SD-' || t.number::text) ILIKE $${n})`); }
    if (filters.watcherId) { params.push(filters.watcherId); conditions.push(`EXISTS (SELECT 1 FROM development_task_watchers dwf WHERE dwf.task_id = dc.id AND dwf.user_id = $${params.length})`); }
    if (filters.hasSubtasks === 'true') conditions.push('EXISTS (SELECT 1 FROM development_cards childf WHERE childf.parent_task_id = dc.id)'); if (filters.hasSubtasks === 'false') conditions.push('NOT EXISTS (SELECT 1 FROM development_cards childf WHERE childf.parent_task_id = dc.id)');
    if (filters.mine === 'true' && filters.actorId) { params.push(filters.actorId); const n = params.length; conditions.push(`(dc.analyst_id = $${n} OR dc.developer_id = $${n} OR EXISTS (SELECT 1 FROM development_task_watchers dwm WHERE dwm.task_id = dc.id AND dwm.user_id = $${n}))`); }
    const result = await this.database.query(`SELECT dc.id, dc.number, dc.code, dc.title, dc.description, dc.status AS development_status_code, ds.name AS development_status, dc.priority, dc.development_start_date, dc.release_date, dc.planned_release_date, dc.actual_release_date, dc.analytics_hours, dc.development_hours, dc.planned_hours, dc.total_hours, dc.parent_task_id, dc.root_task_id, dc.ticket_id, t.number AS ticket_number, t.subject AS ticket_subject, t.status AS ticket_status, db.id AS board_id, db.name AS development_board_name, s.id AS system_id, s.name AS development_system_name, requester.display_name AS requester_name, requester.email AS requester_email, analyst.display_name AS analyst_name, analyst.email AS analyst_email, developer.display_name AS developer_name, developer.email AS developer_email, parent.code AS parent_code, parent.title AS parent_title, (SELECT count(*)::int FROM development_cards child WHERE child.parent_task_id = dc.id) AS subtask_count, (SELECT count(*)::int FROM development_cards child WHERE child.parent_task_id = dc.id AND child.status = 'closed') AS completed_subtask_count FROM development_cards dc JOIN development_boards db ON db.id = dc.board_id JOIN systems s ON s.id = dc.system_id JOIN development_statuses ds ON ds.code = dc.status JOIN tickets t ON t.id = dc.ticket_id JOIN users requester ON requester.id = t.created_by LEFT JOIN users analyst ON analyst.id = dc.analyst_id LEFT JOIN users developer ON developer.id = dc.developer_id LEFT JOIN development_cards parent ON parent.id = dc.parent_task_id WHERE ${conditions.join(' AND ')} ORDER BY ds.sort_order, dc.parent_task_id NULLS FIRST, dc.updated_at DESC LIMIT 500`, params);
    return { tasks: result.rows, tickets: result.rows };
  }

  async getDevelopmentTask(id: string, actorId?: string, role?: string) {
    await this.requireDevelopmentPermission('development.read', actorId, role);
    const task = await this.database.query(`SELECT dc.id, dc.number, dc.code, dc.title, dc.description, dc.status AS development_status_code, ds.name AS development_status, dc.priority, dc.development_start_date, dc.release_date, dc.planned_release_date, dc.actual_release_date, dc.analytics_hours, dc.development_hours, dc.planned_hours, dc.total_hours, dc.parent_task_id, dc.root_task_id, dc.ticket_id, db.id AS board_id, db.name AS development_board_name, s.id AS system_id, s.name AS development_system_name, t.number AS ticket_number, t.subject AS ticket_subject, t.status AS ticket_status, requester.display_name AS requester_name, requester.email AS requester_email, analyst.id AS analyst_id, analyst.display_name AS analyst_name, analyst.email AS analyst_email, developer.id AS developer_id, developer.display_name AS developer_name, developer.email AS developer_email, parent.code AS parent_code, parent.title AS parent_title, (SELECT count(*)::int FROM development_cards child WHERE child.parent_task_id = dc.id) AS subtask_count, (SELECT count(*)::int FROM development_cards child WHERE child.parent_task_id = dc.id AND child.status = 'closed') AS completed_subtask_count FROM development_cards dc JOIN development_boards db ON db.id = dc.board_id JOIN systems s ON s.id = dc.system_id JOIN development_statuses ds ON ds.code = dc.status JOIN tickets t ON t.id = dc.ticket_id JOIN users requester ON requester.id = t.created_by LEFT JOIN users analyst ON analyst.id = dc.analyst_id LEFT JOIN users developer ON developer.id = dc.developer_id LEFT JOIN development_cards parent ON parent.id = dc.parent_task_id WHERE dc.id = $1`, [id]);
    if (!task.rows[0]) throw new NotFoundException('Карточка разработки не найдена');
    const [subtasks, comments, watchers, audit] = await Promise.all([
      this.database.query(`SELECT dc.id, dc.number, dc.code, dc.title, ds.name AS development_status, dc.status AS development_status_code, dc.planned_hours, dc.total_hours, analyst.display_name AS analyst_name, developer.display_name AS developer_name FROM development_cards dc JOIN development_statuses ds ON ds.code = dc.status LEFT JOIN users analyst ON analyst.id = dc.analyst_id LEFT JOIN users developer ON developer.id = dc.developer_id WHERE dc.parent_task_id = $1 ORDER BY dc.number`, [id]),
      this.database.query(`SELECT c.id, c.comment, c.created_at, c.updated_at, c.author_id, u.display_name AS author_name FROM development_task_comments c JOIN users u ON u.id = c.author_id WHERE c.task_id = $1 AND c.deleted_at IS NULL ORDER BY c.created_at ASC`, [id]),
      this.database.query(`SELECT w.id, w.user_id, w.created_at, u.display_name, u.email, d.name AS department_name FROM development_task_watchers w JOIN users u ON u.id = w.user_id LEFT JOIN departments d ON d.id = u.department_id WHERE w.task_id = $1 ORDER BY u.display_name`, [id]),
      this.database.query(`SELECT a.id, a.occurred_at, a.action, a.resource_id, a.before_data, a.after_data, a.reason, u.display_name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.resource_type = 'development_task' AND a.resource_id = $1 ORDER BY a.occurred_at DESC LIMIT 100`, [id]),
    ]);
    return { task: { ...task.rows[0], subtasks: subtasks.rows, comments: comments.rows, watchers: watchers.rows, audit: audit.rows } };
  }

  async createDevelopmentTask(input: { ticketId?: string; boardId?: string; systemId?: string; title?: string; description?: string; actorId?: string; role?: string }) {
    const actorId = await this.resolveActor(input.actorId); await this.requireDevelopmentPermission('development.update', actorId, input.role);
    const ticketId = String(input.ticketId ?? '').trim(); const boardId = String(input.boardId ?? '').trim(); const title = String(input.title ?? '').trim(); if (!ticketId || !boardId || !title) throw new BadRequestException('Обращение, доска и наименование обязательны');
    const source = await this.database.query<{ number: number }>('SELECT number FROM tickets WHERE id = $1', [ticketId]); if (!source.rows[0]) throw new NotFoundException('Головное обращение не найдено');
    const board = await this.database.query<{ id: string; system_id: string }>("SELECT id, system_id FROM development_boards WHERE id = $1 AND is_active = true AND status = 'Ведется разработка функционала'", [boardId]); if (!board.rows[0] || (input.systemId && input.systemId !== board.rows[0].system_id)) throw new BadRequestException('Доска разработки недоступна для выбранной системы');
    await this.database.query(`UPDATE tickets SET development_required = true, development_board_id = $2, development_status = 'backlog', updated_at = now() WHERE id = $1`, [ticketId, boardId]);
    const result = await this.database.query<{ id: string }>(`INSERT INTO development_cards (ticket_id, board_id, system_id, title, description, created_by, root_task_id) VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, NULL) RETURNING id`, [ticketId, boardId, board.rows[0].system_id, title, String(input.description ?? '').trim(), actorId]); await this.database.query(`UPDATE development_cards SET root_task_id = id WHERE id = $1`, [result.rows[0].id]); await this.writeAudit(actorId, 'create', result.rows[0].id, null, { status: 'backlog', title }, 'Создание карточки разработки через API'); return this.getDevelopmentTask(result.rows[0].id, actorId, input.role);
  }

  async updateDevelopmentTask(id: string, input: DevelopmentTaskInput, actorIdInput?: string, role?: string) {
    const actorId = await this.resolveActor(actorIdInput); await this.requireDevelopmentPermission('development.update', actorId, role); const current = await this.database.query<Record<string, unknown>>('SELECT * FROM development_cards WHERE id = $1', [id]); if (!current.rows[0]) throw new NotFoundException('Карточка разработки не найдена'); const before = current.rows[0];
    if (input.analystId !== undefined) await this.validateRoleUser(input.analystId, 'analyst', 'Аналитик'); if (input.developerId !== undefined) await this.validateRoleUser(input.developerId, 'developer', 'Разработчик'); const start = input.developmentStartDate === undefined ? before.development_start_date : input.developmentStartDate; const release = input.releaseDate === undefined ? before.release_date : input.releaseDate; validateDevelopmentDates(start, release);
    const updates: Record<string, unknown> = {}; const map: Array<[keyof DevelopmentTaskInput, string]> = [['title', 'title'], ['description', 'description'], ['analystId', 'analyst_id'], ['developerId', 'developer_id'], ['developmentStartDate', 'development_start_date'], ['releaseDate', 'release_date'], ['plannedReleaseDate', 'planned_release_date'], ['actualReleaseDate', 'actual_release_date'], ['analyticsHours', 'analytics_hours'], ['developmentHours', 'development_hours'], ['plannedHours', 'planned_hours'], ['totalHours', 'total_hours'], ['priority', 'priority']]; for (const [inputKey, column] of map) if (input[inputKey] !== undefined) updates[column] = input[inputKey] === '' ? null : input[inputKey];
    if (updates.title !== undefined && !String(updates.title ?? '').trim()) throw new BadRequestException('Наименование карточки не может быть пустым'); for (const [key, label] of [['analytics_hours', 'Количество часов аналитики'], ['development_hours', 'Количество часов разработки'], ['planned_hours', 'Количество часов план'], ['total_hours', 'Количество часов итого']] as const) if (updates[key] !== undefined) updates[key] = parseNonNegativeHours(updates[key], label); if (updates.priority !== undefined && (!Number.isInteger(Number(updates.priority)) || Number(updates.priority) < 1 || Number(updates.priority) > 5)) throw new BadRequestException('Приоритет должен быть целым числом от 1 до 5');
    const keys = Object.keys(updates); if (keys.length === 0) return this.getDevelopmentTask(id, actorId, role); const values = keys.map((key) => updates[key]); const set = keys.map((key, index) => `"${key}" = $${index + 2}`).join(', '); const result = await this.database.query(`UPDATE development_cards SET ${set}, updated_at = now() WHERE id = $1 RETURNING id`, [id, ...values]); await this.writeFieldAudits(actorId, id, before, { ...before, ...updates }, keys, 'update'); return this.getDevelopmentTask(result.rows[0].id, actorId, role);
  }

  async updateDevelopmentStatus(id: string, status: string, actorIdInput?: string, role?: string) {
    const actorId = await this.resolveActor(actorIdInput); await this.requireDevelopmentPermission('development.status', actorId, role); const current = await this.database.query<Record<string, unknown>>('SELECT * FROM development_cards WHERE id = $1', [id]); if (!current.rows[0]) throw new NotFoundException('Карточка разработки не найдена'); const next = await this.database.query<{ code: string; name: string; allowed_next_codes: string[] }>('SELECT code, name, allowed_next_codes FROM development_statuses WHERE code = $1 AND is_active = true', [status]); if (!next.rows[0]) throw new BadRequestException('Статус разработки не найден или отключен'); const before = current.rows[0];
    const currentStatus = await this.database.query<{ allowed_next_codes: string[] }>('SELECT allowed_next_codes FROM development_statuses WHERE code = $1', [before.status]); const allowedNext = currentStatus.rows[0]?.allowed_next_codes ?? []; if (allowedNext.length > 0 && !allowedNext.includes(status)) throw new BadRequestException('Переход в выбранный статус недоступен');
    const result = await this.database.query(`UPDATE development_cards SET status = $2, development_start_date = CASE WHEN $2 = 'development' AND development_start_date IS NULL THEN CURRENT_DATE ELSE development_start_date END, updated_at = now() WHERE id = $1 RETURNING id`, [id, status]); await this.database.query(`UPDATE tickets SET development_status = $2, updated_at = now() WHERE id = (SELECT ticket_id FROM development_cards WHERE id = $1) AND (SELECT parent_task_id FROM development_cards WHERE id = $1) IS NULL`, [id, status]); await this.writeAudit(actorId, 'status_change', id, { status: before.status }, { status }, 'Перемещение карточки по Kanban'); return this.getDevelopmentTask(result.rows[0].id, actorId, role);
  }

  async createSubtask(parentId: string, input: { title?: string; description?: string; actorId?: string; role?: string }) {
    const actorId = await this.resolveActor(input.actorId); await this.requireDevelopmentPermission('development.subtask', actorId, input.role); const parent = await this.database.query<{ id: string; board_id: string; system_id: string; ticket_id: string; root_task_id: string | null }>('SELECT id, board_id, system_id, ticket_id, root_task_id FROM development_cards WHERE id = $1', [parentId]); if (!parent.rows[0]) throw new NotFoundException('Родительская карточка не найдена'); const ticket = await this.database.query<{ number: number }>('SELECT number FROM tickets WHERE id = $1', [parent.rows[0].ticket_id]); const title = String(input.title ?? '').trim() || `Родительская задача №SD-${ticket.rows[0]?.number ?? ''}`; const rootTaskId = parent.rows[0].root_task_id ?? parent.rows[0].id;
    const result = await this.database.query<{ id: string }>(`INSERT INTO development_cards (ticket_id, board_id, system_id, title, description, created_by, parent_task_id, root_task_id, status) VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7, $8, 'backlog') RETURNING id`, [parent.rows[0].ticket_id, parent.rows[0].board_id, parent.rows[0].system_id, title, String(input.description ?? '').trim(), actorId, parentId, rootTaskId]); await this.writeAudit(actorId, 'create_subtask', result.rows[0].id, null, { parent_task_id: parentId, root_task_id: rootTaskId, status: 'backlog', title }, 'Создание подзадачи'); return this.getDevelopmentTask(result.rows[0].id, actorId, input.role);
  }

  async addDevelopmentComment(taskId: string, bodyInput: string, actorIdInput?: string, role?: string) {
    const actorId = await this.resolveActor(actorIdInput); await this.requireDevelopmentPermission('development.comment', actorId, role); const comment = String(bodyInput ?? '').trim(); if (!comment) throw new BadRequestException('Комментарий не может быть пустым'); if (comment.length > 500) throw new BadRequestException('Комментарий не должен превышать 500 символов'); if (!(await this.database.query('SELECT id FROM development_cards WHERE id = $1', [taskId])).rows[0]) throw new NotFoundException('Карточка разработки не найдена'); const result = await this.database.query(`INSERT INTO development_task_comments (task_id, author_id, comment) VALUES ($1, $2, $3) RETURNING id, comment, created_at, updated_at`, [taskId, actorId, comment]); await this.writeAudit(actorId, 'comment_create', taskId, null, { comment_id: result.rows[0].id, comment }, 'Добавление комментария'); return { comment: result.rows[0] };
  }

  async updateDevelopmentComment(taskId: string, commentId: string, bodyInput: string, actorIdInput?: string, role?: string) {
    const actorId = await this.resolveActor(actorIdInput); await this.requireDevelopmentPermission('development.comment.edit', actorId, role); const comment = String(bodyInput ?? '').trim(); if (!comment || comment.length > 500) throw new BadRequestException('Комментарий должен содержать от 1 до 500 символов'); const current = await this.database.query<{ id: string; author_id: string; comment: string }>('SELECT id, author_id, comment FROM development_task_comments WHERE id = $1 AND task_id = $2 AND deleted_at IS NULL', [commentId, taskId]); if (!current.rows[0]) throw new NotFoundException('Комментарий не найден'); if (current.rows[0].author_id !== actorId && role !== 'admin') throw new ForbiddenException('Редактировать можно только свой комментарий'); const result = await this.database.query(`UPDATE development_task_comments SET comment = $3, updated_at = now() WHERE id = $1 AND task_id = $2 RETURNING id, comment, created_at, updated_at`, [commentId, taskId, comment]); await this.writeAudit(actorId, 'comment_update', taskId, { comment_id: commentId, comment: current.rows[0].comment }, { comment_id: commentId, comment }, 'Редактирование комментария'); return { comment: result.rows[0] };
  }

  async deleteDevelopmentComment(taskId: string, commentId: string, actorIdInput?: string, role?: string) {
    const actorId = await this.resolveActor(actorIdInput); await this.requireDevelopmentPermission('development.comment.edit', actorId, role); const current = await this.database.query<{ author_id: string; comment: string }>('SELECT author_id, comment FROM development_task_comments WHERE id = $1 AND task_id = $2 AND deleted_at IS NULL', [commentId, taskId]); if (!current.rows[0]) throw new NotFoundException('Комментарий не найден'); if (current.rows[0].author_id !== actorId && role !== 'admin') throw new ForbiddenException('Удалять можно только свой комментарий'); await this.database.query(`UPDATE development_task_comments SET deleted_at = now(), updated_at = now() WHERE id = $1 AND task_id = $2`, [commentId, taskId]); await this.writeAudit(actorId, 'comment_delete', taskId, { comment_id: commentId, comment: current.rows[0].comment }, null, 'Удаление комментария'); return { deleted: true };
  }

  async addWatcher(taskId: string, userIdInput: string, actorIdInput?: string, role?: string) {
    const actorId = await this.resolveActor(actorIdInput); await this.requireDevelopmentPermission('development.watch', actorId, role); const userId = String(userIdInput ?? '').trim(); if (!(await this.database.query('SELECT id FROM users WHERE id = $1 AND is_active = true', [userId])).rows[0]) throw new NotFoundException('Наблюдатель не найден'); if (!(await this.database.query('SELECT id FROM development_cards WHERE id = $1', [taskId])).rows[0]) throw new NotFoundException('Карточка разработки не найдена'); if ((await this.database.query('SELECT id FROM development_task_watchers WHERE task_id = $1 AND user_id = $2', [taskId, userId])).rows[0]) throw new BadRequestException('Пользователь уже добавлен в наблюдатели'); const result = await this.database.query(`INSERT INTO development_task_watchers (task_id, user_id, created_by) VALUES ($1, $2, $3) RETURNING id, task_id, user_id, created_at`, [taskId, userId, actorId]); await this.writeAudit(actorId, 'watcher_add', taskId, null, { user_id: userId }, 'Добавление наблюдателя'); return { watcher: result.rows[0] };
  }

  async removeWatcher(taskId: string, userId: string, actorIdInput?: string, role?: string) { const actorId = await this.resolveActor(actorIdInput); await this.requireDevelopmentPermission('development.watch', actorId, role); const result = await this.database.query(`DELETE FROM development_task_watchers WHERE task_id = $1 AND user_id = $2 RETURNING id`, [taskId, userId]); if (!result.rows[0]) throw new NotFoundException('Наблюдатель не найден'); await this.writeAudit(actorId, 'watcher_remove', taskId, { user_id: userId }, null, 'Удаление наблюдателя'); return { deleted: true }; }

  private async validateRoleUser(userId: string | null | undefined, roleCode: 'analyst' | 'developer', label: string) { if (!userId) return; const result = await this.database.query('SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE u.id = $1 AND u.is_active = true AND r.code = $2 AND r.is_active = true', [userId, roleCode]); if (!result.rows[0]) throw new BadRequestException(`${label} должен иметь роль «${roleCode === 'analyst' ? 'Аналитик' : 'Разработчик'}»`); }
  private async resolveActor(actorId?: string) { if (!actorId?.trim()) return this.systemAuthorId; const result = await this.database.query('SELECT id FROM users WHERE id = $1 AND is_active = true', [actorId.trim()]); return result.rows[0] ? actorId.trim() : this.systemAuthorId; }
  private async requireDevelopmentPermission(permission: string, actorIdInput?: string, role?: string) { if (role === 'admin') return; const actorId = await this.resolveActor(actorIdInput); const result = await this.database.query(`SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.is_active = true JOIN role_permissions rp ON rp.role_id = r.id AND rp.effect = 'allow' JOIN permissions p ON p.id = rp.permission_id AND p.code = $2 WHERE ur.user_id = $1`, [actorId, permission]); if (!result.rows[0]) throw new ForbiddenException(`Недостаточно прав: ${permission}`); }
  private async writeAudit(actorId: string, action: string, id: string, beforeData: unknown, afterData: unknown, reason: string) { await this.database.query(`INSERT INTO audit_log (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data, reason) VALUES ($1, 'user', $2, 'development_task', $3, $4::jsonb, $5::jsonb, $6)`, [actorId, action, id, beforeData ? JSON.stringify(beforeData) : null, afterData ? JSON.stringify(afterData) : null, reason]); }
  private async writeFieldAudits(actorId: string, id: string, before: Record<string, unknown>, after: Record<string, unknown>, fields: string[], action: string) { for (const field of fields) if (String(before[field] ?? '') !== String(after[field] ?? '')) await this.writeAudit(actorId, action, id, { field, value: before[field] ?? null }, { field, value: after[field] ?? null }, `Изменение поля ${field}`); }
}
