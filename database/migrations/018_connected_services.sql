-- Apply to the SD core before starting the split runtime. Disabling is non-destructive.
CREATE TABLE IF NOT EXISTS connected_services (
  code text PRIMARY KEY CHECK(code IN ('equipment','surveillance','security')),
  enabled boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO connected_services(code) VALUES('equipment'),('surveillance'),('security') ON CONFLICT DO NOTHING;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS equipment_name text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS equipment_inventory_number text;
-- Preserve ticket readability before equipment ownership moves out of the core.
DO $$ BEGIN
  IF to_regclass('public.equipment_items') IS NOT NULL THEN
    UPDATE tickets t SET equipment_name=e.name,equipment_inventory_number=e.inventory_number
      FROM equipment_items e WHERE t.equipment_id=e.id::text AND t.equipment_name IS NULL;
  END IF;
END $$;
