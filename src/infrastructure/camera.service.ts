import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, extname, join, resolve } from 'node:path';
import { DatabaseService } from './database.service';
import { CameraEventBus, type CameraEventName } from '../domain/camera.events';

type CameraRole = 'operator' | 'senior_operator' | 'admin';
const cameraRoles: CameraRole[] = ['operator', 'senior_operator', 'admin'];
const shiftStatuses = ['planned', 'cancelled'] as const;
const recurrenceTypes = ['daily', 'weekdays', '2x2', '1x3', 'cycle', 'dates'] as const;
const attachmentTypes: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/x-msvideo': '.avi',
};

export type CameraContext = { role?: string; userId: string };

@Injectable()
export class CameraService {
  private readonly uploadRoot = resolve(process.env.CAMERA_UPLOAD_DIR ?? 'storage/camera-violations');

  constructor(private readonly database: DatabaseService, private readonly events: CameraEventBus) {}

  assertRole(context: CameraContext, allowed: CameraRole[] = cameraRoles) {
    if (!allowed.includes(context.role as CameraRole)) throw new ForbiddenException('Раздел «Видеокамеры» недоступен для этой роли');
  }

  async meta(context: CameraContext) {
    this.assertRole(context);
    const [employees, organizations, departments] = await Promise.all([
      this.database.query(`SELECT u.id, u.display_name, u.email, string_agg(r.name, ', ' ORDER BY r.name) AS role_name
        FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
        WHERE u.is_active = true AND r.code IN ('operator', 'senior_operator') GROUP BY u.id ORDER BY u.display_name`),
      this.database.query('SELECT id, name FROM organizations WHERE is_active = true ORDER BY name'),
      this.database.query('SELECT id, name, organization_id FROM departments WHERE is_active = true ORDER BY name'),
    ]);
    return { employees: employees.rows, organizations: organizations.rows, departments: departments.rows, roles: cameraRoles.map((code) => ({ code, name: code === 'senior_operator' ? 'Старший оператор' : code === 'operator' ? 'Оператор' : 'Администратор' })) };
  }

  async listSchedule(context: CameraContext, filters: Record<string, string | undefined>) {
    this.assertRole(context);
    const params: unknown[] = [];
    const where = ['s.deleted_at IS NULL'];
    const add = (value: unknown) => { params.push(value); return `$${params.length}`; };
    if (filters.periodStart) where.push(`s.work_date >= ${add(filters.periodStart)}::date`);
    if (filters.periodEnd) where.push(`s.work_date <= ${add(filters.periodEnd)}::date`);
    if (filters.employeeId) where.push(`s.employee_id = ${add(filters.employeeId)}::uuid`);
    if (filters.status) where.push(`s.status = ${add(filters.status)}`);
    if (context.role === 'operator') where.push(`s.employee_id = ${add(context.userId)}::uuid`);
    const result = await this.database.query(`SELECT s.*, u.display_name AS employee_name, u.email AS employee_email,
      COALESCE(string_agg(DISTINCT r.name, ', ' ORDER BY r.name), 'Оператор') AS role_name,
      CASE WHEN s.status = 'cancelled' THEN 'cancelled'
        WHEN (s.work_date + s.start_time) > now() THEN 'planned'
        WHEN (s.work_date + s.start_time) <= now() AND (s.work_date + s.end_time + CASE WHEN s.end_time <= s.start_time THEN interval '1 day' ELSE interval '0 day' END) > now() THEN 'current'
        ELSE 'completed' END AS calculated_status,
      EXTRACT(EPOCH FROM ((s.work_date + s.end_time + CASE WHEN s.end_time <= s.start_time THEN interval '1 day' ELSE interval '0 day' END) - (s.work_date + s.start_time))) / 60 AS duration_minutes
      FROM camera_work_shifts s JOIN users u ON u.id = s.employee_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
      WHERE ${where.join(' AND ')} GROUP BY s.id, u.id ORDER BY s.work_date, s.start_time, u.display_name`, params);
    return { shifts: result.rows };
  }

