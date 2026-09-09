import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { DatabaseService } from '../infrastructure/database.service';

const scrypt = promisify(scryptCallback);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const key = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(hash, 'hex'));
}

export async function installAuthentication(server: any, database: DatabaseService) {
  await database.query(`CREATE TABLE IF NOT EXISTS auth_credentials (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    login text UNIQUE NOT NULL, password_hash text NOT NULL
  ); CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
  ); CREATE TABLE IF NOT EXISTS auth_attempts (
    key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
  )`);
  const secure = process.env.NODE_ENV === 'production';
  const cookiePath = process.env.APP_BASE_PATH || '/';
  const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:3000';
  const cookie = (token: string, age: number) => `sd_session=${token}; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));

  server.use(async (req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    delete req.headers['x-role'];
    delete req.headers['x-user-id'];
    const path = req.path;
    // /assets is also a business API prefix: only Vite's static file names are public.
    const staticAsset = /^\/assets\/[a-zA-Z0-9_-]+\.(?:js|css|woff2?)$/.test(path);
    if (['GET', 'HEAD'].includes(req.method) && (path === '/' || path === '/index.html' || staticAsset || path === '/favicon.svg' || path === '/health/live')) return next();
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin) {
      return res.status(403).json({ message: 'Недопустимый источник запроса' });
    }
    try {
      const token = String(req.headers.cookie || '').split(';').map((part: string) => part.trim()).find((part: string) => part.startsWith('sd_session='))?.slice(11) || '';
      if (path === '/auth/login' && req.method === 'POST') {
        const login = typeof req.body?.login === 'string' ? req.body.login.trim().toLowerCase() : '';
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        if (!login || login.length > 200 || !password || password.length > 256) return res.status(400).json({ message: 'Введите логин и пароль' });
        await database.query('DELETE FROM auth_attempts WHERE expires_at < now(); DELETE FROM auth_sessions WHERE expires_at < now()');
        // ponytail: database counters suit this single service; use a shared edge limiter if scaled out.
        for (const key of [`login:${login}`, `ip:${req.ip}`]) {
          const attempt = await database.query(`INSERT INTO auth_attempts (key,count,expires_at) VALUES ($1,1,now()+interval '15 minutes')
            ON CONFLICT (key) DO UPDATE SET count=auth_attempts.count+1 RETURNING count`, [digest(key)]);
          if (attempt.rows[0].count > (key.startsWith('ip:') ? 60 : 10)) return res.status(429).json({ message: 'Слишком много попыток. Повторите через 15 минут.' });
        }
        const result = await database.query(`SELECT c.*, u.is_active FROM auth_credentials c JOIN users u ON u.id=c.user_id WHERE c.login=$1`, [login]);
        const account = result.rows[0];
        const valid = await verifyPassword(password, account?.password_hash || dummyHash);
        if (!valid || !account?.is_active) return res.status(401).json({ message: 'Неверный логин или пароль' });
        await database.query('DELETE FROM auth_attempts WHERE key=$1', [digest(`login:${login}`)]);
        const session = randomBytes(32).toString('hex');
        if (token) await database.query('DELETE FROM auth_sessions WHERE token_hash=$1', [digest(token)]);
        await database.query("INSERT INTO auth_sessions VALUES ($1,$2,now()+interval '8 hours')", [digest(session), account.user_id]);
        res.setHeader('Set-Cookie', cookie(session, 28800));
        return res.json({ ok: true });
      }
      const session = token && /^[a-f0-9]{64}$/.test(token) ? await database.query(`SELECT u.id, u.display_name AS name, c.login,
        COALESCE((SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.is_active ORDER BY (r.code='admin') DESC, r.code LIMIT 1),'initiator') AS role
        FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN auth_credentials c ON c.user_id=u.id
        WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active`, [digest(token)]) : null;
      const user = session?.rows[0];
      if (!user) return res.status(401).json({ message: 'Войдите в Service Desk' });
      req.headers['x-role'] = user.role;
      req.headers['x-user-id'] = user.id;
      if (path === '/auth/me' && req.method === 'GET') return res.json(user);
      if (path === '/auth/logout' && req.method === 'POST') {
        await database.query('DELETE FROM auth_sessions WHERE token_hash=$1', [digest(token)]);
        res.setHeader('Set-Cookie', cookie('', 0));
        return res.json({ ok: true });
      }
      if (path === '/auth/password' && req.method === 'POST') {
        const { currentPassword, newPassword } = req.body || {};
        if (typeof currentPassword !== 'string' || currentPassword.length > 256 || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 256) return res.status(400).json({ message: 'Новый пароль должен содержать от 12 до 256 символов' });
        const account = await database.query('SELECT password_hash FROM auth_credentials WHERE user_id=$1', [user.id]);
        if (!await verifyPassword(currentPassword, account.rows[0].password_hash)) return res.status(400).json({ message: 'Текущий пароль неверен' });
        await database.query('UPDATE auth_credentials SET password_hash=$1 WHERE user_id=$2', [await hashPassword(newPassword), user.id]);
        await database.query('DELETE FROM auth_sessions WHERE user_id=$1', [user.id]);
        res.setHeader('Set-Cookie', cookie('', 0));
        return res.json({ ok: true });
      }
      next();
    } catch {
      res.status(503).json({ message: 'Сервис временно недоступен. Повторите попытку.' });
    }
  });
}
