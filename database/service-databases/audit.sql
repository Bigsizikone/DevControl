CREATE TABLE IF NOT EXISTS audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, correlation_id text, entity_type text NOT NULL, entity_id text NOT NULL, action text NOT NULL, user_id uuid, service text NOT NULL, old_value jsonb, new_value jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events(entity_type,entity_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_correlation_idx ON audit_events(correlation_id);
CREATE UNIQUE INDEX IF NOT EXISTS audit_events_event_uidx ON audit_events(event_id);
