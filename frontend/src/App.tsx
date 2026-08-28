import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { EquipmentPanel, IntegrationsPanel, InventoryPanel } from './business-panels';
import { CamerasPanelV2 as CamerasPanel } from './camera-panel-v2';
import { SecurityPanel } from './security-panel2';

type Tab = 'overview' | 'tickets' | 'development' | 'access' | 'routing' | 'reports' | 'equipment' | 'inventory' | 'integrations' | 'cameras' | 'admin' | 'security';
type AccessResult = { allowed: boolean; reason: string; decisionId: string };
type RoutingResult = {
  matchedRuleIds: string[];
  supportGroupId?: string;
  assigneeId?: string;
  slaPolicyId?: string;
  priority?: number;
  approvalRequired: boolean;
  visitRequired: boolean;
  reasons: string[];
};
type AdminTable = { name: string; label: string; block: string; rowCount: number };
type AdminReference = { table: string; label: string };
type AdminColumn = { name: string; label: string; reference?: AdminReference; dataType: string; nullable: boolean; defaultValue: string | null; generated: boolean };
type AdminData = { name: string; columns: AdminColumn[]; primaryKey: string[]; rows: Array<Record<string, unknown>>; displayRows?: Array<Record<string, unknown>>; limit: number; offset: number };
type AdminLookup = { value: string; label: string };
type HealthResponse = { status: string; database: 'up' | 'down' };
type TicketUser = { id: string; display_name: string; email: string };
type TicketType = { id: string; code: string; name: string; is_default?: boolean };
type TicketKind = { id: string; ticket_type_id: string; system_id?: string | null; code: string; name: string };
type DevelopmentBoard = { id: string; code: string; name: string; status: string; description?: string | null };
type TicketEquipment = { id: string; inventory_number: string; name: string; status: string };
type TicketComment = { id: string; body: string; created_at: string; author_name: string };
type TicketDocument = { id: string; number: number; subject: string; description?: string; status: string; priority?: number; created_at: string; requester_name: string; requester_email: string; assignee_name?: string | null; visit_required: boolean; visit_scheduled_at?: string | null; purchase_required: boolean; erp_request_numbers?: string[]; repair_required?: boolean; development_required?: boolean; development_board_id?: string | null; development_board_name?: string | null; equipment_id?: string | null; ticket_type_name?: string; ticket_kind_name?: string; equipment_inventory_number?: string; equipment_name?: string };
type TicketDetail = TicketDocument & { priority?: number; comments: TicketComment[] };

const CURRENT_ROLE = 'admin' as const;

const request = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'x-role': CURRENT_ROLE, ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json() as Promise<T>;
};
const api = async <T,>(path: string, body: unknown): Promise<T> => request<T>(path, { method: 'POST', body: JSON.stringify(body) });

