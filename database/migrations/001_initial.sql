-- Service Desk persistence foundation. PostgreSQL 15+.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL
);

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (role_id, permission_id, effect)
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  manager_id uuid REFERENCES users(id),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  geometry jsonb,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE user_competencies (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 1 CHECK (level > 0),
  valid_from timestamptz,
  valid_to timestamptz,
  PRIMARY KEY (user_id, competency_id),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from)
);

CREATE TABLE support_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  manager_id uuid REFERENCES users(id),
  organization_id uuid REFERENCES organizations(id),
  department_id uuid REFERENCES departments(id),
  territory_id uuid REFERENCES territories(id),
  calendar_code text,
  work_schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  assignment_policy jsonb NOT NULL DEFAULT '{"strategies":["min_active_load"]}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_group_members (
  support_group_id uuid NOT NULL REFERENCES support_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  valid_from timestamptz,
  valid_to timestamptz,
  PRIMARY KEY (support_group_id, user_id)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  parent_id uuid REFERENCES categories(id),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE ticket_kinds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type_id uuid NOT NULL REFERENCES ticket_types(id),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (ticket_type_id, code)
);

CREATE TABLE ticket_type_competencies (
  ticket_type_id uuid NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  min_level integer NOT NULL DEFAULT 1 CHECK (min_level > 0),
  required boolean NOT NULL DEFAULT true,
  PRIMARY KEY (ticket_type_id, competency_id)
);

CREATE TABLE routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  event_type text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  active_from timestamptz,
  active_to timestamptz,
  current_version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE routing_rule_versions (
  rule_id uuid NOT NULL REFERENCES routing_rules(id) ON DELETE CASCADE,
  version integer NOT NULL,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_comment text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, version)
);

CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  subject text NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES users(id),
  organization_id uuid REFERENCES organizations(id),
  department_id uuid REFERENCES departments(id),
  territory_id uuid REFERENCES territories(id),
  category_id uuid REFERENCES categories(id),
  ticket_type_id uuid REFERENCES ticket_types(id),
  ticket_kind_id uuid REFERENCES ticket_kinds(id),
  equipment_id text,
  project_id text,
  priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'new',
  support_group_id uuid REFERENCES support_groups(id),
  assignee_id uuid REFERENCES users(id),
  sla_policy_id text,
  route_version text,
  approval_required boolean NOT NULL DEFAULT false,
  visit_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE ticket_observers (
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);

CREATE TABLE ticket_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  support_group_id uuid REFERENCES support_groups(id),
  assignee_id uuid REFERENCES users(id),
  assigned_by uuid REFERENCES users(id),
  reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE UNIQUE INDEX one_current_ticket_assignment
  ON ticket_assignments(ticket_id) WHERE ended_at IS NULL;

CREATE TABLE ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ticket_sla_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  policy_id text NOT NULL,
  calendar_code text,
  target_at timestamptz,
  breached_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  policy_version text NOT NULL
);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES users(id),
  actor_type text NOT NULL DEFAULT 'user',
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text,
  correlation_id text,
  decision_id text,
  ip inet,
  user_agent text
);

CREATE INDEX tickets_scope_idx ON tickets (organization_id, department_id, territory_id, category_id);
CREATE INDEX tickets_queue_idx ON tickets (support_group_id, assignee_id, status, priority);
CREATE INDEX tickets_sla_idx ON tickets (status, updated_at, sla_policy_id);
CREATE INDEX audit_resource_idx ON audit_log (resource_type, resource_id, occurred_at);
CREATE INDEX routing_rules_event_idx ON routing_rules (event_type, status, priority DESC);
