import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Injectable, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { DatabaseService } from '../infrastructure/database.service';
import { ServiceActor } from './service-auth';
type CaseInput = { title?: string; description?: string; equipmentId?: string; objectName?: string; sourceTicketId?: string; assigneeId?: string; status?: string; resolution?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
@Injectable()
export class CasesService {
  constructor(private readonly database: DatabaseService) {}
  private get repair() { return process.env.SERVICE_ID === 'equipment'; }
  private get table() { return this.repair ? 'equipment_repairs' : 'camera_tickets'; }
  private authorize(actor: ServiceActor) {
    const roles = this.repair ? ['admin','agent','executor','dispatcher','equipment_manager','support_specialist'] : ['admin','operator','senior_operator'];
    if (!roles.includes(actor.role)) throw new ForbiddenException('Нет прав на работу с этим сервисом');
  }
  async list(actor: ServiceActor) {
    this.authorize(actor);
    const { rows } = await this.database.query(`SELECT c.*, u.display_name AS author_name, a.display_name AS assignee_name ${this.repair ? ', e.inventory_number, e.name AS equipment_name' : ''}
      FROM ${this.table} c JOIN users u ON u.id=c.created_by LEFT JOIN users a ON a.id=c.assignee_id
      ${this.repair ? 'JOIN equipment_items e ON e.id=c.equipment_id' : ''} ORDER BY c.created_at DESC LIMIT 500`);
    const users = await this.database.query(`SELECT DISTINCT u.id,u.display_name FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.is_active AND r.is_active AND r.code=ANY($1::text[]) ORDER BY u.display_name`, [this.repair ? ['admin','agent','executor','dispatcher','equipment_manager','support_specialist'] : ['admin','operator','senior_operator']]);
    return { cases: rows, users: users.rows };
  }
  async create(input: CaseInput, actor: ServiceActor) {
    this.authorize(actor);
    const title = String(input.title || '').trim(); const description = String(input.description || '').trim();
    if (!title || title.length > 200 || description.length > 10000) throw new BadRequestException('Укажите тему до 200 символов и описание до 10000 символов');
    const object = String((this.repair ? input.equipmentId : input.objectName) || '').trim();
    if (!object || (this.repair ? !uuid.test(object) : object.length > 200)) throw new BadRequestException(this.repair ? 'Выберите оборудование' : 'Укажите камеру или объект');
    if (input.sourceTicketId && !uuid.test(input.sourceTicketId)) throw new BadRequestException('Некорректная ссылка на обращение');
    if (input.assigneeId && !uuid.test(input.assigneeId)) throw new BadRequestException('Некорректный исполнитель');
    return this.database.transaction(async db => {
      if (this.repair && !(await db.query('SELECT id FROM equipment_items WHERE id=$1 AND is_active AND status<>\'written_off\' FOR UPDATE', [object])).rows[0]) throw new NotFoundException('Оборудование недоступно');
      if (this.repair && (await db.query("SELECT id FROM equipment_repairs WHERE equipment_id=$1 AND status IN ('new','in_progress')", [object])).rows.length) throw new BadRequestException('По оборудованию уже открыт ремонт');
      if (input.assigneeId && !(await db.query('SELECT id FROM users WHERE id=$1 AND is_active', [input.assigneeId])).rows[0]) throw new BadRequestException('Исполнитель недоступен');
      const { rows } = await db.query(`INSERT INTO ${this.table} (${this.repair ? 'equipment_id' : 'object_name'},title,description,source_ticket_id,created_by,assignee_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [object,title,description,input.sourceTicketId || null,actor.userId,input.assigneeId || null]);
      if (this.repair) await db.query("UPDATE equipment_items SET status='repair',updated_at=now() WHERE id=$1", [object]);
      await db.query('INSERT INTO audit_log(actor_id,action,resource_type,resource_id,after_data) VALUES($1,\'create\',$2,$3,$4)',[actor.userId,this.table,rows[0].id,JSON.stringify(rows[0])]);
      return { case: rows[0] };
    });
  }
  async update(id: string, input: CaseInput, actor: ServiceActor) {
    this.authorize(actor);
    if (!uuid.test(id) || !['new','in_progress','completed','cancelled'].includes(input.status || '')) throw new BadRequestException('Некорректный статус');
    if (['completed','cancelled'].includes(input.status!) && !String(input.resolution || '').trim()) throw new BadRequestException('Укажите результат или причину отмены');
    if (String(input.resolution || '').length > 10000) throw new BadRequestException('Результат слишком длинный');
    return this.database.transaction(async db => {
      const old = (await db.query(`SELECT * FROM ${this.table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
      if (!old) throw new NotFoundException('Запись не найдена');
      if (['completed','cancelled'].includes(old.status)) throw new BadRequestException('Запись уже закрыта');
      const { rows } = await db.query(`UPDATE ${this.table} SET status=$2,resolution=$3,updated_at=now() WHERE id=$1 RETURNING *`,[id,input.status,input.resolution || null]);
      if (this.repair && ['completed','cancelled'].includes(input.status!)) await db.query("UPDATE equipment_items SET status=CASE WHEN assigned_to IS NULL THEN 'in_stock' ELSE 'issued' END,updated_at=now() WHERE id=$1 AND status='repair'",[old.equipment_id]);
      await db.query('INSERT INTO audit_log(actor_id,action,resource_type,resource_id,before_data,after_data) VALUES($1,\'update\',$2,$3,$4,$5)',[actor.userId,this.table,id,JSON.stringify(old),JSON.stringify(rows[0])]);
      return { case: rows[0] };
    });
  }
}
// Explicit controllers keep URLs stable while each runtime registers only its own domain.
@Controller('assets/repairs')
export class EquipmentCasesController {
  constructor(private readonly cases: CasesService) {}
  @Get() list(@Headers('x-user-id') userId: string,@Headers('x-role') role: string) { return this.cases.list({userId,role}); }
  @Post() create(@Headers('x-user-id') userId: string,@Headers('x-role') role: string,@Body() body: CaseInput) { return this.cases.create(body,{userId,role}); }
  @Patch(':id') update(@Param('id') id: string,@Headers('x-user-id') userId: string,@Headers('x-role') role: string,@Body() body: CaseInput) { return this.cases.update(id,body,{userId,role}); }
}
@Controller('cameras/tickets')
export class SurveillanceCasesController {
  constructor(private readonly cases: CasesService) {}
  @Get() list(@Headers('x-user-id') userId: string,@Headers('x-role') role: string) { return this.cases.list({userId,role}); }
  @Post() create(@Headers('x-user-id') userId: string,@Headers('x-role') role: string,@Body() body: CaseInput) { return this.cases.create(body,{userId,role}); }
  @Patch(':id') update(@Param('id') id: string,@Headers('x-user-id') userId: string,@Headers('x-role') role: string,@Body() body: CaseInput) { return this.cases.update(id,body,{userId,role}); }
}
