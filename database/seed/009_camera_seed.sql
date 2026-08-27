-- Демо-данные модуля видеокамер. Идемпотентно.
BEGIN;

INSERT INTO users (id, external_id, email, display_name) VALUES
  ('00000000-0000-0000-0000-000000000010', 'demo-senior-camera', 'olga.volkova@example.ru', 'Ольга Волкова'),
  ('00000000-0000-0000-0000-000000000011', 'demo-operator-1', 'ivan.ivanov@example.ru', 'Иван Иванов'),
  ('00000000-0000-0000-0000-000000000012', 'demo-operator-2', 'petr.petrov@example.ru', 'Пётр Петров'),
  ('00000000-0000-0000-0000-000000000013', 'demo-operator-3', 'elena.smirnova@example.ru', 'Елена Смирнова'),
  ('00000000-0000-0000-0000-000000000014', 'demo-operator-4', 'sergey.orlov@example.ru', 'Сергей Орлов'),
  ('00000000-0000-0000-0000-000000000015', 'demo-operator-5', 'natalia.lebedeva@example.ru', 'Наталья Лебедева')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, '00000000-0000-0000-0000-000000000001'
FROM users u CROSS JOIN roles r
WHERE u.id = '00000000-0000-0000-0000-000000000010' AND r.code = 'senior_operator'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, '00000000-0000-0000-0000-000000000010'
FROM users u CROSS JOIN roles r
WHERE u.id IN ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000015')
  AND r.code = 'operator'
ON CONFLICT DO NOTHING;

INSERT INTO camera_work_shifts (id, employee_id, work_date, start_time, end_time, status, object_name, comment, created_by)
SELECT
  ('a8000000-0000-0000-0000-' || lpad((row_number() OVER (ORDER BY u.id, d.work_date))::text, 12, '0'))::uuid,
  u.id, d.work_date,
  CASE WHEN extract(isodow FROM d.work_date) IN (6, 7) THEN '20:00'::time ELSE '08:00'::time END,
  CASE WHEN extract(isodow FROM d.work_date) IN (6, 7) THEN '08:00'::time ELSE '20:00'::time END,
  'planned', 'Центральный пост видеонаблюдения', 'Демо-смена для проверки календаря', '00000000-0000-0000-0000-000000000010'
FROM users u
CROSS JOIN generate_series(current_date - 3, current_date + 14, interval '1 day') AS d(work_date)
WHERE u.id IN ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000015')
  AND NOT EXISTS (SELECT 1 FROM camera_work_shifts existing WHERE existing.employee_id = u.id AND existing.work_date = d.work_date);

INSERT INTO camera_violations (id, event_datetime, author_id, object_name, comment)
SELECT
  ('a9000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  now() - make_interval(days => n),
  '00000000-0000-0000-0000-' || lpad((10 + ((n - 1) % 6))::text, 12, '0'),
  CASE (n % 4) WHEN 0 THEN 'Камера 01 · Северный вход' WHEN 1 THEN 'Камера 07 · Парковка' WHEN 2 THEN 'Камера 12 · Серверная' ELSE 'Камера 03 · Склад' END,
  CASE (n % 4) WHEN 0 THEN 'Обнаружено открытие служебной двери вне рабочего времени.' WHEN 1 THEN 'Зафиксировано движение в зоне парковки.' WHEN 2 THEN 'Требуется проверить доступ в серверную.' ELSE 'Нарушение порядка хранения оборудования.' END
FROM generate_series(1, 10) n
WHERE NOT EXISTS (SELECT 1 FROM camera_violations existing WHERE existing.id = ('a9000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid);

COMMIT;
