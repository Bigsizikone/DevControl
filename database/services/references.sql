-- Directory projection; the SD core remains the authority. No credentials are replicated.
CREATE TABLE IF NOT EXISTS organizations(id uuid PRIMARY KEY,name text NOT NULL,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS departments(id uuid PRIMARY KEY,name text NOT NULL,organization_id uuid,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY,display_name text NOT NULL,email text,organization_id uuid,department_id uuid,is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS roles(id uuid PRIMARY KEY,code text NOT NULL,name text NOT NULL,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS user_roles(user_id uuid REFERENCES users(id),role_id uuid REFERENCES roles(id),PRIMARY KEY(user_id,role_id));
CREATE TABLE IF NOT EXISTS service_migrations(service text PRIMARY KEY,imported_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE service_migrations ADD COLUMN IF NOT EXISTS source_fingerprint text;
CREATE TABLE IF NOT EXISTS audit_log (
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
