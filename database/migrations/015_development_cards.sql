CREATE TABLE IF NOT EXISTS development_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  code text NOT NULL UNIQUE DEFAULT ('DEV-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  ticket_id uuid NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES development_boards(id),
  system_id uuid NOT NULL REFERENCES systems(id),
  status text NOT NULL DEFAULT 'Backlog' CHECK (status IN ('Backlog', 'Аналитика', 'Разработка', 'Документация', 'Тестирование', 'Готово к релизу', 'Выпущено в релиз')),
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS development_cards_board_status_idx ON development_cards(board_id, system_id, status);

INSERT INTO development_cards (ticket_id, board_id, system_id, status, title, description)
SELECT t.id, t.development_board_id, tk.system_id, t.development_status, t.subject, t.description
FROM tickets t
JOIN ticket_kinds tk ON tk.id = t.ticket_kind_id
WHERE t.development_required = true
  AND t.development_board_id IS NOT NULL
  AND tk.system_id IS NOT NULL
ON CONFLICT (ticket_id) DO UPDATE
SET board_id = EXCLUDED.board_id,
    system_id = EXCLUDED.system_id,
    status = EXCLUDED.status,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    updated_at = now();
