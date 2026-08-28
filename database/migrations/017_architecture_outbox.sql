-- Transitional outbox for the legacy monolith. Business tables remain source of truth;
-- a worker publishes these rows after commit and consumers record processed events.
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  correlation_id text NOT NULL DEFAULT COALESCE(current_setting('app.correlation_id', true), 'system'),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX IF NOT EXISTS outbox_events_pending_idx ON outbox_events (occurred_at) WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS processed_events (
  event_id uuid NOT NULL,
  consumer text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, consumer)
);

CREATE OR REPLACE FUNCTION enqueue_domain_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  event_name text;
  aggregate_id text;
  event_payload jsonb;
BEGIN
  aggregate_id := COALESCE(NEW.id, OLD.id)::text;
  event_name := CASE
    WHEN TG_TABLE_NAME = 'tickets' AND TG_OP = 'INSERT' THEN 'TicketCreated'
    WHEN TG_TABLE_NAME = 'tickets' THEN 'TicketUpdated'
    WHEN TG_TABLE_NAME = 'development_cards' AND TG_OP = 'INSERT' THEN 'DevelopmentTaskCreated'
    WHEN TG_TABLE_NAME = 'development_cards' AND OLD.status IS DISTINCT FROM NEW.status THEN 'DevelopmentTaskStatusChanged'
    ELSE 'DevelopmentTaskUpdated'
  END;
  event_payload := jsonb_build_object('operation', TG_OP, 'table', TG_TABLE_NAME, 'after', to_jsonb(NEW));
  INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload)
  VALUES (event_name, TG_TABLE_NAME, aggregate_id, event_payload);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_outbox_event_trigger ON tickets;
CREATE TRIGGER tickets_outbox_event_trigger AFTER INSERT OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION enqueue_domain_event();
DROP TRIGGER IF EXISTS development_cards_outbox_event_trigger ON development_cards;
CREATE TRIGGER development_cards_outbox_event_trigger AFTER INSERT OR UPDATE ON development_cards FOR EACH ROW EXECUTE FUNCTION enqueue_domain_event();
