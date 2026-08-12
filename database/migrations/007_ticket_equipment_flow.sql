ALTER TABLE tickets ADD COLUMN IF NOT EXISTS repair_required boolean NOT NULL DEFAULT false;

ALTER TABLE equipment_items DROP CONSTRAINT IF EXISTS equipment_items_status_check;
ALTER TABLE equipment_items ADD CONSTRAINT equipment_items_status_check CHECK (status IN ('new', 'in_stock', 'issued', 'repair', 'replacement', 'writeoff_process', 'written_off'));

INSERT INTO ticket_kinds (id, ticket_type_id, code, name, is_active)
VALUES ('a0000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000002', 'repair', 'Ремонт', true)
ON CONFLICT (id) DO NOTHING;

UPDATE system_integrations
SET api_description = '{
  "base_url": "https://supplier.example/api",
  "authentication": "Authorization: Bearer <token>",
  "links": [
    {"rel": "Номенклатура", "href": "/api/v1/nomenclature"},
    {"rel": "Склады", "href": "/api/v1/warehouses"},
    {"rel": "Остатки", "href": "/api/v1/stock?warehouseCode=MAIN"},
    {"rel": "Поступления ТМЦ", "href": "/api/v1/inventory-receipts"},
    {"rel": "Движение оборудования", "href": "/api/v1/equipment-movements"}
  ],
  "methods": [
    {"method":"GET","path":"/api/v1/nomenclature","description":"Получить справочник номенклатуры","attributes":["id: string — идентификатор","code: string — код номенклатуры","name: string — наименование","category: string — категория","unit: string — единица измерения","is_active: boolean — активна"],"response":"{ items: Nomenclature[] }"},
    {"method":"GET","path":"/api/v1/warehouses","description":"Получить склады организации","attributes":["id: string — идентификатор","code: string — код склада","name: string — наименование","organization_id: string — организация","address: string — адрес","is_active: boolean — активен"],"response":"{ items: Warehouse[] }"},
    {"method":"GET","path":"/api/v1/stock?warehouseCode=MAIN","description":"Получить остатки номенклатуры","attributes":["warehouse_id: string — склад","nomenclature_id: string — номенклатура","quantity: number — количество","unit: string — единица измерения","is_used: boolean — Б/У","comment: string — комментарий"],"response":"{ items: StockLine[] }"},
    {"method":"POST","path":"/api/v1/inventory-receipts","description":"Создать документ поступления ТМЦ","attributes":["organization_id: string — организация","warehouse_id: string — склад","employee_id: string — сотрудник, получивший ТМЦ","nomenclature_id: string — номенклатура","quantity: number — количество > 0","comment: string — комментарий"],"request_body":"{ organization_id, warehouse_id, employee_id, nomenclature_id, quantity, comment }","response":"{ document_number: number, status: ''posted'' }"},
    {"method":"POST","path":"/api/v1/equipment-movements","description":"Создать документ движения оборудования","attributes":["equipment_id: string — оборудование","organization_id: string — организация","department_id: string — подразделение","employee_id: string — сотрудник","issued_by: string — сотрудник, проводивший выдачу","status: string — new|issued|repair|replacement|writeoff_process|written_off","requires_approval: boolean — требуется согласование","approver_id: string — согласующий, обязателен при requires_approval=true","comment: string — комментарий"],"request_body":"{ equipment_id, organization_id, department_id, employee_id, issued_by, status, requires_approval, approver_id, comment }","response":"{ document_number: number, equipment_status: string }"}
  ]
}'::jsonb
WHERE code = 'DEMO-PORTAL';
