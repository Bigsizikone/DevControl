BEGIN;

INSERT INTO nomenclature (id, code, name, category, unit) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'PRINTER-LASER-A4', 'Принтер лазерный А4', 'Печатающая техника', 'шт'),
  ('e0000000-0000-0000-0000-000000000002', 'MONITOR-24', 'Монитор 24 дюйма', 'Мониторы', 'шт'),
  ('e0000000-0000-0000-0000-000000000003', 'TONER-HP-107A', 'Картридж HP 107A', 'Расходные материалы', 'шт'),
  ('e0000000-0000-0000-0000-000000000004', 'LAPTOP-OFFICE', 'Ноутбук офисный', 'Компьютерная техника', 'шт')
ON CONFLICT (id) DO NOTHING;

INSERT INTO warehouses (id, code, name, organization_id, address) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'MAIN', 'Основной склад ИТ', '30000000-0000-0000-0000-000000000001', 'г. Новосибирск, ул. Складская, 1'),
  ('e1000000-0000-0000-0000-000000000002', 'OFFICE', 'Склад офиса', '30000000-0000-0000-0000-000000000001', 'г. Новосибирск, ул. Центральная, 10')
ON CONFLICT (id) DO NOTHING;

INSERT INTO warehouse_stock (warehouse_id, nomenclature_id, quantity, comment, is_used) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 8, 'Новые, в упаковке', false),
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 24, 'Резерв для принтеров', false),
  ('e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 5, 'Часть оборудования Б/У', true)
ON CONFLICT (warehouse_id, nomenclature_id) DO NOTHING;

INSERT INTO equipment_items (id, inventory_number, name, equipment_type, serial_number, status, toner_level, toner_available, warehouse_id, organization_id, department_id, assigned_to, comment) VALUES
  ('e2000000-0000-0000-0000-000000000001', 'INV-PRN-0001', 'HP LaserJet Pro', 'Принтер', 'HP107A-001', 'in_stock', 78, true, 'e1000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', null, 'Готов к выдаче'),
  ('e2000000-0000-0000-0000-000000000002', 'INV-PRN-0002', 'Canon i-SENSYS', 'Принтер', 'CANON-002', 'issued', 18, true, 'e1000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'Требуется пополнение тонера'),
  ('e2000000-0000-0000-0000-000000000003', 'INV-MON-0001', 'Монитор Dell 24', 'Монитор', 'DELL-24-001', 'repair', null, null, 'e1000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', null, 'Полосы на экране')
ON CONFLICT (id) DO NOTHING;

INSERT INTO equipment_movements (id, equipment_id, organization_id, department_id, employee_id, issued_by, status, requires_approval, approver_id, comment) VALUES
  ('e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'issued', false, null, 'Выдано для работы в офисе')
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory_receipts (id, organization_id, warehouse_id, employee_id, nomenclature_id, quantity, comment) VALUES
  ('e4000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 12, 'Поступление по накладной №ТМЦ-2026-001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO system_integrations (id, code, name, integration_type, endpoint, database_name, description, api_description) VALUES
  ('e5000000-0000-0000-0000-000000000001', 'DEMO-1C', '1С:ERP тестовый контур', '1c', 'http://1c-demo.local/odata', 'ERP_DEMO', 'Обмен номенклатурой и поступлениями ТМЦ', '{"methods":[{"method":"GET","path":"/odata/StandardODATA/Catalog_Номенклатура","description":"Получить номенклатуру"},{"method":"POST","path":"/odata/StandardODATA/Document_ПоступлениеТоваров","description":"Передать поступление ТМЦ"}]}'),
  ('e5000000-0000-0000-0000-000000000002', 'DEMO-PORTAL', 'Портал поставщика', 'external_site', 'https://supplier.example/api', null, 'Внешний сайт поставщика', '{"headers":["Authorization: Bearer <token>","Content-Type: application/json"],"methods":[{"method":"GET","path":"/api/v1/items","description":"Получить список товаров"},{"method":"GET","path":"/api/v1/stock","description":"Получить остатки"},{"method":"POST","path":"/api/v1/orders","description":"Создать заказ поставщику"}]}')
ON CONFLICT (id) DO NOTHING;

COMMIT;
