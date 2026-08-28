CREATE TABLE IF NOT EXISTS development_statuses (
  code text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_final boolean NOT NULL DEFAULT false,
  allowed_next_codes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO development_statuses (code, name, sort_order, is_final) VALUES
  ('backlog', 'Backlog', 10, false),
  ('analytics', 'Аналитика', 20, false),
  ('ready_for_development', 'Готово к разработке', 30, false),
  ('development', 'Разработка', 40, false),
  ('testing', 'Тестирование', 50, false),
  ('ready_for_release', 'Готово к релизу', 60, false),
  ('release', 'Релиз', 70, false),
  ('closed', 'Закрыто', 80, true)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_final = EXCLUDED.is_final, updated_at = now();

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_development_status_check;

UPDATE tickets SET development_status = CASE development_status
  WHEN 'backlog' THEN 'backlog'
  WHEN 'analytics' THEN 'analytics'
  WHEN 'ready_for_development' THEN 'ready_for_development'
  WHEN 'development' THEN 'development'
  WHEN 'testing' THEN 'testing'
  WHEN 'ready_for_release' THEN 'ready_for_release'
  WHEN 'release' THEN 'release'
  WHEN 'closed' THEN 'closed'
  WHEN 'Backlog' THEN 'backlog'
  WHEN 'Аналитика' THEN 'analytics'
  WHEN 'Разработка' THEN 'development'
  WHEN 'Документация' THEN 'ready_for_development'
  WHEN 'Тестирование' THEN 'testing'
  WHEN 'Готово к релизу' THEN 'ready_for_release'
  WHEN 'Выпущено в релиз' THEN 'release'
  ELSE 'backlog'
END;

ALTER TABLE tickets ALTER COLUMN development_status SET DEFAULT 'backlog';
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_development_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_development_status_check FOREIGN KEY (development_status) REFERENCES development_statuses(code);

ALTER TABLE development_cards DROP CONSTRAINT IF EXISTS development_cards_status_check;

UPDATE development_cards SET status = CASE status
  WHEN 'backlog' THEN 'backlog'
  WHEN 'analytics' THEN 'analytics'
  WHEN 'ready_for_development' THEN 'ready_for_development'
  WHEN 'development' THEN 'development'
  WHEN 'testing' THEN 'testing'
  WHEN 'ready_for_release' THEN 'ready_for_release'
  WHEN 'release' THEN 'release'
  WHEN 'closed' THEN 'closed'
  WHEN 'Backlog' THEN 'backlog'
  WHEN 'Аналитика' THEN 'analytics'
  WHEN 'Разработка' THEN 'development'
  WHEN 'Документация' THEN 'ready_for_development'
  WHEN 'Тестирование' THEN 'testing'
  WHEN 'Готово к релизу' THEN 'ready_for_release'
  WHEN 'Выпущено в релиз' THEN 'release'
  ELSE 'backlog'
END;

ALTER TABLE development_cards DROP CONSTRAINT IF EXISTS development_cards_status_fkey;
ALTER TABLE development_cards ADD CONSTRAINT development_cards_status_fkey FOREIGN KEY (status) REFERENCES development_statuses(code);
ALTER TABLE development_cards ALTER COLUMN status SET DEFAULT 'backlog';
ALTER TABLE development_cards DROP CONSTRAINT IF EXISTS development_cards_ticket_id_key;

ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id);

ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS analyst_id uuid REFERENCES users(id);
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS developer_id uuid REFERENCES users(id);
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS development_start_date date;
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS release_date date;
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS planned_release_date date;
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS actual_release_date date;
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS analytics_hours numeric(10, 2) NOT NULL DEFAULT 0 CHECK (analytics_hours >= 0);
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS development_hours numeric(10, 2) NOT NULL DEFAULT 0 CHECK (development_hours >= 0);
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS planned_hours numeric(10, 2) NOT NULL DEFAULT 0 CHECK (planned_hours >= 0);
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS total_hours numeric(10, 2) NOT NULL DEFAULT 0 CHECK (total_hours >= 0);
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES development_cards(id) ON DELETE CASCADE;
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS root_task_id uuid REFERENCES development_cards(id) ON DELETE CASCADE;
ALTER TABLE development_cards ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5);
ALTER TABLE development_cards DROP CONSTRAINT IF EXISTS development_cards_dates_check;
ALTER TABLE development_cards ADD CONSTRAINT development_cards_dates_check CHECK (release_date IS NULL OR development_start_date IS NULL OR release_date >= development_start_date);

