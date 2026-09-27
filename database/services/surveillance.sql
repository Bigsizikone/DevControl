-- Модуль «Видеокамеры»: графики смен, нарушения и защищённые вложения.
CREATE TABLE IF NOT EXISTS camera_work_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES users(id),
  work_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'cancelled')),
  object_name text,
  comment text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT camera_shift_time_diff CHECK (start_time <> end_time)
);

CREATE TABLE IF NOT EXISTS camera_schedule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  employee_ids uuid[] NOT NULL,
  recurrence_type text NOT NULL CHECK (recurrence_type IN ('daily', 'weekdays', '2x2', '1x3', 'cycle', 'dates')),
  recurrence_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  object_name text,
  comment text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT camera_template_dates CHECK (end_date >= start_date),
  CONSTRAINT camera_template_time_diff CHECK (start_time <> end_time)
);

CREATE TABLE IF NOT EXISTS camera_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  event_datetime timestamptz NOT NULL DEFAULT now(),
  author_id uuid NOT NULL REFERENCES users(id),
  object_name varchar(100) NOT NULL,
  comment varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS camera_violation_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_id uuid NOT NULL REFERENCES camera_violations(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  original_file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS camera_schedule_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES users(id),
  work_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  score numeric(6,3) NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  algorithm_version text NOT NULL DEFAULT 'rule-based-v1',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS camera_shift_employee_idx ON camera_work_shifts (employee_id, work_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS camera_shift_date_idx ON camera_work_shifts (work_date, start_time) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS camera_shift_status_idx ON camera_work_shifts (status, work_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS camera_template_dates_idx ON camera_schedule_templates (start_date, end_date);
CREATE INDEX IF NOT EXISTS camera_violation_author_idx ON camera_violations (author_id, event_datetime) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS camera_violation_datetime_idx ON camera_violations (event_datetime DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS camera_attachment_violation_idx ON camera_violation_attachments (violation_id);


CREATE TABLE IF NOT EXISTS camera_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  object_name text NOT NULL,
  title text NOT NULL, description text, status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','completed','cancelled')),
  source_ticket_id uuid, created_by uuid NOT NULL REFERENCES users(id), assignee_id uuid REFERENCES users(id),
  resolution text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS camera_tickets_status_idx ON camera_tickets(status,created_at DESC);
