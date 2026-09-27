-- Контур информационной безопасности. Общие реквизиты хранятся отдельно,
-- расширяемые поля объекта — в JSONB, связи и история — нормализованы.
CREATE TABLE IF NOT EXISTS security_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('incident','violation','access','privileged','vulnerability','information_system','pdsn','software','media','audit','risk','action','document','regulation','exception','event','kii','setting')),
  record_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'new',
  severity text,
  visibility_level text NOT NULL DEFAULT 'standard' CHECK (visibility_level IN ('standard','restricted','confidential','security_only')),
  organization_id uuid REFERENCES organizations(id),
  department_id uuid REFERENCES departments(id),
  owner_id uuid REFERENCES users(id),
  assignee_id uuid REFERENCES users(id),
  source_ticket_id uuid,
  due_date date,
  review_date date,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS security_record_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES security_records(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_record_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES security_records(id) ON DELETE CASCADE,
  linked_record_id uuid REFERENCES security_records(id) ON DELETE CASCADE,
  linked_ticket_id uuid,
  relation_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (linked_record_id IS NOT NULL OR linked_ticket_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS security_record_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES security_records(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  original_file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_records_type_status_idx ON security_records (entity_type, status, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS security_records_severity_idx ON security_records (severity, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS security_records_scope_idx ON security_records (organization_id, department_id, owner_id, assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS security_records_search_idx ON security_records USING gin (to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(description,'')));
CREATE INDEX IF NOT EXISTS security_comments_record_idx ON security_record_comments (record_id, created_at);
CREATE INDEX IF NOT EXISTS security_attachments_record_idx ON security_record_attachments (record_id, created_at);
