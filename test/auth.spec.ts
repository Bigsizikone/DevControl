import { hashPassword, verifyPassword, installAuthentication } from '../src/http/auth';

test('password hashes use independent salts and reject wrong passwords', async () => {
  const a = await hashPassword('correct long password');
  const b = await hashPassword('correct long password');
  expect(a).not.toBe(b);
  expect(await verifyPassword('correct long password', a)).toBe(true);
  expect(await verifyPassword('wrong', a)).toBe(false);
  expect(await verifyPassword('wrong', 'broken')).toBe(false);
});

test('forged role headers cannot bypass session authentication; cross-origin writes fail', async () => {
  let middleware: any;
  const database = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  await installAuthentication({ use: (value: any) => { middleware = value; } }, database as any);
  const response = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  const req = { method: 'GET', path: '/admin/tables', headers: { 'x-role': 'admin', 'x-user-id': 'forged' } };
  await middleware(req, response, next);
  expect(response.status).toHaveBeenCalledWith(401);
  expect(req.headers).toEqual({});
  expect(next).not.toHaveBeenCalled();
  await middleware({ method: 'GET', path: '/assets/equipment', headers: {} }, response, next);
  expect(response.status).toHaveBeenLastCalledWith(401);
  expect(next).not.toHaveBeenCalled();
  await middleware({ method: 'POST', path: '/auth/login', headers: { origin: 'https://attacker.example' } }, response, next);
  expect(response.status).toHaveBeenCalledWith(403);
});

test('authenticated asset API receives the database role while static bundles remain public', async () => {
  let middleware: any;
  const database = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'trusted-id', role: 'admin', name: 'Admin', login: 'admin' }] }) };
  await installAuthentication({ use: (value: any) => { middleware = value; } }, database as any);
  const response = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  const req = { method: 'GET', path: '/assets/api-description', headers: { cookie: `sd_session=${'a'.repeat(64)}`, 'x-role': 'forged', 'x-user-id': 'forged' } };
  await middleware(req, response, next);
  expect(next).toHaveBeenCalledTimes(1);
  expect(req.headers['x-role']).toBe('admin');
  expect(req.headers['x-user-id']).toBe('trusted-id');
  await middleware({ method: 'GET', path: '/assets/index-Ab123.js', headers: {} }, response, next);
  expect(next).toHaveBeenCalledTimes(2);
});
