ALTER TABLE development_boards
  ADD COLUMN IF NOT EXISTS system_id uuid REFERENCES systems(id);

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS development_status text NOT NULL DEFAULT 'Backlog';

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_development_status_check;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_development_status_check
  CHECK (development_status IN ('Backlog', 'Аналитика', 'Разработка', 'Документация', 'Тестирование', 'Готово к релизу', 'Выпущено в релиз'));

CREATE INDEX IF NOT EXISTS development_boards_system_idx ON development_boards(system_id, is_active, status);
CREATE INDEX IF NOT EXISTS tickets_development_system_idx ON tickets(development_required, development_board_id, development_status);

UPDATE development_boards
SET system_id = CASE code
  WHEN 'SD-CORE' THEN 'a1000000-0000-0000-0000-000000000001'::uuid
  WHEN 'ERP-INT' THEN 'a1000000-0000-0000-0000-000000000002'::uuid
  ELSE system_id
END
WHERE system_id IS NULL;

UPDATE tickets
SET development_status = CASE id
  WHEN 'c0000000-0000-0000-0000-000000000002'::uuid THEN 'Разработка'
  WHEN 'c0000000-0000-0000-0000-000000000003'::uuid THEN 'Аналитика'
  ELSE development_status
END
WHERE development_required = true;

INSERT INTO ticket_kinds (id, ticket_type_id, system_id, code, name, is_active)
VALUES (
  'a0000000-0000-0000-0000-000000000006',
  '90000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000002',
  'erp-access-approval',
  'Согласование доступа к ERP',
  true
)
ON CONFLICT (id) DO UPDATE
SET ticket_type_id = EXCLUDED.ticket_type_id,
    system_id = EXCLUDED.system_id,
    name = EXCLUDED.name,
    is_active = EXCLUDED.is_active;

UPDATE tickets
SET ticket_kind_id = 'a0000000-0000-0000-0000-000000000006'
WHERE id = 'c0000000-0000-0000-0000-000000000003';

ALTER TABLE development_boards
  ALTER COLUMN system_id SET NOT NULL;