function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [accessResult, setAccessResult] = useState<AccessResult | null>(null);
  const [routingResult, setRoutingResult] = useState<RoutingResult | null>(null);
  const [ticketToOpen, setTicketToOpen] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [databaseOnline, setDatabaseOnline] = useState<boolean | null>(null);

  useEffect(() => {
    void request<HealthResponse>('/health')
      .then((result) => setDatabaseOnline(result.database === 'up'))
      .catch(() => setDatabaseOnline(false));
  }, []);

  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setError('');
    try { await action(); } catch { setError('Не удалось получить ответ API. Проверьте доступность backend.'); }
    finally { setLoading(false); }
  };

  const accessCheck = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const userId = String(data.get('userId'));
    const role = String(data.get('role')) as 'initiator' | 'dispatcher' | 'admin';
    return run(async () => {
      const result = await api<AccessResult>('/access/check', {
        user: { id: userId, roleCodes: [role] },
        permission: String(data.get('permission')),
        ticket: { id: 'demo-ticket-42', createdBy: String(data.get('createdBy')) },
      });
      setAccessResult(result);
    });
  };

  const routeTicket = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const typeId = String(data.get('typeId'));
    const subject = String(data.get('subject'));
    return run(async () => {
      const result = await api<RoutingResult>('/routing/simulate', {
        ticket: { id: 'demo-ticket-42', createdBy: 'u-1', typeId, subject },
        rules: [{
          id: 'rule-network',
          priority: 100,
          conditions: [{ field: 'ticket.typeId', op: 'eq', value: typeId }],
          actions: {
            supportGroupId: 'network',
            slaPolicyId: 'p1-4h',
            priority: subject.toLowerCase().includes('срочно') ? 1 : 3,
            assignmentPolicy: { strategies: ['min_active_load'] },
          },
        }],
        groups: [{ id: 'network', active: true, memberIds: ['u-2', 'u-3'] }],
        candidates: [
          { userId: 'u-2', active: true, competencyIds: ['network'], activeTicketCount: 4 },
          { userId: 'u-3', active: true, competencyIds: ['network'], activeTicketCount: 1 },
        ],
        requiredCompetencyIds: ['network'],
      });
      setRoutingResult(result);
    });
  };

  const navItems = useMemo(() => [
    { id: 'overview' as Tab, icon: '⌂', label: 'Обзор' },
    { id: 'tickets' as Tab, icon: '□', label: 'Обращения' },
    { id: 'development' as Tab, icon: '▥', label: 'Доска разработки' },
    { id: 'access' as Tab, icon: '◈', label: 'Проверка доступа' },
    { id: 'routing' as Tab, icon: '↗', label: 'Маршрутизация' },
    { id: 'reports' as Tab, icon: '▤', label: 'Отчёты' },
    { id: 'equipment' as Tab, icon: '▣', label: 'Оборудование' },
    { id: 'inventory' as Tab, icon: '▥', label: 'Склад и ТМЦ' },
    { id: 'integrations' as Tab, icon: '⇄', label: 'Обмены с ИС' },
    ...(['operator', 'senior_operator', 'admin'].includes(CURRENT_ROLE) ? [{ id: 'cameras' as Tab, icon: '◉', label: 'Видеокамеры' }] : []),
    ...(CURRENT_ROLE === 'admin' ? [{ id: 'admin' as Tab, icon: '▦', label: 'НСИ' }] : []),
    ...(CURRENT_ROLE === 'admin' ? [{ id: 'security' as Tab, icon: '⚿', label: 'Информационная безопасность' }] : []),
  ], []);

  return (
    <div className="app-shell light-theme">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">SD</span><span>Service Desk</span></div>
        <div className="workspace-label">КОНТУР УПРАВЛЕНИЯ</div>
        <nav>{navItems.map((item) => <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} className={tab === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setTab(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
        <div className="sidebar-bottom"><div className="server-status"><span className="status-dot" /> {databaseOnline === null ? 'Проверка API и БД…' : databaseOnline ? 'API и БД онлайн' : 'БД недоступна'}</div><div className="user-chip"><span className="avatar">AK</span><div><strong>Анна Кузнецова</strong><small>Администратор</small></div><span className="chevron">⌄</span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>Service Desk</span><b>/</b><strong>{navItems.find((item) => item.id === tab)?.label}</strong></div><div className="topbar-actions"><span className="environment"><span className="status-dot" /> Production</span><button className="icon-button" aria-label="Уведомления">♢<i>3</i></button><button className="new-ticket" onClick={() => setTab('routing')}><span>＋</span> Новая заявка</button></div></header>
        <section className="content">
          {tab === 'overview' && <Overview onAccess={() => setTab('access')} onRouting={() => setTab('routing')} onReports={() => setTab('reports')} onOpenTicket={(id) => { setTicketToOpen(id); setTab('tickets'); }} onEquipment={() => setTab('equipment')} />}
          {tab === 'tickets' && <TicketPanel initialTicketId={ticketToOpen} />}
          {tab === 'development' && <DevelopmentBoardPanel onOpenTicket={(id) => { setTicketToOpen(id); setTab('tickets'); }} />}
          {tab === 'access' && <AccessPanel onSubmit={accessCheck} result={accessResult} loading={loading} />}
          {tab === 'routing' && <RoutingPanel onSubmit={routeTicket} result={routingResult} loading={loading} />}
          {tab === 'reports' && <ReportsPanel onOpenTicket={(id) => { setTicketToOpen(id); setTab('tickets'); }} />}
          {tab === 'equipment' && <EquipmentPanel />}
          {tab === 'inventory' && <InventoryPanel />}
          {tab === 'integrations' && <IntegrationsPanel />}
          {tab === 'cameras' && <CamerasPanel />}
          {tab === 'admin' && <AdminPanel />}
          {tab === 'security' && <SecurityPanel />}
          {error && <div className="error-banner">{error}</div>}
        </section>
      </main>
    </div>
  );
}

function Overview({ onAccess, onRouting, onReports, onOpenTicket, onEquipment }: { onAccess: () => void; onRouting: () => void; onReports: () => void; onOpenTicket: (id: string) => void; onEquipment: () => void }) {
  const [tickets, setTickets] = useState<TicketDocument[]>([]);
  useEffect(() => { void request<{ tickets: TicketDocument[] }>('/tickets').then((result) => setTickets(result.tickets)).catch(() => undefined); }, []);
  const active = tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status));
  const unassigned = active.filter((ticket) => !ticket.assignee_name).length;
  return <>
    <div className="page-heading"><div><div className="eyebrow">ЧЕТВЕРГ, 06 АВГУСТА 2026</div><h1>Добрый день, Анна</h1><p>Контроль доступа, заявок и активов в одном месте.</p></div><button className="outline-button" onClick={onRouting}>Открыть симулятор <span>→</span></button></div>
    <div className="metric-grid"><Metric label="Активные заявки" value={active.length} delta="Открыть обращения" tone="blue" icon="◫" onClick={() => onOpenTicket(active[0]?.id ?? tickets[0]?.id ?? '')} /><Metric label="Без исполнителя" value={unassigned} delta="Контроль очереди" tone="amber" icon="⊙" onClick={onReports} /><Metric label="Риск SLA" value={tickets.filter((ticket) => ticket.priority && ticket.priority <= 2).length} delta="Открыть отчёт" tone="red" icon="△" onClick={onReports} /><Metric label="Оборудование" value="Реестр" delta="Открыть раздел" tone="green" icon="◎" onClick={onEquipment} /></div>
    <div className="overview-grid"><section className="panel activity-panel"><div className="panel-title"><h2>Поток заявок</h2><button className="panel-action" onClick={onReports}>Открыть отчёт →</button></div><button className="chart chart-button" onClick={onReports}><div className="chart-y"><span>60</span><span>40</span><span>20</span><span>0</span></div><div className="chart-area"><div className="grid-lines"><i /><i /><i /><i /></div><svg viewBox="0 0 640 180" preserveAspectRatio="none" aria-label="График заявок"><defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#4c8dff" stopOpacity=".28" /><stop offset="100%" stopColor="#4c8dff" stopOpacity="0" /></linearGradient></defs><path d="M0 145 C45 135 48 115 92 123 S135 90 180 105 S232 65 270 92 S315 110 350 75 S410 90 445 55 S500 70 535 42 S585 66 640 25 V180 H0Z" fill="url(#areaFill)" /><path d="M0 145 C45 135 48 115 92 123 S135 90 180 105 S232 65 270 92 S315 110 350 75 S410 90 445 55 S500 70 535 42 S585 66 640 25" fill="none" stroke="#63a0ff" strokeWidth="3" /></svg><div className="chart-x"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>Сейчас</span></div></div></button></section><section className="panel shortcuts-panel"><PanelTitle title="Быстрые действия" /><QuickAction icon="◈" title="Проверить право" text="Проверить доступ пользователя к заявке" onClick={onAccess} /><QuickAction icon="↗" title="Симулировать маршрут" text="Понять, кто получит новую заявку" onClick={onRouting} /><QuickAction icon="＋" title="Создать заявку" text="Открыть карточку нового обращения" onClick={onRouting} /></section></div>
    <section className="panel table-panel"><PanelTitle title="Последняя активность" action="Открыть журнал →" /><div className="table-wrap"><table><thead><tr><th>Заявка</th><th>Тема</th><th>Пользователь</th><th>Исполнитель</th><th>Статус</th><th>Обновлено</th></tr></thead><tbody>{tickets.slice(0, 6).map((ticket) => <tr key={ticket.id} className="ticket-row" onClick={() => onOpenTicket(ticket.id)}><td className="ticket-id">SD-{ticket.number}</td><td>{ticket.subject}</td><td>{ticket.requester_name}</td><td>{ticket.assignee_name ?? 'Не назначен'}</td><td><span className="pill progress">{translateTicketStatus(ticket.status)}</span></td><td>{new Date(ticket.created_at).toLocaleString('ru-RU')}</td></tr>)}{tickets.length === 0 && <EmptyDashboardRow />}</tbody></table></div></section>
  </>;
}

