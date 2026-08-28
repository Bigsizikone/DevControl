-- Демонстрационные данные контура ИБ. Повторный запуск не дублирует записи.
BEGIN;
DO $$
DECLARE admin_id uuid;
BEGIN
  SELECT id INTO admin_id FROM users ORDER BY created_at LIMIT 1;
  INSERT INTO security_records (entity_type, title, description, status, severity, visibility_level, owner_id, assignee_id, due_date, review_date, fields, created_by)
  SELECT v.entity_type, v.title, v.description, v.status, v.severity, 'standard', admin_id, admin_id, v.due_date, v.review_date, v.fields::jsonb, admin_id
  FROM (VALUES
    ('incident','Подозрительное письмо с вложением','Пользователь сообщил о фишинговом письме, требуется анализ заголовков.','investigation','high',current_date + 1,NULL,'{"category":"Фишинг","source":"Пользователь","ip":"192.168.10.45","hostname":"WS-042","personalData":false}'::text),
    ('incident','Недоступность сервиса мониторинга','Сработал контроль доступности критичной системы.','new','critical',current_date,NULL,'{"category":"Нарушение доступности","source":"Мониторинг","affectedUsers":120}'::text),
    ('violation','Передача пароля коллеге','Зафиксирована передача учетных данных в общем чате.','in_review','high',NULL,NULL,'{"violationType":"Передача пароля","employee":"Иван Иванов","rule":"Парольная политика"}'::text),
    ('access','Доступ к системе 1С:ERP','Нужен временный доступ для закрытия квартала.','approval','medium',current_date + 1,current_date + 30,'{"system":"1С:ERP","resource":"Закрытие периода","requestedRole":"Оператор","temporary":true,"securityApprovalRequired":true}'::text),
    ('privileged','Администратор домена для сопровождения','Периодический пересмотр привилегированной учетной записи.','active','critical',NULL,current_date + 14,'{"system":"Active Directory","account":"adm.petrov","accessType":"Domain Admin","reviewRequired":true}'::text),
    ('vulnerability','Обновление OpenSSL CVE-2025-1234','Уязвимость на сервере интеграций требует установки обновления.','assigned','high',current_date + 14,NULL,'{"cve":"CVE-2025-1234","cvss":8.1,"system":"Шина интеграций","server":"srv-int-01","remediation":"Обновить пакет OpenSSL"}'::text),
    ('information_system','Service Desk Control','Реестр критичной информационной системы Service Desk.','active','high',NULL,current_date + 180,'{"code":"IS-001","owner":"ИТ-директор","technicalResponsible":"Системный администратор","url":"https://servicedesk.local","personalData":true,"internetAccess":false,"rpo":"4 ч","rto":"8 ч"}'::text),
    ('pdsn','Кадровый учет','ИСПДн для обработки данных сотрудников и кандидатов.','active','high',NULL,current_date + 90,'{"system":"Кадровая система","operator":"ООО Ромашка","subjectCategories":["Сотрудники","Кандидаты"],"personalDataCategories":["ФИО","Паспорт","Контакты"],"securityLevel":"УЗ-2"}'::text),
    ('software','AnyDesk','Удаленное подключение требует предварительного согласования.','restricted','high',NULL,current_date + 30,'{"developer":"AnyDesk Software","version":"8.0","approvalStatus":"Ограничено","allowed":false,"requiresApproval":true}'::text),
    ('audit','Плановая проверка доступа к ERP','Проверка ролевой модели и актуальности согласований.','planned','medium',current_date + 7,current_date + 14,'{"auditType":"Аудит доступа","auditor":"Специалист ИБ","program":"Ревизия активных ролей"}'::text),
    ('risk','Избыточные привилегии в ERP','Риск сохранения доступа после изменения должности.','open','high',current_date + 30,current_date + 60,'{"probability":4,"impact":4,"score":16,"strategy":"снизить","asset":"1С:ERP"}'::text),
    ('action','Пересмотреть доступы уволенных сотрудников','Сверить активные учетные записи с кадровым статусом.','assigned','high',current_date + 3,NULL,'{"source":"Событие увольнения","priority":"Высокий","controller":"Руководитель ИБ"}'::text),
    ('document','Политика информационной безопасности','Локальный нормативный документ организации.','active','medium',NULL,current_date + 60,'{"documentType":"Политика информационной безопасности","version":"2.1","confidentiality":"Стандартный","reviewPeriod":12}'::text),
    ('regulation','Федеральный закон №152-ФЗ «О персональных данных»','Нормативное требование для контроля обработки персональных данных.','active','high',NULL,current_date + 30,'{"lawNumber":"152-ФЗ","article":"19","category":"Персональные данные","sourceUrl":"https://pravo.gov.ru"}'::text),
    ('exception','Временное использование устаревшего ПО','Исключение действует до завершения миграции на новую версию.','active','medium',current_date + 1,current_date + 21,'{"reason":"Отсутствует совместимый драйвер","compensatingMeasures":"Изолированный сегмент","approver":"Руководитель ИБ"}'::text),
    ('event','Событие от EDR: подозрительный процесс','Внешнее событие ожидает анализа специалиста ИБ.','new','high',NULL,NULL,'{"source":"EDR","externalId":"EDR-2026-0007","category":"Подозрительная активность","hostname":"WS-042","username":"ivan.ivanov"}'::text)
  ) AS v(entity_type,title,description,status,severity,due_date,review_date,fields)
  WHERE NOT EXISTS (SELECT 1 FROM security_records s WHERE s.entity_type = v.entity_type AND s.title = v.title AND s.deleted_at IS NULL);
END $$;
COMMIT;
