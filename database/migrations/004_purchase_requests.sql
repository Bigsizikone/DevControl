ALTER TABLE tickets ADD COLUMN IF NOT EXISTS purchase_required boolean NOT NULL DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS erp_request_numbers text[] NOT NULL DEFAULT ARRAY[]::text[];