function EmptyDashboardRow() { return <tr><td colSpan={6}><div className="empty-state small"><span>⊙</span><p>Активность появится после создания обращений</p></div></td></tr>; }
function Metric({ label, value, delta, tone, icon, onClick }: { label: string; value: string | number; delta: string; tone: string; icon: string; onClick?: () => void }) { return <button className="metric-card" onClick={onClick}><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small className={tone}>{delta}</small></div><span className="metric-arrow">↗</span></button>; }
function PanelTitle({ title, action }: { title: string; action?: string }) { return <div className="panel-title"><h2>{title}</h2>{action && <span>{action}</span>}</div>; }
function QuickAction({ icon, title, text, onClick }: { icon: string; title: string; text: string; onClick: () => void }) { return <button className="quick-action" onClick={onClick}><span className="quick-icon">{icon}</span><span><strong>{title}</strong><small>{text}</small></span><b>→</b></button>; }

const translateReason = (reason: string) => ({
  allowed: 'право доступа разрешено',
  permission_missing: 'право доступа отсутствует',
  ticket_relation_missing: 'нет связи пользователя с обращением',
  explicit_deny: 'явный запрет политики',
  no_matching_rule: 'правило не найдено',
  support_group_not_found: 'группа поддержки не найдена',
  no_eligible_assignee: 'нет подходящего исполнителя',
}[reason] ?? reason);

const translateGroup = (value?: string) => ({ network: 'Сетевые инженеры', 'network-l2': 'Сетевые инженеры · 2 линия', l1: 'Первая линия поддержки' }[value ?? ''] ?? value ?? 'Не распределено');
const translateAssignee = (value?: string) => ({ 'u-2': 'Илья Петров', 'u-3': 'Алексей Ким' }[value ?? ''] ?? value ?? 'Очередь диспетчера');
const translateSla = (value?: string) => ({ 'p1-4h': 'Критический · 4 часа', p1: 'Высокий · 4 часа' }[value ?? ''] ?? value ?? 'Не задан');
const formatCell = (value: unknown) => typeof value === 'boolean' ? (value ? 'Да' : 'Нет') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '—');
const translateTicketStatus = (status: string) => ({ new: 'Новый', in_progress: 'В работе', waiting: 'Ожидание', repair: 'В ремонте', resolved: 'Решена', closed: 'Закрыта' }[status] ?? status);
const formatCount = (count: number, one: string, few: string, many: string) => { const mod10 = count % 10; const mod100 = count % 100; return `${count} ${mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many}`; };

type ReportDefinition = { id: string; title: string; description: string; metric: string; metricLabel: string; columns: string[]; rows: string[][]; ticketIds?: string[] };
const REPORTS: ReportDefinition[] = [
  { id: 'flow', title: 'Поток заявок', description: 'Динамика созданных и закрытых обращений', metric: '42', metricLabel: 'активные заявки', columns: ['Период', 'Создано', 'Закрыто', 'Остаток'], rows: [['00:00–06:00', '8', '5', '3'], ['06:00–12:00', '14', '9', '5'], ['12:00–18:00', '13', '10', '3'], ['18:00–Сейчас', '7', '4', '3']] },
  { id: 'sla', title: 'Контроль SLA', description: 'Заявки с риском нарушения сроков', metric: '3', metricLabel: 'требуют внимания', columns: ['Заявка', 'Тема', 'Группа', 'Срок'], rows: [['SD-1', 'Недоступен VPN после обновления', 'Сетевые инженеры', '3 ч 12 мин'], ['SD-2', 'Замена рабочего монитора', 'Выездная служба', '8 ч'], ['SD-3', 'Поступление оборудования', 'ИТ и цифровые сервисы', '38 мин']], ticketIds: ['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002'] },
  { id: 'groups', title: 'Нагрузка групп', description: 'Распределение активных заявок по группам поддержки', metric: '8', metricLabel: 'активных групп', columns: ['Группа поддержки', 'Активные', 'Без исполнителя', 'Загрузка'], rows: [['Сетевые инженеры', '12', '1', '76%'], ['Первая линия поддержки', '18', '3', '68%'], ['Выездная служба', '7', '2', '54%'], ['Поддержка 1С', '5', '1', '42%']] },
  { id: 'access', title: 'Аудит доступа', description: 'Результаты проверок ролей и прав пользователей', metric: '98%', metricLabel: 'разрешённых решений', columns: ['Роль', 'Проверок', 'Разрешено', 'Отказано'], rows: [['Администратор', '24', '24', '0'], ['Диспетчер', '41', '39', '2'], ['Инициатор', '33', '28', '5']] },
];

function ReportsPanel({ onOpenTicket }: { onOpenTicket: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState('flow');
  const [period, setPeriod] = useState('Последние 24 часа');
  const report = REPORTS.find((item) => item.id === selectedId) ?? REPORTS[0];
  return <div className="tool-page reports-page"><div className="page-heading compact"><div><div className="eyebrow">АНАЛИТИКА SERVICE DESK</div><h1>Отчёты</h1><p>Выберите отчёт — откроется форма с показателями и детализацией данных.</p></div><span className="tool-badge">{REPORTS.length} отчёта</span></div><div className="reports-layout"><aside className="panel report-list"><div className="panel-title"><h2>Доступные отчёты</h2><span>Нажмите для открытия</span></div>{REPORTS.map((item) => <button key={item.id} className={item.id === report.id ? 'report-nav active' : 'report-nav'} onClick={() => setSelectedId(item.id)}><span className="report-nav-icon">▤</span><span><strong>{item.title}</strong><small>{item.description}</small></span><b>→</b></button>)}</aside><section className="panel report-detail"><div className="report-detail-head"><div><div className="eyebrow">ФОРМА ОТЧЁТА</div><h2>{report.title}</h2><p>{report.description}</p></div><div className="report-kpi"><strong>{report.metric}</strong><span>{report.metricLabel}</span></div></div><div className="report-form-grid"><label>Отчёт<input value={report.title} readOnly /></label><label>Период<select value={period} onChange={(event) => setPeriod(event.target.value)}><option>Последние 24 часа</option><option>Текущая неделя</option><option>Текущий месяц</option></select></label></div><div className="report-table-wrap"><table className="report-table"><thead><tr>{report.columns.map((column) => <th key={column}>{column}</th>)}{report.ticketIds && <th>Действие</th>}</tr></thead><tbody>{report.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}{report.ticketIds && <td>{report.ticketIds[index] ? <button className="row-edit" onClick={() => onOpenTicket(report.ticketIds![index]!)}>Открыть заявку →</button> : '—'}</td>}</tr>)}</tbody></table></div><div className="report-footer"><span>Данные обновлены только что · заявки открываются напрямую</span><button className="outline-button" onClick={() => setPeriod('Последние 24 часа')}>Обновить отчёт ↻</button></div></section></div></div>;
}

