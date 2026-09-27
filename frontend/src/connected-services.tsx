import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from './session';
import './connected-services.css';
export type ConnectedService = { code: 'equipment' | 'surveillance' | 'security'; name: string; enabled: boolean; revision: number; configured: boolean };
export async function serviceRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
  if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : `Не удалось выполнить запрос (${response.status})`);
  return data as T;
}
export function useConnectedServices() {
  const [services, setServices] = useState<ConnectedService[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try { const result = await serviceRequest<{ services: ConnectedService[] }>('/modules'); setServices(result.services); setError(''); setLoaded(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить блоки'); throw e; }
  }, []);
  useEffect(() => {
    const load = () => { void refresh().catch(() => {}); };
    load(); const timer = window.setInterval(load, 15000); window.addEventListener('focus', load);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', load); };
  }, [refresh]);
  return { services, refresh, error, loaded };
}
const descriptions = {
  equipment: 'Учёт оборудования, поступления, складские остатки, движения и ремонты.',
  surveillance: 'График операторов, нарушения с вложениями и тикеты по камерам.',
  security: 'Инциденты, доступы, уязвимости, риски и документы информационной безопасности.',
};
export function ConnectedServicesPanel({ services, refresh, error, loaded }: ReturnType<typeof useConnectedServices>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  async function toggle(service: ConnectedService) {
    setBusy(service.code); setMessage('');
    try {
      await serviceRequest(`/modules/${service.code}`, { method: 'PATCH', body: JSON.stringify({ enabled: !service.enabled, revision: service.revision }) });
      await refresh();
      setMessage(`«${service.name}» ${service.enabled ? 'отключён. Данные сохранены.' : 'включён.'}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Не удалось изменить настройку'); await refresh().catch(() => {}); }
    finally { setBusy(null); }
  }
  return <div className="tool-page connected-services"><div className="page-heading"><div><div className="eyebrow">НАСТРОЙКИ SERVICE DESK</div><h1>Подключаемые блоки</h1><p>Выберите сервисы, доступные вашей команде.</p></div></div>
    <section className="panel core-service"><div><span className="eyebrow">ОСНОВА СЕРВИСА</span><h2>Service Desk и доска разработки</h2><p>Обращения, пользователи, права, маршрутизация и разработка.</p></div><span className="pill progress">Всегда включены</span></section>
    {(error || message) && <div className="inline-error" role="status">{message || error}</div>}
    {!loaded && !error && <p role="status">Загрузка настроек…</p>}
    <div className="connected-grid">{services.map((service, index) => <section className="panel connected-card" key={service.code} data-enabled={service.enabled}><div className="connected-card-top"><span className="eyebrow">0{index + 1} / СЕРВИС</span><span className={`pill ${service.enabled ? 'progress' : ''}`}>{service.enabled ? 'Включён' : 'Отключён'}</span></div><h2>{service.name}</h2><p>{descriptions[service.code]}</p><div className="connected-card-footer"><small>{service.configured ? 'При отключении данные сохраняются' : 'Сервис ещё не настроен на сервере'}</small><button type="button" className="service-switch" role="switch" aria-checked={service.enabled} aria-label={service.name} disabled={!!busy || (!service.enabled && !service.configured)} onClick={() => void toggle(service)}><span />{busy === service.code ? 'Сохранение…' : service.enabled ? 'Выключить' : 'Включить'}</button></div></section>)}</div>
    <p className="connected-note">Настройка действует для всех пользователей. Доступ внутри подключённого сервиса определяется ролью сотрудника.</p>
  </div>;
}
