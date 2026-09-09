// Provision an administrator without storing a plaintext password in source or the database.
const { Client } = require('pg');
const { hashPassword } = require('../dist/http/auth');
(async () => {
  const { DATABASE_URL, ADMIN_PASSWORD, ADMIN_LOGIN = 'admin', ADMIN_NAME = 'Администратор' } = process.env;
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16) throw new Error('Set ADMIN_PASSWORD to at least 16 characters');
  if (!/^[a-z0-9._-]{3,100}$/.test(ADMIN_LOGIN)) throw new Error('Invalid ADMIN_LOGIN');
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT user_id FROM auth_credentials WHERE login=$1', [ADMIN_LOGIN]);
    if (existing.rowCount) throw new Error('Account already exists; use password change, do not overwrite it');
    const user = await client.query('INSERT INTO users (email,display_name) VALUES ($1,$2) RETURNING id', [`${ADMIN_LOGIN}@devcontrol.tech`, ADMIN_NAME]);
    await client.query("INSERT INTO roles (code,name,is_system) VALUES ('admin','Администратор',true) ON CONFLICT (code) DO NOTHING");
    await client.query("INSERT INTO user_roles (user_id,role_id) SELECT $1,id FROM roles WHERE code='admin'", [user.rows[0].id]);
    await client.query('INSERT INTO auth_credentials VALUES ($1,$2,$3)', [user.rows[0].id, ADMIN_LOGIN, await hashPassword(ADMIN_PASSWORD)]);
    await client.query('COMMIT');
    console.log('Administrator created:', ADMIN_LOGIN);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
