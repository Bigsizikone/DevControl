CREATE TABLE IF NOT EXISTS nomenclature (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Оборудование',
  unit text NOT NULL DEFAULT 'шт',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  organization_id uuid REFERENCES organizations(id),
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouse_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  nomenclature_id uuid NOT NULL REFERENCES nomenclature(id),
  quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  comment text,
  is_used boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, nomenclature_id)
);

CREATE TABLE IF NOT EXISTS equipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_number text NOT NULL UNIQUE,
  name text NOT NULL,
  equipment_type text NOT NULL,
  serial_number text,
  status text NOT NULL DEFAULT 'in_stock' CHECK (status IN ('new', 'in_stock', 'issued', 'repair', 'replacement', 'writeoff_process', 'written_off')),
  toner_level integer CHECK (toner_level IS NULL OR toner_level BETWEEN 0 AND 100),
  toner_available boolean,
  warehouse_id uuid REFERENCES warehouses(id),
  organization_id uuid REFERENCES organizations(id),
  department_id uuid REFERENCES departments(id),
  assigned_to uuid REFERENCES users(id),
  comment text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  equipment_id uuid REFERENCES equipment_items(id),
  organization_id uuid REFERENCES organizations(id),
  department_id uuid REFERENCES departments(id),
  employee_id uuid REFERENCES users(id),
  issued_by uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'issued', 'repair', 'replacement', 'writeoff_process', 'written_off')),
  requires_approval boolean NOT NULL DEFAULT false,
  approver_id uuid REFERENCES users(id),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT requires_approval OR approver_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS inventory_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  organization_id uuid REFERENCES organizations(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  employee_id uuid REFERENCES users(id),
  nomenclature_id uuid NOT NULL REFERENCES nomenclature(id),
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipment_status_idx ON equipment_items(status, equipment_type);
CREATE INDEX IF NOT EXISTS warehouse_stock_lookup_idx ON warehouse_stock(warehouse_id, nomenclature_id);
CREATE INDEX IF NOT EXISTS equipment_movements_status_idx ON equipment_movements(status, created_at);
CREATE INDEX IF NOT EXISTS inventory_receipts_created_idx ON inventory_receipts(created_at DESC);

CREATE TABLE IF NOT EXISTS equipment_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  equipment_id uuid NOT NULL REFERENCES equipment_items(id),
  title text NOT NULL, description text, status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','completed','cancelled')),
  source_ticket_id uuid, created_by uuid NOT NULL REFERENCES users(id), assignee_id uuid REFERENCES users(id),
  resolution text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equipment_repairs_status_idx ON equipment_repairs(status,created_at DESC);