const toLocalDateTime = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';

function TicketPanel({ initialTicketId }: { initialTicketId?: string }) {
  const [users, setUsers] = useState<TicketUser[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [ticketKinds, setTicketKinds] = useState<TicketKind[]>([]);
  const [equipment, setEquipment] = useState<TicketEquipment[]>([]);
  const [tickets, setTickets] = useState<TicketDocument[]>([]);
  const [userId, setUserId] = useState('');
  const [ticketTypeId, setTicketTypeId] = useState('');
  const [ticketKindId, setTicketKindId] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [developmentBoards, setDevelopmentBoards] = useState<DevelopmentBoard[]>([]);
  const [developmentRequired, setDevelopmentRequired] = useState(false);
  const [developmentBoardId, setDevelopmentBoardId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [visitRequired, setVisitRequired] = useState(false);
  const [visitAt, setVisitAt] = useState('');
  const [purchaseRequired, setPurchaseRequired] = useState(false);
  const [repairRequired, setRepairRequired] = useState(false);
  const [erpNumbers, setErpNumbers] = useState<string[]>(['']);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selectedUser = users.find((user) => user.id === userId);
  const selectedType = ticketTypes.find((item) => item.id === ticketTypeId);
  const selectedKind = ticketKinds.find((item) => item.id === ticketKindId);
  const equipmentRequired = selectedKind?.code === 'repair' || selectedType?.name === 'Запрос на обслуживание';
  const load = async () => { const [userResult, ticketResult, catalogResult] = await Promise.all([request<{ users: TicketUser[] }>('/tickets/users'), request<{ tickets: TicketDocument[] }>('/tickets'), request<{ types: TicketType[]; kinds: TicketKind[]; equipment: TicketEquipment[]; developmentBoards: DevelopmentBoard[]; defaultTypeId?: string | null }>('/tickets/catalog')]); setUsers(userResult.users); setTickets(ticketResult.tickets); setTicketTypes(catalogResult.types); setTicketKinds(catalogResult.kinds); setEquipment(catalogResult.equipment); setDevelopmentBoards(catalogResult.developmentBoards); if (!userId && userResult.users[0]) setUserId(userResult.users[0].id); if (!ticketTypeId && (catalogResult.defaultTypeId ?? catalogResult.types[0]?.id)) setTicketTypeId(catalogResult.defaultTypeId ?? catalogResult.types[0].id); if (!developmentBoardId && catalogResult.developmentBoards[0]) setDevelopmentBoardId(catalogResult.developmentBoards[0].id); };
  useEffect(() => { void load().catch(() => setMessage('Не удалось загрузить данные обращений.')); }, []);
  const openTicket = async (id: string) => { setMessage(''); try { const result = await request<{ ticket: TicketDetail }>(`/tickets/${id}`); setDetail(result.ticket); setVisitRequired(result.ticket.visit_required); setVisitAt(toLocalDateTime(result.ticket.visit_scheduled_at)); setPurchaseRequired(result.ticket.purchase_required); setRepairRequired(Boolean(result.ticket.repair_required)); const existingNumbers = result.ticket.erp_request_numbers ?? []; setErpNumbers(existingNumbers.length ? existingNumbers : ['']); } catch { setMessage('Не удалось открыть обращение.'); } };
  useEffect(() => { if (initialTicketId) void openTicket(initialTicketId); }, [initialTicketId]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (equipmentRequired && !equipmentId) { setMessage('Для запроса на обслуживание выберите оборудование.'); return; } if (developmentRequired && !developmentBoardId) { setMessage('Выберите доску разработки.'); return; } setBusy(true); setMessage(''); try { await api('/tickets', { userId, subject, description, ticketTypeId, ticketKindId, equipmentId, developmentRequired, developmentBoardId: developmentRequired ? developmentBoardId : null }); setSubject(''); setDescription(''); setEquipmentId(''); setDevelopmentRequired(false); setMessage('Документ обращения создан.'); await load(); } catch { setMessage('Не удалось создать обращение. Проверьте обязательные поля.'); } finally { setBusy(false); } };
  const saveTicketSettings = async () => { if (!detail) return; const numbers = erpNumbers.map((value) => value.trim()).filter(Boolean); if (numbers.some((value) => value.length > 20)) { setMessage('Каждый номер заявки ERP должен быть не длиннее 20 символов.'); return; } setBusy(true); setMessage(''); try { await request(`/tickets/${detail.id}`, { method: 'PATCH', body: JSON.stringify({ visitRequired, visitScheduledAt: visitRequired && visitAt ? new Date(visitAt).toISOString() : null, purchaseRequired, erpRequestNumbers: purchaseRequired ? numbers : [], repairRequired }) }); await openTicket(detail.id); setMessage('Параметры обращения сохранены.'); } catch { setMessage(purchaseRequired ? 'Укажите хотя бы один номер заявки ERP.' : 'Укажите дату и время выезда.'); } finally { setBusy(false); } };
  const submitComment = async (event: FormEvent) => { event.preventDefault(); if (!detail || !comment.trim()) return; setBusy(true); setMessage(''); try { await api(`/tickets/${detail.id}/comments`, { body: comment, authorId: '00000000-0000-0000-0000-000000000001' }); setComment(''); await openTicket(detail.id); } catch { setMessage('Не удалось добавить комментарий.'); } finally { setBusy(false); } };
  return <div className="tool-page"><div className="page-heading compact"><div><div className="eyebrow">ДОКУМЕНТ SERVICE DESK</div><h1>Обращения</h1><p>Откройте обращение для просмотра данных, комментариев и параметров выезда.</p></div><span className="tool-badge">{formatCount(tickets.length, 'документ', 'документа', 'документов')}</span></div><div className="tool-layout ticket-document-layout"><form className="panel form-panel" onSubmit={submit}><PanelTitle title="Новое обращение" action="Документ обращения" /><label>Пользователь<select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Выберите пользователя</option>{users.map((user) => <option key={user.id} value={user.id}>{user.display_name}</option>)}</select></label><label>Тип заявки<select value={ticketTypeId} onChange={(event) => { setTicketTypeId(event.target.value); setTicketKindId(""); }}><option value="">Выберите тип заявки</option>{ticketTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Вид заявки<select value={ticketKindId} onChange={(event) => setTicketKindId(event.target.value)}><option value="">Выберите вид заявки</option>{ticketKinds.filter((item) => item.ticket_type_id === ticketTypeId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{equipmentRequired && <label>Оборудование<select value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)} required><option value="">Выберите оборудование</option>{equipment.map((item) => <option key={item.id} value={item.id}>{item.inventory_number} · {item.name} · {item.status}</option>)}</select></label>}<label className="checkbox-line development-toggle"><input type="checkbox" checked={developmentRequired} onChange={(event) => setDevelopmentRequired(event.target.checked)} /> Требуется разработка</label>{developmentRequired && <label>Доска разработки<select value={developmentBoardId} onChange={(event) => setDevelopmentBoardId(event.target.value)} required><option value="">Выберите доску</option>{developmentBoards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</select></label>}<div className="document-user-card"><span className="avatar">{selectedUser?.display_name.split(' ').map((part) => part[0]).join('').slice(0, 2) ?? '—'}</span><div><strong>{selectedUser?.display_name ?? 'Пользователь не выбран'}</strong><small>{selectedUser?.email ?? 'Выберите пользователя — основные данные подставятся автоматически'}</small></div></div><label>Тема обращения<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Кратко опишите обращение" required /></label><label>Описание<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Опишите проблему или запрос" rows={5} /></label><button className="primary-button" disabled={busy || !userId}>{busy ? 'Создаём…' : 'Создать документ'} <span>→</span></button>{message && <div className="inline-error success-message">{message}</div>}</form><section className="panel table-panel ticket-list-panel"><PanelTitle title="Документы обращений" action="Последние 100" /><div className="table-wrap"><table><thead><tr><th>Номер</th><th>Тема обращения</th><th>Пользователь</th><th>Исполнитель</th><th>Статус</th><th>Выезд</th><th>Закупка</th><th>Создан</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id} className="ticket-row" onClick={() => void openTicket(ticket.id)}><td className="ticket-id">SD-{ticket.number}</td><td>{ticket.subject}</td><td>{ticket.requester_name}</td><td>{ticket.assignee_name ?? 'Не назначен'}</td><td><span className="pill progress">{translateTicketStatus(ticket.status)}</span></td><td>{ticket.visit_required ? 'Требуется' : '—'}</td><td>{ticket.purchase_required ? 'Требуется' : '—'}</td><td>{new Date(ticket.created_at).toLocaleString('ru-RU')}</td></tr>)}{tickets.length === 0 && <tr><td colSpan={8}><div className="empty-state small"><span>⊙</span><p>Документов пока нет</p></div></td></tr>}</tbody></table></div></section></div>{detail && <section className="panel ticket-detail-panel"><div className="ticket-detail-header"><div><div className="eyebrow">КАРТОЧКА ОБРАЩЕНИЯ</div><h2>SD-{detail.number} · {detail.subject}</h2><p>{translateTicketStatus(detail.status)} · Исполнитель: {detail.assignee_name ?? 'Не назначен'}</p></div><button className="close-button" onClick={() => setDetail(null)}>×</button></div><div className="ticket-detail-grid"><div className="ticket-facts"><div><small>Пользователь</small><strong>{detail.requester_name}</strong><span>{detail.requester_email}</span></div><div><small>Описание</small><strong>{detail.description || 'Описание не заполнено'}</strong><span>{detail.ticket_type_name ?? 'Тип заявки не указан'} · {detail.ticket_kind_name ?? 'Вид не указан'}</span><span>{detail.equipment_name ? 'Оборудование: ' + detail.equipment_inventory_number + ' · ' + detail.equipment_name : 'Оборудование не выбрано'}</span></div></div><div className="visit-settings"><div className="eyebrow">ПАРАМЕТРЫ ОБРАЩЕНИЯ</div>{(detail.ticket_type_name === 'Запрос на обслуживание' || detail.ticket_kind_name === 'Ремонт') && <label className="checkbox-line repair-toggle"><input type="checkbox" checked={repairRequired} onChange={(event) => setRepairRequired(event.target.checked)} /> Ремонт</label>}<label className="checkbox-line"><input type="checkbox" checked={visitRequired} onChange={(event) => setVisitRequired(event.target.checked)} /> Требуется выезд</label>{visitRequired && <label>Дата и время выезда<input type="datetime-local" value={visitAt} onChange={(event) => setVisitAt(event.target.value)} required /></label>}<label className="checkbox-line purchase-toggle"><input type="checkbox" checked={purchaseRequired} onChange={(event) => setPurchaseRequired(event.target.checked)} /> Требуется закупка</label>{purchaseRequired && <div className="erp-request-list"><label>Номера заявок ERP</label>{erpNumbers.map((value, index) => <div className="erp-request-row" key={index}><span className="erp-request-index">{index + 1}</span><input value={value} maxLength={20} onChange={(event) => setErpNumbers((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="Номер заявки ERP" /></div>)}<button type="button" className="outline-button add-erp-button" onClick={() => setErpNumbers((current) => [...current, ''])}>Добавить номер заявки ERP</button></div>}<button className="primary-button" onClick={() => void saveTicketSettings()} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить параметры'}</button></div></div><div className="ticket-comments"><div className="panel-title"><h3>Комментарии</h3><span>{detail.comments.length} записей</span></div>{detail.comments.length === 0 ? <div className="comment-empty">Комментариев пока нет</div> : detail.comments.map((item) => <div className="comment-item" key={item.id}><div className="comment-meta"><strong>{item.author_name}</strong><span>{new Date(item.created_at).toLocaleString('ru-RU')}</span></div><p>{item.body}</p></div>)}<form className="comment-form" onSubmit={submitComment}><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Напишите комментарий…" rows={3} /><button className="primary-button" disabled={busy || !comment.trim()}>{busy ? 'Добавляем…' : 'Добавить комментарий'}</button></form></div>{message && <div className="inline-error success-message">{message}</div>}</section>}</div>;
}

function LegacyTicketPanel() {
  const [users, setUsers] = useState<TicketUser[]>([]);
  const [tickets, setTickets] = useState<TicketDocument[]>([]);
  const [userId, setUserId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selectedUser = users.find((user) => user.id === userId);
  const load = async () => { const [userResult, ticketResult] = await Promise.all([request<{ users: TicketUser[] }>('/tickets/users'), request<{ tickets: TicketDocument[] }>('/tickets')]); setUsers(userResult.users); setTickets(ticketResult.tickets); if (!userId && userResult.users[0]) setUserId(userResult.users[0].id); };
  useEffect(() => { void load().catch(() => setMessage('Не удалось загрузить данные документа.')); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setMessage(''); try { await api('/tickets', { userId, subject, description }); setSubject(''); setDescription(''); setMessage('Документ обращения создан.'); await load(); } catch { setMessage('Не удалось создать обращение. Проверьте пользователя и тему обращения.'); } finally { setBusy(false); } };
  return <div className="tool-page"><div className="page-heading compact"><div><div className="eyebrow">ДОКУМЕНТ SERVICE DESK</div><h1>Обращения</h1><p>Обращение — это документ обращения. Справочники не заполняются при создании документа.</p></div><span className="tool-badge">{formatCount(tickets.length, 'документ', 'документа', 'документов')}</span></div><div className="tool-layout ticket-document-layout"><form className="panel form-panel" onSubmit={submit}><PanelTitle title="Новое обращение" action="Документ обращения" /><label>Пользователь<select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Выберите пользователя</option>{users.map((user) => <option key={user.id} value={user.id}>{user.display_name}</option>)}</select></label><div className="document-user-card"><span className="avatar">{selectedUser?.display_name.split(' ').map((part) => part[0]).join('').slice(0, 2) ?? '—'}</span><div><strong>{selectedUser?.display_name ?? 'Пользователь не выбран'}</strong><small>{selectedUser?.email ?? 'Выберите пользователя — основные данные подставятся автоматически'}</small></div></div><label>Тема обращения<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Кратко опишите обращение" required /></label><label>Описание<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Опишите проблему или запрос" rows={5} /></label><button className="primary-button" disabled={busy || !userId}>{busy ? 'Создаём…' : 'Создать документ'} <span>→</span></button>{message && <div className="inline-error success-message">{message}</div>}</form><section className="panel table-panel ticket-list-panel"><PanelTitle title="Документы обращений" action="Последние 100" /><div className="table-wrap"><table><thead><tr><th>Номер</th><th>Тема обращения</th><th>Пользователь</th><th>Электронная почта</th><th>Статус</th><th>Создан</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id}><td className="ticket-id">SD-{ticket.number}</td><td>{ticket.subject}</td><td>{ticket.requester_name}</td><td>{ticket.requester_email}</td><td><span className="pill progress">{translateTicketStatus(ticket.status)}</span></td><td>{new Date(ticket.created_at).toLocaleString('ru-RU')}</td></tr>)}{tickets.length === 0 && <tr><td colSpan={6}><div className="empty-state small"><span>⊙</span><p>Документов пока нет</p></div></td></tr>}</tbody></table></div></section></div></div>;
}

function DevelopmentBoardPanel({ onOpenTicket }: { onOpenTicket: (id: string) => void }) {
  const [tickets, setTickets] = useState<TicketDocument[]>([]);
  const [boards, setBoards] = useState<DevelopmentBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void request<DevelopmentBoard[]>('/tickets/development-boards')
      .then((result) => {
        setBoards(result);
        if (result[0]) setSelectedBoardId((current) => current || result[0].id);
      })
      .catch(() => setMessage('Не удалось загрузить доски разработки.'));
  }, []);

  useEffect(() => {
    if (!selectedBoardId) {
      setTickets([]);
      return;
    }
    setBusy(true);
    void request<{ tickets: TicketDocument[] }>(`/tickets/development?boardId=${encodeURIComponent(selectedBoardId)}`)
      .then((result) => setTickets(result.tickets))
      .catch(() => setMessage('Не удалось загрузить обращения доски.'))
      .finally(() => setBusy(false));
  }, [selectedBoardId]);

  const columns = [{ status: 'new', label: 'Новые' }, { status: 'in_progress', label: 'В работе' }, { status: 'waiting', label: 'Ожидают' }, { status: 'resolved', label: 'Готово' }];
  const selectedBoard = boards.find((board) => board.id === selectedBoardId);

  return <div className="tool-page development-page"><div className="page-heading compact"><div><div className="eyebrow">УПРАВЛЕНИЕ ОБРАЩЕНИЯМИ</div><h1>Доска разработки</h1><p>Показываются только обращения с флагом «Требуется разработка».</p></div><label className="board-selector">Доска<select value={selectedBoardId} onChange={(event) => setSelectedBoardId(event.target.value)} disabled={!boards.length}><option value="">Выберите доску</option>{boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</select><small>{selectedBoard?.status ?? 'Нет активных досок'}</small></label></div>{message && <div className="inline-error">{message}</div>}{busy ? <div className="panel empty-state"><span>◌</span><p>Загрузка обращений…</p></div> : <div className="development-board">{columns.map((column) => <section className="panel development-column" key={column.status}><div className="panel-title"><h2>{column.label}</h2><span>{tickets.filter((ticket) => ticket.status === column.status).length}</span></div>{tickets.filter((ticket) => ticket.status === column.status).map((ticket) => <button className="development-card" key={ticket.id} onClick={() => onOpenTicket(ticket.id)}><strong>SD-{ticket.number}</strong><span>{ticket.subject}</span><small>{ticket.requester_name} · {ticket.assignee_name ?? 'Без исполнителя'}</small></button>)}{tickets.filter((ticket) => ticket.status === column.status).length === 0 && <div className="empty-state small"><span>—</span><p>Нет обращений</p></div>}</section>)}</div>}</div>;
}
function AdminPanel() {
  const [tables, setTables] = useState<AdminTable[]>([]);
  const [selected, setSelected] = useState('tickets');
  const [data, setData] = useState<AdminData | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [lookups, setLookups] = useState<Record<string, AdminLookup[]>>({});
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adminError, setAdminError] = useState('');

  const loadTables = async () => {
    const result = await request<{ tables: AdminTable[] }>('/admin/tables');
    const orderedTables = [...result.tables].sort((left, right) => left.block.localeCompare(right.block, 'ru') || left.label.localeCompare(right.label, 'ru'));
    setTables(orderedTables);
    if (!result.tables.some((table) => table.name === selected) && result.tables[0]) setSelected(result.tables[0].name);
  };
  const loadRows = async (table: string) => {
    setBusy(true); setAdminError('');
    try {
      const result = await request<AdminData>(`/admin/tables/${table}/rows?limit=100`);
      const references = result.columns.filter((column) => column.reference).map((column) => column.reference!).filter((reference, index, all) => all.findIndex((item) => item.table === reference.table && item.label === reference.label) === index);
      const lookupEntries = await Promise.all(references.map(async (reference) => { const lookupData = await request<AdminData>(`/admin/tables/${reference.table}/rows?limit=500`); return [`${reference.table}:${reference.label}`, lookupData.rows.map((row) => ({ value: String(row.id), label: String(row[reference.label] ?? row.id) }))] as const; }));
      setLookups(Object.fromEntries(lookupEntries));
      setData(result);
    } catch { setAdminError('Не удалось загрузить таблицу.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void loadTables().catch(() => setAdminError('Нет доступа к административным таблицам.')); }, []);
  useEffect(() => { if (selected) void loadRows(selected); }, [selected]);

  const isAutoColumn = (column: AdminColumn) => column.generated || column.name === 'id' || column.name === 'code';
  const initialValue = (column: AdminColumn) => column.dataType === 'boolean' ? (column.name === 'is_active' || column.defaultValue?.includes('true') ? 'true' : 'false') : '';
  const formValue = (column: AdminColumn, value: unknown) => column.dataType === 'boolean' ? (value === null || value === undefined ? '' : String(Boolean(value))) : formatCell(value);
  const openNew = () => { setIsNew(true); setEditing({}); setFormValues(Object.fromEntries((data?.columns ?? []).filter((column) => !isAutoColumn(column)).map((column) => [column.name, initialValue(column)]))); };
  const openEdit = (row: Record<string, unknown>) => { setIsNew(false); setEditing(row); setFormValues(Object.fromEntries((data?.columns ?? []).filter((column) => !isAutoColumn(column)).map((column) => [column.name, formValue(column, row[column.name])]))); };
  const closeEditor = () => { setEditing(null); setFormValues({}); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!data) return; setBusy(true); setAdminError('');
    const values = Object.fromEntries(data.columns.filter((column) => !isAutoColumn(column) && (isNew || !data.primaryKey.includes(column.name))).map((column) => [column.name, parseAdminValue(formValues[column.name] ?? '', column.dataType)]));
    try {
      if (isNew) await request(`/admin/tables/${selected}/rows`, { method: 'POST', body: JSON.stringify(values) });
      else {
        const key = Object.fromEntries(data.primaryKey.map((column) => [column, editing?.[column]]));
        await request(`/admin/tables/${selected}/rows`, { method: 'PATCH', body: JSON.stringify({ key, values }) });
      }
      closeEditor(); await loadRows(selected); await loadTables();
    } catch { setAdminError('Не удалось сохранить запись. Проверьте обязательные поля и формат JSON.'); }
    finally { setBusy(false); }
  };

  return <div className="tool-page admin-page"><div className="page-heading compact"><div><div className="eyebrow">НОРМАТИВНО-СПРАВОЧНАЯ ИНФОРМАЦИЯ</div><h1>НСИ</h1><p>Справочники и настройки Service Desk. Раздел доступен только администратору.</p></div><span className="tool-badge">{formatCount(tables.length, 'справочник', 'справочника', 'справочников')}</span></div><div className="admin-layout"><aside className="panel table-list"><div className="panel-title"><h2>Справочники</h2><span>{tables.length} доступно</span></div><div className="table-search">⌕ <span>Выберите справочник</span></div>{tables.map((table, index) => <div className="admin-table-group" key={table.name}>{(index === 0 || tables[index - 1].block !== table.block) && <div className="admin-block-title">{table.block}</div>}<button className={selected === table.name ? 'table-nav active' : 'table-nav'} onClick={() => { closeEditor(); setSelected(table.name); }}><span>{table.label}</span><b>{table.rowCount}</b></button></div>)}</aside><section className="panel admin-editor"><div className="admin-editor-head"><div><div className="eyebrow">СПРАВОЧНИК НСИ</div><h2>{data?.name === selected ? tables.find((table) => table.name === selected)?.label : 'Загрузка…'}</h2><p>{data?.columns.length ?? 0} полей · {data?.rows.length ?? 0} записей загружено</p></div><button className="primary-button compact-button" onClick={openNew}>＋ Добавить запись</button></div>{adminError && <div className="inline-error">{adminError}</div>}{busy && !data ? <div className="empty-state"><span>◌</span><p>Загрузка справочника…</p></div> : <div className="table-wrap admin-table-wrap"><table><thead><tr>{data?.columns.map((column) => <th key={column.name}>{column.label}<small>{translateDataType(column.dataType)}</small></th>)}<th>Действия</th></tr></thead><tbody>{data?.rows.map((row, index) => { const displayRow = data.displayRows?.[index] ?? row; return <tr key={index}>{data.columns.map((column) => <td key={column.name} title={formatCell(displayRow[column.name])}>{formatCell(displayRow[column.name])}</td>)}<td><button className="row-edit" onClick={() => openEdit(row)}>Изменить</button></td></tr>; })}{data?.rows.length === 0 && <tr><td colSpan={(data?.columns.length ?? 0) + 1}><div className="empty-state small"><span>⊙</span><p>Записей пока нет</p></div></td></tr>}</tbody></table></div>}{editing && <div className="editor-drawer"><div className="drawer-head"><div><span className="eyebrow">{isNew ? 'НОВАЯ ЗАПИСЬ' : 'РЕДАКТИРОВАНИЕ'}</span><h3>{isNew ? 'Добавить значение' : 'Изменить значение'}</h3></div><button className="close-button" onClick={closeEditor}>×</button></div><form onSubmit={submit}><div className="drawer-fields">{data?.columns.filter((column) => !isAutoColumn(column) && (isNew || !data.primaryKey.includes(column.name))).map((column) => <label key={column.name}>{column.label}{column.reference ? <select value={formValues[column.name] ?? ''} onChange={(event) => setFormValues((current) => ({ ...current, [column.name]: event.target.value }))}><option value="">{column.nullable ? 'Не обязательно' : 'Выберите значение'}</option>{(lookups[`${column.reference.table}:${column.reference.label}`] ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : column.dataType === 'boolean' ? <input type="checkbox" checked={formValues[column.name] === 'true'} onChange={(event) => setFormValues((current) => ({ ...current, [column.name]: String(event.target.checked) }))} /> : <input value={formValues[column.name] ?? ''} placeholder={column.nullable ? 'Не обязательно' : 'Обязательное поле'} onChange={(event) => setFormValues((current) => ({ ...current, [column.name]: event.target.value }))} />}</label>)}</div><div className="drawer-actions"><button type="button" className="outline-button" onClick={closeEditor}>Отмена</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div></form></div>}</section></div></div>;
}

const translateDataType = (dataType: string) => ({
  uuid: 'UUID', text: 'Текст', boolean: 'Да/нет', integer: 'Целое число', bigint: 'Целое число', numeric: 'Число', jsonb: 'Структурированные данные', inet: 'IP-адрес', 'timestamp with time zone': 'Дата и время',
}[dataType] ?? 'Значение');

const parseAdminValue = (value: string, dataType: string): unknown => {
  if (value === '') return null;
  if (dataType === 'boolean') return value === 'true' || value === '1';
  if (['integer', 'bigint', 'numeric', 'double precision', 'real'].includes(dataType)) return Number(value);
  if (dataType === 'jsonb' || dataType === 'json') { try { return JSON.parse(value); } catch { return value; } }
  return value;
};

function AccessPanel({ onSubmit, result, loading }: { onSubmit: (form: HTMLFormElement) => void; result: AccessResult | null; loading: boolean }) {
  return <div className="tool-page"><div className="page-heading compact"><div><div className="eyebrow">POLICY DECISION POINT</div><h1>Проверка доступа</h1><p>Проверьте итоговое решение RBAC и области видимости для конкретной заявки.</p></div><span className="tool-badge">deny by default</span></div><div className="tool-layout"><form className="panel form-panel" onSubmit={(event) => { event.preventDefault(); onSubmit(event.currentTarget); }}><PanelTitle title="Параметры проверки" action="POST /access/check" /><label>Пользователь<input name="userId" defaultValue="u-1" /></label><label>Роль<select name="role" defaultValue="initiator"><option value="initiator">Инициатор</option><option value="dispatcher">Диспетчер</option><option value="admin">Администратор</option></select></label><label>Право доступа<select name="permission" defaultValue="ticket.read"><option>ticket.read</option><option>ticket.update</option><option>ticket.comment</option><option>ticket.assign</option><option>ticket.close</option></select></label><label>Создатель заявки<input name="createdBy" defaultValue="u-1" /></label><button className="primary-button" disabled={loading}>{loading ? 'Проверяем…' : 'Проверить доступ'} <span>→</span></button></form><ResultCard title="Решение политики" result={result ? (result.allowed ? { state: 'allow', title: 'Доступ разрешен', detail: 'Пользователь соответствует роли и отношению к заявке.', meta: translateReason(result.reason) } : { state: 'deny', title: 'Доступ запрещен', detail: 'Запрос не прошел проверку области видимости или права доступа.', meta: translateReason(result.reason) }) : null} empty="Заполните параметры и запустите проверку" /></div></div>;
}

function RoutingPanel({ onSubmit, result, loading }: { onSubmit: (form: HTMLFormElement) => void; result: RoutingResult | null; loading: boolean }) {
  return <div className="tool-page"><div className="page-heading compact"><div><div className="eyebrow">ROUTING ENGINE</div><h1>Симулятор маршрута</h1><p>Посмотрите, какая группа, SLA и исполнитель будут выбраны для обращения.</p></div><span className="tool-badge blue">config-driven</span></div><div className="tool-layout"><form className="panel form-panel" onSubmit={(event) => { event.preventDefault(); onSubmit(event.currentTarget); }}><PanelTitle title="Снимок заявки" action="POST /routing/simulate" /><label>Тип заявки<select name="typeId" defaultValue="incident"><option value="incident">Инцидент</option><option value="request">Запрос на обслуживание</option><option value="change">Изменение</option></select></label><label>Тема обращения<input name="subject" defaultValue="Недоступен VPN после обновления" /></label><div className="rule-preview"><span className="rule-dot" /><div><strong>rule-network</strong><small>Компетенция: network · Минимальная загрузка</small></div><span className="rule-priority">P100</span></div><button className="primary-button" disabled={loading}>{loading ? 'Рассчитываем…' : 'Симулировать маршрут'} <span>↗</span></button></form><RoutingResultCard result={result} /></div></div>;
}

function ResultCard({ title, result, empty }: { title: string; result: { state: 'allow' | 'deny'; title: string; detail: string; meta: string } | null; empty: string }) { return <section className="panel result-panel"><PanelTitle title={title} action="Результат" />{result ? <div className={`decision ${result.state}`}><div className="decision-mark">{result.state === 'allow' ? '✓' : '×'}</div><div><h3>{result.title}</h3><p>{result.detail}</p><span>Причина: <b>{result.meta}</b></span></div></div> : <div className="empty-state"><span>◌</span><p>{empty}</p></div>}</section>; }
function RoutingResultCard({ result }: { result: RoutingResult | null }) { return <section className="panel result-panel"><PanelTitle title="Результат маршрутизации" action="Решение" />{result ? <div className="routing-result"><div className="route-hero"><span className="route-check">✓</span><div><span>Маршрут определен</span><strong>{translateGroup(result.supportGroupId)}</strong></div></div><div className="result-grid"><div><small>Исполнитель</small><strong>{translateAssignee(result.assigneeId)}</strong></div><div><small>SLA</small><strong>{translateSla(result.slaPolicyId)}</strong></div><div><small>Приоритет</small><strong>{result.priority ? `P${result.priority} · ${result.priority === 1 ? 'Критический' : 'Обычный'}` : 'Не задан'}</strong></div><div><small>Правило</small><strong>{result.matchedRuleIds[0] ? `Правило ${result.matchedRuleIds[0].replace('rule-', '')}` : 'Резервное правило'}</strong></div></div><div className="reason-list">{result.reasons.map((reason) => <span key={reason}>✓ {translateReason(reason)}</span>)}</div></div> : <div className="empty-state"><span>↗</span><p>Здесь появится выбранная группа и исполнитель</p></div>}</section>; }

export default App;