UPDATE development_cards SET created_by = COALESCE(created_by, '00000000-0000-0000-0000-000000000001'::uuid), root_task_id = COALESCE(root_task_id, id), priority = COALESCE(priority, 3);
UPDATE development_cards SET ticket_id = ticket_id WHERE ticket_id IS NOT NULL;
UPDATE development_cards dc SET analyst_id = '00000000-0000-0000-0000-000000000002'::uuid
WHERE dc.analyst_id IS NULL AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = '00000000-0000-0000-0000-000000000002'::uuid AND r.code = 'analyst');
UPDATE development_cards dc SET developer_id = '00000000-0000-0000-0000-000000000003'::uuid
WHERE dc.developer_id IS NULL AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = '00000000-0000-0000-0000-000000000003'::uuid AND r.code = 'developer');

CREATE INDEX IF NOT EXISTS development_cards_parent_idx ON development_cards(parent_task_id, status);
CREATE INDEX IF NOT EXISTS development_cards_people_idx ON development_cards(analyst_id, developer_id, status);
CREATE INDEX IF NOT EXISTS development_cards_ticket_idx ON development_cards(ticket_id, parent_task_id);

CREATE TABLE IF NOT EXISTS development_task_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES development_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  UNIQUE (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS development_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES development_cards(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  comment text NOT NULL CHECK (char_length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS development_task_comments_idx ON development_task_comments(task_id, created_at);
CREATE INDEX IF NOT EXISTS development_task_watchers_idx ON development_task_watchers(task_id, user_id);

INSERT INTO roles (id, code, name, description, is_system) VALUES
  ('10000000-0000-0000-0000-000000000004', 'analyst', 'Аналитик', 'Анализ и оценка задач разработки', false),
  ('10000000-0000-0000-0000-000000000005', 'developer', 'Разработчик', 'Разработка и сопровождение задач', false)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO permissions (id, code, description) VALUES
  ('20000000-0000-0000-0000-000000000006', 'development.read', 'Просмотр карточек разработки'),
  ('20000000-0000-0000-0000-000000000007', 'development.update', 'Изменение карточек разработки'),
  ('20000000-0000-0000-0000-000000000008', 'development.status', 'Перемещение карточек разработки'),
  ('20000000-0000-0000-0000-000000000009', 'development.assign', 'Назначение аналитика и разработчика'),
  ('20000000-0000-0000-0000-000000000010', 'development.watch', 'Управление наблюдателями разработки'),
  ('20000000-0000-0000-0000-000000000011', 'development.comment', 'Добавление комментариев разработки'),
  ('20000000-0000-0000-0000-000000000012', 'development.comment.edit', 'Редактирование собственных комментариев разработки'),
  ('20000000-0000-0000-0000-000000000013', 'development.subtask', 'Создание подзадач разработки')
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, description = EXCLUDED.description;

INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

UPDATE users SET department_id = CASE id
  WHEN '00000000-0000-0000-0000-000000000001'::uuid THEN '40000000-0000-0000-0000-000000000001'::uuid
  WHEN '00000000-0000-0000-0000-000000000002'::uuid THEN '40000000-0000-0000-0000-000000000002'::uuid
  WHEN '00000000-0000-0000-0000-000000000003'::uuid THEN '40000000-0000-0000-0000-000000000001'::uuid
  WHEN '00000000-0000-0000-0000-000000000004'::uuid THEN '40000000-0000-0000-0000-000000000001'::uuid
  ELSE department_id END
WHERE id IN (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000003'::uuid,
  '00000000-0000-0000-0000-000000000004'::uuid
);

INSERT INTO role_permissions (role_id, permission_id, effect, scope)
SELECT r.id, p.id, 'allow', '{}'::jsonb
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code LIKE 'development.%'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, effect, scope)
SELECT r.id, p.id, 'allow', '{}'::jsonb
FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('analyst', 'developer') AND p.code IN ('development.read', 'development.update', 'development.status', 'development.assign', 'development.watch', 'development.comment', 'development.comment.edit', 'development.subtask')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, effect, scope)
SELECT r.id, p.id, 'allow', '{}'::jsonb
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'dispatcher' AND p.code IN ('development.read', 'development.status', 'development.comment')
ON CONFLICT DO NOTHING;

UPDATE development_cards dc SET analyst_id = '00000000-0000-0000-0000-000000000002'::uuid
WHERE dc.analyst_id IS NULL AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = '00000000-0000-0000-0000-000000000002'::uuid AND r.code = 'analyst');
UPDATE development_cards dc SET developer_id = '00000000-0000-0000-0000-000000000003'::uuid
WHERE dc.developer_id IS NULL AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = '00000000-0000-0000-0000-000000000003'::uuid AND r.code = 'developer');
