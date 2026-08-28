INSERT INTO systems (id, code, name, description)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'SD', 'Service Desk', 'Система регистрации и сопровождения обращений.'),
  ('a1000000-0000-0000-0000-000000000002', 'ERP', '1С: ERP', 'Корпоративная учетная система.'),
  ('a1000000-0000-0000-0000-000000000003', 'AD', 'Active Directory', 'Каталог пользователей и групп доступа.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO development_boards (id, code, name, status, description)
VALUES
  ('a2000000-0000-0000-0000-000000000001', 'SD-CORE', 'Service Desk — основная разработка', 'Ведется разработка функционала', 'Основная доска развития Service Desk.'),
  ('a2000000-0000-0000-0000-000000000002', 'ERP-INT', 'Интеграции с ERP', 'Ведется разработка функционала', 'Задачи интеграций и обменов с 1С:ERP.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, description = EXCLUDED.description;

INSERT INTO ticket_types (id, code, name, is_default)
VALUES ('90000000-0000-0000-0000-000000000004', 'access_request', 'Запрос прав доступа', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_default = EXCLUDED.is_default;

UPDATE ticket_types
SET is_default = name IN ('Запрос на обслуживание', 'Инцидент', 'Запрос прав доступа');

UPDATE ticket_kinds
SET system_id = CASE
  WHEN code IN ('vpn', 'network-change') THEN 'a1000000-0000-0000-0000-000000000001'::uuid
  WHEN code IN ('monitor', 'repair') THEN 'a1000000-0000-0000-0000-000000000001'::uuid
  ELSE 'a1000000-0000-0000-0000-000000000001'::uuid
END
WHERE system_id IS NULL;

INSERT INTO ticket_kinds (id, ticket_type_id, system_id, code, name, is_active)
VALUES
  ('a0000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 'grant-access', 'Предоставление прав доступа', true)
ON CONFLICT (id) DO UPDATE SET system_id = EXCLUDED.system_id, name = EXCLUDED.name;

UPDATE tickets
SET development_required = true,
    development_board_id = 'a2000000-0000-0000-0000-000000000001'
WHERE id = 'c0000000-0000-0000-0000-000000000002';

INSERT INTO tickets (id, subject, description, created_by, ticket_type_id, ticket_kind_id, priority, status, development_required, development_board_id)
VALUES (
  'c0000000-0000-0000-0000-000000000003',
  'Добавить согласование заявки руководителем',
  'Реализовать маршрут согласования для обращений на доступ к ERP.',
  '00000000-0000-0000-0000-000000000004',
  '90000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000005',
  3,
  'in_progress',
  true,
  'a2000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO UPDATE SET development_required = EXCLUDED.development_required, development_board_id = EXCLUDED.development_board_id;