  async getSchedule(id: string, context: CameraContext) {
    const result = await this.database.query(`SELECT s.*, u.display_name AS employee_name, COALESCE(string_agg(DISTINCT r.name, ', ' ORDER BY r.name), 'Оператор') AS role_name,
      CASE WHEN s.status = 'cancelled' THEN 'cancelled' WHEN (s.work_date + s.start_time) > now() THEN 'planned' WHEN (s.work_date + s.end_time + CASE WHEN s.end_time <= s.start_time THEN interval '1 day' ELSE interval '0 day' END) > now() THEN 'current' ELSE 'completed' END AS calculated_status,
      EXTRACT(EPOCH FROM ((s.work_date + s.end_time + CASE WHEN s.end_time <= s.start_time THEN interval '1 day' ELSE interval '0 day' END) - (s.work_date + s.start_time))) / 60 AS duration_minutes
      FROM camera_work_shifts s JOIN users u ON u.id = s.employee_id LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
      WHERE s.id = $1 AND s.deleted_at IS NULL GROUP BY s.id, u.id`, [id]);
    const shift = result.rows[0];
    if (!shift) throw new NotFoundException('Смена не найдена');
    this.assertRole(context);
    if (context.role === 'operator' && shift.employee_id !== context.userId) throw new ForbiddenException('Оператор видит только собственные смены');
    return { shift };
  }

  async createSchedule(input: Record<string, unknown>, context: CameraContext) {
    this.assertRole(context, ['senior_operator', 'admin']);
    const data = this.validateShift(input);
    await this.assertEmployee(data.employeeId);
    const conflict = await this.findConflict(data);
    if (conflict) throw new BadRequestException('У сотрудника уже существует рабочая смена в указанное время.');
    const result = await this.database.query(`INSERT INTO camera_work_shifts (employee_id, work_date, start_time, end_time, status, object_name, comment, created_by)
      VALUES ($1, $2::date, $3::time, $4::time, $5, NULLIF($6, ''), NULLIF($7, ''), $8) RETURNING id`, [data.employeeId, data.workDate, data.startTime, data.endTime, data.status, data.objectName, data.comment, context.userId]);
    const id = String(result.rows[0].id);
    await this.audit(context.userId, 'create', 'camera_work_shift', id, null, data);
    this.emit('CameraShiftCreated', context.userId, id, data);
    return this.getSchedule(id, context);
  }

  async updateSchedule(id: string, input: Record<string, unknown>, context: CameraContext) {
    this.assertRole(context, ['senior_operator', 'admin']);
    const current = await this.getSchedule(id, context);
    const data = this.validateShift({ ...current.shift, ...input });
    const conflict = await this.findConflict(data, id);
    if (conflict) throw new BadRequestException('У сотрудника уже существует рабочая смена в указанное время.');
    await this.database.query(`UPDATE camera_work_shifts SET employee_id=$1, work_date=$2::date, start_time=$3::time, end_time=$4::time, status=$5, object_name=NULLIF($6, ''), comment=NULLIF($7, ''), updated_at=now() WHERE id=$8 AND deleted_at IS NULL`, [data.employeeId, data.workDate, data.startTime, data.endTime, data.status, data.objectName, data.comment, id]);
    await this.audit(context.userId, 'update', 'camera_work_shift', id, current.shift, data);
    this.emit('CameraShiftUpdated', context.userId, id, data);
    return this.getSchedule(id, context);
  }

  async deleteSchedule(id: string, context: CameraContext) {
    this.assertRole(context, ['senior_operator', 'admin']);
    const current = await this.getSchedule(id, context);
    await this.database.query('UPDATE camera_work_shifts SET deleted_at=now(), updated_at=now(), status=\'cancelled\' WHERE id=$1', [id]);
    await this.audit(context.userId, 'delete', 'camera_work_shift', id, current.shift, { status: 'cancelled' });
    this.emit('CameraShiftCancelled', context.userId, id, { status: 'cancelled' });
    return { deleted: true };
  }

