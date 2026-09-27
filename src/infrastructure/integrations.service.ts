import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';
@Injectable()
export class IntegrationsService {
  constructor(private readonly database: DatabaseService) {}
  async listIntegrations() {
    const result = await this.database.query('SELECT * FROM system_integrations ORDER BY name');
    return result.rows;
  }

  apiDescription() {
    return {
      title: 'DevControl Service Desk API',
      version: '1.0.0',
      base_url: 'https://devcontrol.tech/ServiceDesk/api',
      format: 'JSON UTF-8',
      authentication: 'Защищённая сессия sd_session (HttpOnly cookie)',
      headers: ['Content-Type: application/json', 'Origin: https://devcontrol.tech'],
      address_generation: [
        'Адрес метода: https://devcontrol.tech/ServiceDesk/api + путь метода.',
        'Для локального контура: http://localhost:3000/ServiceDesk/api.',
        'Рабочие запросы выполняются по HTTPS после входа в Service Desk.',
      ],
      key_generation: [
        'POST /auth/login принимает login и password и создаёт защищённую сессию на 8 часов.',
        'Браузер отправляет HttpOnly cookie автоматически. Роль и пользователь определяются сервером.',
        'POST /auth/logout отзывает сессию; смена пароля отзывает все сессии пользователя.',
        'Выпуск API-ключей для внешних интеграций в этой версии не реализован.',
      ],
      objects: [
        {
          object: 'Обращение', endpoint: '/tickets', identifier: 'id: uuid; number: bigint identity',
          attributes: [
            { name: 'id', type: 'uuid', size: '16 байт', required: false, description: 'Системный идентификатор, создается сервером' },
            { name: 'number', type: 'integer', size: '8 байт', required: false, description: 'Номер документа, создается сервером' },
            { name: 'subject', type: 'string', size: 'до 500 символов', required: true, description: 'Тема обращения' },
            { name: 'description', type: 'string', size: 'до 10000 символов', required: false, description: 'Описание проблемы или запроса' },
            { name: 'created_by', type: 'uuid', size: '16 байт', required: true, description: 'Автор документа' },
            { name: 'ticket_type_id', type: 'uuid', size: '16 байт', required: false, description: 'Тип заявки' },
            { name: 'ticket_kind_id', type: 'uuid', size: '16 байт', required: false, description: 'Вид заявки' },
            { name: 'priority', type: 'integer', size: '1–5', required: false, description: 'Приоритет, по умолчанию 3' },
            { name: 'status', type: 'string', size: 'до 30 символов', required: false, description: 'new, in_progress, waiting, repair, resolved, closed' },
            { name: 'assignee_id', type: 'uuid', size: '16 байт', required: false, description: 'Исполнитель' },
            { name: 'visit_required', type: 'boolean', size: '1 значение', required: false, description: 'Нужен выезд, по умолчанию false' },
            { name: 'visit_scheduled_at', type: 'datetime', size: '8 байт', required: false, description: 'Дата и время визита' },
            { name: 'purchase_required', type: 'boolean', size: '1 значение', required: false, description: 'Нужна закупка, по умолчанию false' },
            { name: 'erp_request_numbers', type: 'string[]', size: '20 символов на элемент', required: false, description: 'Номера заявок ERP' },
            { name: 'repair_required', type: 'boolean', size: '1 значение', required: false, description: 'Нужен ремонт, по умолчанию false' },
            { name: 'development_required', type: 'boolean', size: '1 значение', required: false, description: 'Нужна разработка, по умолчанию false' },
          ],
          methods: [
            { method: 'GET', path: '/api/tickets', description: 'Выгрузить список обращений', request: '{}', response: '{ "tickets": [{ "id": "uuid", "number": 42, "subject": "Недоступен VPN", "status": "in_progress" }] }' },
            { method: 'GET', path: '/api/tickets/{id}', description: 'Выгрузить документ обращения', request: '{}', response: '{ "ticket": { "id": "uuid", "number": 42, "subject": "Недоступен VPN", "comments": [] } }' },
            { method: 'POST', path: '/api/tickets', description: 'Загрузить документ обращения', request: '{ "userId": "uuid", "subject": "Недоступен VPN", "description": "Не подключается после обновления", "ticketTypeId": "uuid", "ticketKindId": "uuid" }', response: '{ "ticket": { "id": "uuid", "number": 43, "status": "new" } }' },
            { method: 'PATCH', path: '/api/tickets/{id}', description: 'Изменить параметры выезда, закупки или ремонта', request: '{ "visitRequired": true, "visitScheduledAt": "2026-09-08T10:00:00+07:00" }', response: '{ "ticket": { "id": "uuid", "visit_required": true } }' },
          ],
        },
        {
          object: 'Поступление ТМЦ', endpoint: '/assets/receipts', identifier: 'id: uuid; document_number: bigint identity',
          attributes: [
            { name: 'id', type: 'uuid', size: '16 байт', required: false, description: 'Идентификатор документа' },
            { name: 'document_number', type: 'integer', size: '8 байт', required: false, description: 'Номер, формируется сервером' },
            { name: 'organization_id', type: 'uuid', size: '16 байт', required: false, description: 'Организация' },
            { name: 'warehouse_id', type: 'uuid', size: '16 байт', required: true, description: 'Склад' },
            { name: 'employee_id', type: 'uuid', size: '16 байт', required: false, description: 'Получивший сотрудник' },
            { name: 'nomenclature_id', type: 'uuid', size: '16 байт', required: true, description: 'Номенклатура' },
            { name: 'quantity', type: 'decimal', size: '(14,3), > 0', required: true, description: 'Количество' },
            { name: 'comment', type: 'string', size: 'до 1000 символов', required: false, description: 'Комментарий' },
          ],
          methods: [
            { method: 'GET', path: '/api/assets/receipts', description: 'Выгрузить документы поступления', request: '{}', response: '{ "items": [{ "document_number": 10, "warehouse_id": "uuid", "quantity": 5 }] }' },
            { method: 'POST', path: '/api/assets/receipts', description: 'Загрузить документ поступления; остаток увеличивается атомарно', request: '{ "organizationId": "uuid", "warehouseId": "uuid", "employeeId": "uuid", "nomenclatureId": "uuid", "quantity": 5, "comment": "Поставка по накладной 77" }', response: '{ "receipt": { "document_number": 11, "quantity": 5 } }' },
          ],
        },
        {
          object: 'Движение оборудования', endpoint: '/assets/movements', identifier: 'id: uuid; document_number: bigint identity',
          attributes: [
            { name: 'id', type: 'uuid', size: '16 байт', required: false, description: 'Идентификатор документа' },
            { name: 'document_number', type: 'integer', size: '8 байт', required: false, description: 'Номер документа' },
            { name: 'equipment_id', type: 'uuid', size: '16 байт', required: false, description: 'Оборудование' },
            { name: 'organization_id', type: 'uuid', size: '16 байт', required: false, description: 'Организация' },
            { name: 'department_id', type: 'uuid', size: '16 байт', required: false, description: 'Подразделение' },
            { name: 'employee_id', type: 'uuid', size: '16 байт', required: false, description: 'Сотрудник-получатель' },
            { name: 'issued_by', type: 'uuid', size: '16 байт', required: false, description: 'Сотрудник, проводивший выдачу' },
            { name: 'status', type: 'string', size: 'до 30 символов', required: false, description: 'new, issued, repair, replacement, writeoff_process, written_off' },
            { name: 'requires_approval', type: 'boolean', size: '1 значение', required: false, description: 'Требуется согласование' },
            { name: 'approver_id', type: 'uuid', size: '16 байт', required: false, description: 'Обязателен при requires_approval=true' },
            { name: 'comment', type: 'string', size: 'до 1000 символов', required: false, description: 'Комментарий документа' },
          ],
          methods: [
            { method: 'GET', path: '/api/assets/movements', description: 'Выгрузить движения оборудования', request: '{}', response: '{ "items": [{ "document_number": 20, "status": "issued", "equipment_id": "uuid" }] }' },
            { method: 'POST', path: '/api/assets/movements', description: 'Загрузить движение; новое оборудование при наличии employeeId переводится в issued', request: '{ "equipmentId": "uuid", "organizationId": "uuid", "departmentId": "uuid", "employeeId": "uuid", "issuedBy": "uuid", "status": "new", "requiresApproval": false }', response: '{ "movement": { "document_number": 21, "status": "issued", "equipment_status": "issued" } }' },
          ],
        },
        {
          object: 'Номенклатура', endpoint: '/assets/nomenclature', identifier: 'id: uuid; code: string',
          attributes: [
            { name: 'id', type: 'uuid', size: '16 байт', required: false, description: 'Идентификатор' },
            { name: 'code', type: 'string', size: 'до 50 символов', required: false, description: 'Уникальный код, генерируется сервером' },
            { name: 'name', type: 'string', size: 'до 250 символов', required: true, description: 'Наименование' },
            { name: 'category', type: 'string', size: 'до 100 символов', required: false, description: 'Категория, по умолчанию Оборудование' },
            { name: 'unit', type: 'string', size: 'до 20 символов', required: false, description: 'Единица измерения, по умолчанию шт' },
            { name: 'is_active', type: 'boolean', size: '1 значение', required: false, description: 'Активность, по умолчанию true' },
          ],
          methods: [
            { method: 'GET', path: '/api/assets/nomenclature', description: 'Выгрузить справочник номенклатуры', request: '{}', response: '{ "items": [{ "code": "NOM-001", "name": "Картридж", "unit": "шт" }] }' },
            { method: 'POST', path: '/api/assets/nomenclature', description: 'Загрузить позицию номенклатуры', request: '{ "name": "Картридж HP 107A", "category": "Расходные материалы", "unit": "шт" }', response: '{ "nomenclature": { "id": "uuid", "code": "NOM-..." } }' },
          ],
        },
        {
          object: 'Оборудование', endpoint: '/assets/equipment', identifier: 'id: uuid; inventory_number: string',
          attributes: [
            { name: 'id', type: 'uuid', size: '16 байт', required: false, description: 'Идентификатор' },
            { name: 'inventory_number', type: 'string', size: 'до 50 символов', required: false, description: 'Уникальный инвентарный номер' },
            { name: 'name', type: 'string', size: 'до 250 символов', required: true, description: 'Наименование' },
            { name: 'equipment_type', type: 'string', size: 'до 100 символов', required: true, description: 'Тип оборудования' },
            { name: 'serial_number', type: 'string', size: 'до 100 символов', required: false, description: 'Серийный номер' },
            { name: 'status', type: 'string', size: 'до 30 символов', required: false, description: 'Состояние оборудования' },
            { name: 'toner_level', type: 'integer', size: '0–100', required: false, description: 'Процент остатка тонера' },
            { name: 'toner_available', type: 'boolean', size: '1 значение', required: false, description: 'Есть ли тонер' },
          ],
          methods: [
            { method: 'GET', path: '/api/assets/equipment', description: 'Выгрузить реестр оборудования', request: '{}', response: '{ "items": [{ "inventory_number": "INV-001", "status": "in_stock", "toner_level": 80 }] }' },
            { method: 'POST', path: '/api/assets/equipment', description: 'Загрузить карточку оборудования', request: '{ "name": "HP LaserJet Pro", "equipmentType": "Принтер", "serialNumber": "SN-001", "tonerLevel": 80, "tonerAvailable": true }', response: '{ "equipment": { "id": "uuid", "inventory_number": "INV-..." } }' },
          ],
        },
        {
          object: 'Склад', endpoint: '/assets/warehouses', identifier: 'id: uuid; code: string',
          attributes: [
            { name: 'id', type: 'uuid', size: '16 байт', required: false, description: 'Идентификатор' },
            { name: 'code', type: 'string', size: 'до 50 символов', required: false, description: 'Уникальный код, генерируется сервером' },
            { name: 'name', type: 'string', size: 'до 200 символов', required: true, description: 'Наименование склада' },
            { name: 'organization_id', type: 'uuid', size: '16 байт', required: false, description: 'Организация-владелец' },
            { name: 'address', type: 'string', size: 'до 500 символов', required: false, description: 'Адрес' },
            { name: 'is_active', type: 'boolean', size: '1 значение', required: false, description: 'Активность, по умолчанию true' },
          ],
          methods: [
            { method: 'GET', path: '/api/assets/warehouses', description: 'Выгрузить склады', request: '{}', response: '{ "items": [{ "code": "WH-001", "name": "Основной склад ИТ" }] }' },
            { method: 'POST', path: '/api/assets/warehouses', description: 'Загрузить склад', request: '{ "name": "Основной склад ИТ", "organizationId": "uuid", "address": "г. Новосибирск" }', response: '{ "warehouse": { "id": "uuid", "code": "WH-..." } }' },
          ],
        },
        {
          object: 'Система интеграции', endpoint: '/assets/integrations', identifier: 'id: uuid; code: string',
          attributes: [
            { name: 'id', type: 'uuid', size: '16 байт', required: false, description: 'Идентификатор подключения' },
            { name: 'code', type: 'string', size: 'до 50 символов', required: false, description: 'Уникальный код, генерируется сервером' },
            { name: 'name', type: 'string', size: 'до 200 символов', required: true, description: 'Название системы' },
            { name: 'integration_type', type: 'enum', size: '1 из 3 значений', required: true, description: '1c, external_site или database' },
            { name: 'endpoint', type: 'string', size: 'до 2048 символов', required: false, description: 'Адрес подключения без секрета' },
            { name: 'database_name', type: 'string', size: 'до 100 символов', required: false, description: 'Имя БД' },
            { name: 'api_description', type: 'json', size: 'до 256 КБ', required: false, description: 'Описание методов и схем' },
            { name: 'is_active', type: 'boolean', size: '1 значение', required: false, description: 'Активность, по умолчанию true' },
            { name: 'last_sync_at', type: 'datetime', size: '8 байт', required: false, description: 'Последняя синхронизация' },
          ],
          methods: [
            { method: 'GET', path: '/api/assets/integrations', description: 'Выгрузить подключения; только администратор', request: '{}', response: '{ "items": [{ "code": "INT-001", "name": "1С ERP", "is_active": true }] }' },
            { method: 'POST', path: '/api/assets/integrations', description: 'Загрузить описание подключения; только администратор', request: '{ "name": "1С ERP", "integrationType": "1c", "endpoint": "https://erp.example/api", "description": "Обмен ТМЦ" }', response: '{ "integration": { "id": "uuid", "code": "INT-..." } }' },
            { method: 'GET', path: '/api/assets/api-description', description: 'Получить каноническое описание API; только администратор', request: '{}', response: '{ "title": "DevControl Service Desk API", "objects": [] }' },
          ],
        },
      ],
      errors: [
        { status: 400, description: 'Некорректные атрибуты или нарушение бизнес-ограничения' },
        { status: 401, description: 'Не передан действующий токен' },
        { status: 403, description: 'Недостаточно прав; Интеграции доступны только администратору' },
        { status: 404, description: 'Объект или ссылка не найдены' },
        { status: 413, description: 'Размер запроса или файла превышает лимит' },
        { status: 429, description: 'Превышен лимит запросов Gateway' },
        { status: 500, description: 'Внутренняя ошибка; подробности только в correlation-aware логах' },
      ],
    };
  }

  async createIntegration(input: { name?: string; integrationType?: string; endpoint?: string; databaseName?: string; description?: string; apiDescription?: unknown }) {
    const name = String(input.name ?? '').trim();
    const integrationType = String(input.integrationType ?? 'external_site');
    if (!name || !['1c', 'external_site', 'database'].includes(integrationType)) throw new BadRequestException('Название и тип подключения обязательны');
    const code = `INT-${Date.now().toString(36).toUpperCase()}`;
    const apiDescription = input.apiDescription && typeof input.apiDescription === 'object' ? input.apiDescription : { methods: [] };
    const result = await this.database.query(`INSERT INTO system_integrations (code, name, integration_type, endpoint, database_name, description, api_description)
      VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), $7) RETURNING *`, [code, name, integrationType, String(input.endpoint ?? '').trim(), String(input.databaseName ?? '').trim(), String(input.description ?? '').trim(), apiDescription]);
    return { integration: result.rows[0] };
  }
}
