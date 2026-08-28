CREATE TABLE IF NOT EXISTS systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS development_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'Ведется разработка функционала' CHECK (status IN ('Ведется разработка функционала', 'Черновик', 'Архив')),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE ticket_kinds ADD COLUMN IF NOT EXISTS system_id uuid REFERENCES systems(id);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS development_required boolean NOT NULL DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS development_board_id uuid REFERENCES development_boards(id);

CREATE INDEX IF NOT EXISTS ticket_kinds_system_idx ON ticket_kinds(system_id);
CREATE INDEX IF NOT EXISTS tickets_development_idx ON tickets(development_required, development_board_id, status);

UPDATE ticket_types
SET is_default = name IN ('Запрос на обслуживание', 'Инцидент', 'Запрос прав доступа');