  async generateSchedule(input: Record<string, unknown>, context: CameraContext) {
    this.assertRole(context, ['senior_operator', 'admin']);
    const employeeIds = Array.isArray(input.employeeIds) ? input.employeeIds.map(String).filter(Boolean) : [];
    if (!employeeIds.length) throw new BadRequestException('Выберите хотя бы одного оператора');
    const startDate = this.dateOnly(input.startDate, 'Дата начала обязательна');
    const endDate = this.dateOnly(input.endDate, 'Дата окончания обязательна');
    const startTime = String(input.startTime ?? '').trim();
    const endTime = String(input.endTime ?? '').trim();
    const recurrenceType = String(input.recurrenceType ?? 'daily');
    if (!recurrenceTypes.includes(recurrenceType as typeof recurrenceTypes[number])) throw new BadRequestException('Неизвестный тип повторения');
    if (!startTime || !endTime || startTime === endTime || endDate < startDate) throw new BadRequestException('Проверьте даты и время графика');
    const dates = this.recurrenceDates(startDate, endDate, recurrenceType, input.recurrenceConfig);
    const template = await this.database.query(`INSERT INTO camera_schedule_templates (name, employee_ids, recurrence_type, recurrence_config, start_date, end_date, start_time, end_time, object_name, comment, created_by)
      VALUES ($1, $2::uuid[], $3, $4::jsonb, $5::date, $6::date, $7::time, $8::time, NULLIF($9, ''), NULLIF($10, ''), $11) RETURNING id`, [String(input.name ?? 'Повторяющийся график'), employeeIds, recurrenceType, JSON.stringify(input.recurrenceConfig ?? {}), startDate, endDate, startTime, endTime, String(input.objectName ?? ''), String(input.comment ?? ''), context.userId]);
    const created: string[] = []; const conflicts: Array<{ employeeId: string; workDate: string }> = [];
    for (const employeeId of employeeIds) {
      await this.assertEmployee(employeeId);
      for (const workDate of dates) {
        const data = { employeeId, workDate, startTime, endTime, status: 'planned', objectName: String(input.objectName ?? ''), comment: String(input.comment ?? '') };
        if (await this.findConflict(data)) { conflicts.push({ employeeId, workDate }); continue; }
        const result = await this.database.query(`INSERT INTO camera_work_shifts (employee_id, work_date, start_time, end_time, status, object_name, comment, created_by) VALUES ($1,$2::date,$3::time,$4::time,'planned',NULLIF($5,''),NULLIF($6,''),$7) RETURNING id`, [employeeId, workDate, startTime, endTime, data.objectName, data.comment, context.userId]);
        created.push(String(result.rows[0].id));
        await this.audit(context.userId, 'create_recurring', 'camera_work_shift', String(result.rows[0].id), null, data);
        this.emit('CameraShiftCreated', context.userId, String(result.rows[0].id), data);
      }
    }
    await this.audit(context.userId, 'create_recurring_template', 'camera_schedule_template', String(template.rows[0].id), null, { ...input, generated: created.length });
    return { templateId: template.rows[0].id, createdIds: created, conflicts };
  }

  async recommend(input: Record<string, unknown>, context: CameraContext) {
    this.assertRole(context, ['senior_operator', 'admin']);
    const date = this.dateOnly(input.date, 'Дата рекомендации обязательна');
    const startTime = String(input.startTime ?? '08:00'); const endTime = String(input.endTime ?? '20:00');
    const candidates = Array.isArray(input.employeeIds) && input.employeeIds.length ? input.employeeIds.map(String) : (await this.meta(context)).employees.filter((item) => item.role_name?.includes('Оператор') && !item.role_name?.includes('Старший')).map((item) => item.id);
    const suggestions = [];
    for (const employeeId of candidates) {
      if (await this.findConflict({ employeeId, workDate: date, startTime, endTime, status: 'planned', objectName: '', comment: '' })) continue;
      const stats = await this.database.query<{ shifts: string; minutes: string }>(`SELECT count(*)::text AS shifts, COALESCE(sum(EXTRACT(EPOCH FROM ((work_date + end_time + CASE WHEN end_time <= start_time THEN interval '1 day' ELSE interval '0 day' END) - (work_date + start_time))) / 60), 0)::text AS minutes FROM camera_work_shifts WHERE employee_id=$1::uuid AND deleted_at IS NULL AND work_date >= $2::date - interval '30 days' AND work_date <= $2::date`, [employeeId, date]);
      const shiftCount = Number(stats.rows[0]?.shifts ?? 0); const minutes = Number(stats.rows[0]?.minutes ?? 0);
      const score = Math.max(0, 100 - shiftCount * 4 - minutes / 240);
      const reasons = ['Нет пересечения смен']; if (minutes < 2400) reasons.push('Равномерная нагрузка за 30 дней'); if (shiftCount < 10) reasons.push('Нет переработки по количеству смен');
      const result = await this.database.query(`INSERT INTO camera_schedule_recommendations (employee_id, work_date, start_time, end_time, score, reasons, created_by) VALUES ($1,$2::date,$3::time,$4::time,$5,$6::jsonb,$7) RETURNING id`, [employeeId, date, startTime, endTime, score, JSON.stringify(reasons), context.userId]);
      suggestions.push({ id: result.rows[0].id, employeeId, date, startTime, endTime, score: Number(score.toFixed(2)), reasons });
    }
    return { recommendations: suggestions, algorithm: 'rule-based-v1: конфликты, отдых, часы и количество смен за 30 дней' };
  }

