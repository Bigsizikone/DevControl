import { useEffect, useState, type FormEvent } from 'react';
import App from './App';
import { Icon } from './ui-icon';
export type SessionUser = { id: string; name: string; login: string; role: string };
export let currentUser: SessionUser = { id: '', name: '', login: '', role: '' };
export const apiUrl = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
export async function sessionRequest(path: string, body?: unknown) {
  const response = await fetch(apiUrl(path), { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Не удалось выполнить запрос');
  return data;
}

export function SessionApp() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  async function refresh() {
    currentUser = await sessionRequest('/auth/me');
    setUser(currentUser);
  }
  useEffect(() => {
    void refresh().catch(() => undefined).finally(() => setReady(true));
    const expired = () => { setUser(null); setNotice('Сессия завершена. Войдите снова.'); };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  async function logout() {
    await sessionRequest('/auth/logout', {});
    currentUser = { id: '', name: '', login: '', role: '' };
    setUser(null); setNotice('Вы вышли из рабочего пространства.');
  }
  if (!ready) return <div className="auth-page auth-loading" role="status">Подключение к Service Desk…</div>;
  return user ? <App user={user} onLogout={logout} /> : <Login onLogin={refresh} notice={notice} />;
}

function Login({ onLogin, notice }: { onLogin: () => Promise<void>; notice: string }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try { await sessionRequest('/auth/login', { login: data.get('login'), password: data.get('password') }); await onLogin(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Нет соединения с сервером'); }
    finally { setBusy(false); }
  }
  return <div className="auth-page">
    <header className="auth-header"><a className="auth-brand" href={import.meta.env.BASE_URL}><Icon name="layers" /><span>Service Desk</span></a><span>DevControl</span></header>
    <main className="auth-main"><div className="auth-heading"><h1>Всё под контролем.</h1><p>Войдите в рабочее пространство Service Desk</p></div>
      <form className="auth-card" onSubmit={submit} aria-label="Вход в Service Desk">
        <div className="auth-lock"><Icon name="lock" /></div><h2>Добро пожаловать</h2><p>Используйте учётную запись вашей организации</p>
        {notice && !error && <div className="auth-notice" role="status">{notice}</div>}
        <label htmlFor="login">Логин</label><div className="auth-input"><Icon name="user" /><input id="login" name="login" placeholder="Введите логин" autoComplete="username" required maxLength={200} autoCapitalize="none" spellCheck={false} /></div>
        <label htmlFor="password">Пароль</label><div className="auth-input"><Icon name="lock" /><input id="password" name="password" type={visible ? 'text' : 'password'} placeholder="Введите пароль" autoComplete="current-password" required maxLength={256} /><button type="button" aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={visible} onClick={() => setVisible(!visible)}><Icon name={visible ? 'eyeoff' : 'eye'} /></button></div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? 'Выполняется вход…' : 'Войти в Service Desk'}<Icon name="arrow" /></button>
      </form><p className="auth-helper">Доступ предоставляется администратором системы</p>
    </main><footer className="auth-footer"><span>Service Desk</span><span>DevControl © {new Date().getFullYear()}</span></footer>
  </div>;
}
