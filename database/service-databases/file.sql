CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_service text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, object_key text NOT NULL UNIQUE, original_file_name text NOT NULL, mime_type text NOT NULL, file_size bigint NOT NULL, checksum text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
CREATE INDEX IF NOT EXISTS files_entity_idx ON files(owner_service,entity_type,entity_id) WHERE deleted_at IS NULL;