  async listViolations(context: CameraContext, filters: Record<string, string | undefined>) {
    this.assertRole(context);
    const page = Math.max(1, Number(filters.page ?? 1)); const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 20))); const params: unknown[] = [];
    const where = ['v.deleted_at IS NULL']; const add = (value: unknown) => { params.push(value); return `$${params.length}`; };
    if (filters.search) { const p = add(`%${filters.search}%`); where.push(`(v.object_name ILIKE ${p} OR v.comment ILIKE ${p} OR u.display_name ILIKE ${p})`); }
    if (filters.authorId) where.push(`v.author_id = ${add(filters.authorId)}::uuid`);
    if (filters.periodStart) where.push(`v.event_datetime >= ${add(filters.periodStart)}::timestamptz`);
    if (filters.periodEnd) where.push(`v.event_datetime < (${add(filters.periodEnd)}::date + interval '1 day')`);
    if (filters.hasPhoto === 'true') where.push(`EXISTS (SELECT 1 FROM camera_violation_attachments pa WHERE pa.violation_id=v.id AND pa.mime_type LIKE 'image/%')`);
    if (filters.hasVideo === 'true') where.push(`EXISTS (SELECT 1 FROM camera_violation_attachments va WHERE va.violation_id=v.id AND va.mime_type LIKE 'video/%')`);
    const count = await this.database.query<{ count: string }>(`SELECT count(*)::text AS count FROM camera_violations v JOIN users u ON u.id=v.author_id WHERE ${where.join(' AND ')}`, params);
    const limitParam = add(pageSize); const offsetParam = add((page - 1) * pageSize);
    const rows = await this.database.query(`SELECT v.*, u.display_name AS author_name, count(a.id)::int AS attachment_count,
      bool_or(a.mime_type LIKE 'image/%') AS has_photo, bool_or(a.mime_type LIKE 'video/%') AS has_video
      FROM camera_violations v JOIN users u ON u.id=v.author_id LEFT JOIN camera_violation_attachments a ON a.violation_id=v.id
      WHERE ${where.join(' AND ')} GROUP BY v.id, u.display_name ORDER BY v.event_datetime DESC LIMIT ${limitParam} OFFSET ${offsetParam}`, params);
    return { violations: rows.rows, page, pageSize, total: Number(count.rows[0]?.count ?? 0), pages: Math.ceil(Number(count.rows[0]?.count ?? 0) / pageSize) };
  }

  async getViolation(id: string, context: CameraContext): Promise<{ violation: Record<string, any> }> {
    this.assertRole(context);
    const result = await this.database.query(`SELECT v.*, u.display_name AS author_name FROM camera_violations v JOIN users u ON u.id=v.author_id WHERE v.id=$1 AND v.deleted_at IS NULL`, [id]);
    if (!result.rows[0]) throw new NotFoundException('Нарушение не найдено');
    const attachments = await this.database.query('SELECT id, file_name, original_file_name, mime_type, file_size, uploaded_by, created_at FROM camera_violation_attachments WHERE violation_id=$1 ORDER BY created_at', [id]);
    return { violation: { ...result.rows[0], attachments: attachments.rows } };
  }

  async createViolation(input: Record<string, unknown>, context: CameraContext) {
    this.assertRole(context);
    const objectName = String(input.objectName ?? '').trim(); const comment = String(input.comment ?? '').trim();
    if (!objectName || objectName.length > 100) throw new BadRequestException('Объект обязателен и должен быть не длиннее 100 символов');
    if (comment.length > 500) throw new BadRequestException('Комментарий не должен быть длиннее 500 символов');
    const eventDateTime = String(input.eventDatetime ?? '').trim() || new Date().toISOString();
    const result = await this.database.query(`INSERT INTO camera_violations (event_datetime, author_id, object_name, comment) VALUES ($1::timestamptz,$2,$3,$4) RETURNING id`, [eventDateTime, context.userId, objectName, comment || null]);
    const id = String(result.rows[0].id); await this.audit(context.userId, 'create', 'camera_violation', id, null, { eventDateTime, authorId: context.userId, objectName, comment }); this.emit('CameraViolationCreated', context.userId, id, { objectName });
    return this.getViolation(id, context);
  }

  async updateViolation(id: string, input: Record<string, unknown>, context: CameraContext) {
    const current = await this.getViolation(id, context); const isPrivileged = context.role === 'senior_operator' || context.role === 'admin';
    if (!isPrivileged && current.violation.author_id !== context.userId) throw new ForbiddenException('Изменять нарушение может только его автор');
    const objectName = String(input.objectName ?? current.violation.object_name).trim(); const comment = String(input.comment ?? current.violation.comment ?? '').trim();
    if (!objectName || objectName.length > 100 || comment.length > 500) throw new BadRequestException('Проверьте длину объекта и комментария');
    await this.database.query('UPDATE camera_violations SET event_datetime=$1::timestamptz, object_name=$2, comment=$3, updated_at=now() WHERE id=$4', [String(input.eventDatetime ?? current.violation.event_datetime), objectName, comment || null, id]);
    await this.audit(context.userId, 'update', 'camera_violation', id, current.violation, { eventDatetime: input.eventDatetime, objectName, comment }); this.emit('CameraViolationUpdated', context.userId, id, { objectName });
    return this.getViolation(id, context);
  }

  async deleteViolation(id: string, context: CameraContext) {
    this.assertRole(context, ['senior_operator', 'admin']); const current = await this.getViolation(id, context);
    await this.database.query('UPDATE camera_violations SET deleted_at=now(), updated_at=now() WHERE id=$1', [id]); await this.audit(context.userId, 'delete', 'camera_violation', id, current.violation, { deleted: true }); this.emit('CameraViolationDeleted', context.userId, id, { deleted: true }); return { deleted: true };
  }

  async addAttachment(id: string, input: Record<string, unknown>, context: CameraContext) {
    this.assertRole(context); await this.getViolation(id, context);
    const originalFileName = basename(String(input.fileName ?? '').trim()); const mimeType = String(input.mimeType ?? '').toLowerCase(); const raw = String(input.fileData ?? '');
    const extension = extname(originalFileName).toLowerCase(); if (!attachmentTypes[mimeType] || attachmentTypes[mimeType] !== extension) throw new BadRequestException('Поддерживаются JPG, JPEG, PNG, WEBP, MP4, MOV и AVI с корректным MIME-type');
    const encoded = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw; let buffer: Buffer; try { buffer = Buffer.from(encoded, 'base64'); } catch { throw new BadRequestException('Не удалось прочитать файл'); }
    const maxBytes = Number(process.env.MAX_VIOLATION_FILE_SIZE_MB ?? 200) * 1024 * 1024; if (!buffer.length || buffer.length > maxBytes) throw new BadRequestException(`Размер файла не должен превышать ${process.env.MAX_VIOLATION_FILE_SIZE_MB ?? 200} МБ`);
    await mkdir(this.uploadRoot, { recursive: true }); const storedName = `${randomUUID()}${extension}`; const storedPath = join(this.uploadRoot, storedName); await writeFile(storedPath, buffer);
    const result = await this.database.query(`INSERT INTO camera_violation_attachments (violation_id,file_name,original_file_name,file_path,mime_type,file_size,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,file_name,original_file_name,mime_type,file_size,created_at`, [id, storedName, originalFileName, storedPath, mimeType, buffer.length, context.userId]);
    await this.audit(context.userId, 'attachment_add', 'camera_violation_attachment', String(result.rows[0].id), null, { violationId: id, originalFileName, mimeType, fileSize: buffer.length }); this.emit('CameraViolationAttachmentAdded', context.userId, String(result.rows[0].id), { violationId: id }); return { attachment: result.rows[0] };
  }

  async deleteAttachment(violationId: string, attachmentId: string, context: CameraContext) {
    this.assertRole(context); const current = await this.getViolation(violationId, context); const isPrivileged = context.role === 'senior_operator' || context.role === 'admin'; if (!isPrivileged && current.violation.author_id !== context.userId) throw new ForbiddenException('Удалять вложения может только автор нарушения');
    const result = await this.database.query('DELETE FROM camera_violation_attachments WHERE id=$1 AND violation_id=$2 RETURNING file_path', [attachmentId, violationId]); if (!result.rows[0]) throw new NotFoundException('Вложение не найдено'); try { await unlink(result.rows[0].file_path); } catch { /* БД остаётся источником метаданных, если файл уже удалён */ }
    await this.audit(context.userId, 'attachment_delete', 'camera_violation_attachment', attachmentId, { violationId }, { deleted: true }); this.emit('CameraViolationAttachmentDeleted', context.userId, attachmentId, { violationId }); return { deleted: true };
  }

  async readAttachment(violationId: string, attachmentId: string, context: CameraContext) {
    this.assertRole(context); const result = await this.database.query('SELECT * FROM camera_violation_attachments WHERE id=$1 AND violation_id=$2', [attachmentId, violationId]); if (!result.rows[0]) throw new NotFoundException('Вложение не найдено'); const attachment = result.rows[0]; return { attachment, data: await readFile(attachment.file_path) };
  }

  private validateShift(input: Record<string, unknown>) {
    const employeeId = String(input.employeeId ?? input.employee_id ?? '').trim(); const workDate = this.dateOnly(input.workDate ?? input.work_date, 'Дата смены обязательна'); const startTime = String(input.startTime ?? input.start_time ?? '').trim(); const endTime = String(input.endTime ?? input.end_time ?? '').trim(); const status = String(input.status ?? 'planned');
    if (!employeeId || !startTime || !endTime || startTime === endTime || !/^\d{2}:\d{2}(:\d{2})?$/.test(startTime) || !/^\d{2}:\d{2}(:\d{2})?$/.test(endTime) || !shiftStatuses.includes(status as typeof shiftStatuses[number])) throw new BadRequestException('Сотрудник, дата и корректное время смены обязательны');
    return { employeeId, workDate, startTime, endTime, status, objectName: String(input.objectName ?? input.object_name ?? '').trim(), comment: String(input.comment ?? '').trim() };
  }

  private dateOnly(value: unknown, message: string) { const date = String(value ?? '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException(message); return date; }
  private async assertEmployee(employeeId: string) { const result = await this.database.query(`SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 AND u.is_active=true AND r.code='operator'`, [employeeId]); if (!result.rows[0]) throw new BadRequestException('Сотрудник должен иметь роль «Оператор»'); }
  private async findConflict(data: { employeeId: string; workDate: string; startTime: string; endTime: string; status?: string; objectName?: string; comment?: string }, exceptId?: string) { const params: unknown[] = [data.employeeId, data.workDate, data.startTime, data.endTime]; let extra = ''; if (exceptId) { params.push(exceptId); extra = ' AND id <> $5'; } const result = await this.database.query(`SELECT id FROM camera_work_shifts WHERE employee_id=$1::uuid AND deleted_at IS NULL AND status <> 'cancelled' ${extra} AND tstzrange((work_date + start_time), (work_date + end_time + CASE WHEN end_time <= start_time THEN interval '1 day' ELSE interval '0 day' END), '[)') && tstzrange(($2::date + $3::time), ($2::date + $4::time + CASE WHEN $4::time <= $3::time THEN interval '1 day' ELSE interval '0 day' END), '[)') LIMIT 1`, params); return result.rows[0]; }
  private recurrenceDates(start: string, end: string, type: string, config: unknown) { const result: string[] = []; const current = new Date(`${start}T00:00:00Z`); const last = new Date(`${end}T00:00:00Z`); const cfg = (config && typeof config === 'object' ? config : {}) as { weekdays?: number[]; workDays?: number; restDays?: number; dates?: string[] }; let index = 0; while (current <= last) { const iso = current.toISOString().slice(0, 10); const weekday = current.getUTCDay() === 0 ? 7 : current.getUTCDay(); let take = type === 'daily'; if (type === 'weekdays') take = (cfg.weekdays ?? [1,2,3,4,5]).includes(weekday); if (type === '2x2') take = index % 4 < 2; if (type === '1x3') take = index % 4 === 0; if (type === 'cycle') take = index % ((cfg.workDays ?? 2) + (cfg.restDays ?? 2)) < (cfg.workDays ?? 2); if (type === 'dates') take = (cfg.dates ?? []).includes(iso); if (take) result.push(iso); current.setUTCDate(current.getUTCDate() + 1); index += 1; } return result; }
  private async audit(actorId: string, action: string, resourceType: string, resourceId: string, beforeData: unknown, afterData: unknown) { await this.database.query('INSERT INTO audit_log (actor_id, action, resource_type, resource_id, before_data, after_data) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)', [actorId, action, resourceType, resourceId, beforeData ? JSON.stringify(beforeData) : null, afterData ? JSON.stringify(afterData) : null]); }
  private emit(name: CameraEventName, actorId: string, objectId: string, payload: Record<string, unknown>) { this.events.emit({ name, actorId, objectId, occurredAt: new Date().toISOString(), payload }); }
}
