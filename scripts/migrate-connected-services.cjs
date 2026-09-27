// Run with the old SD application stopped and a verified database/files backup.
// Existing target databases are never overwritten. Retrying skips completed imports.
const { Client } = require('pg');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { SERVICE_DEFINITIONS, serviceIds } = require('../dist/plugins/contracts');
const { REFERENCE_COLUMNS } = require('../dist/plugins/references');
const root = join(__dirname, '..');
const identifier = s => { if (!/^[a-z_]+$/.test(s)) throw new Error('Unsafe identifier'); return `"${s}"`; };
async function fingerprint(source, id) {
  const hash = createHash('sha256');
  for (const table of SERVICE_DEFINITIONS[id].tables) {
    const publicName = `public.${table}`, retiredName = `retired_services.${table}`;
    const names = (await source.query('SELECT to_regclass($1) AS live,to_regclass($2) AS retired',[publicName,retiredName])).rows[0];
    const qualified = names.live ? `public.${identifier(table)}` : names.retired ? `retired_services.${identifier(table)}` : null;
    if (qualified) hash.update(table + (await source.query(`SELECT md5(coalesce(string_agg(md5(t::text),'' ORDER BY id),'')) AS hash FROM ${qualified} t`)).rows[0].hash);
  }
  return hash.digest('hex');
}
async function copyTable(source, target, table, fields, where = '') {
  const sourceTable = (await source.query('SELECT to_regclass($1) AS name', [`public.${table}`])).rows[0].name ? `public.${identifier(table)}` : `retired_services.${identifier(table)}`;
  if (!(await source.query('SELECT to_regclass($1) AS name', [sourceTable])).rows[0].name) return 0;
  const columns = (await target.query("SELECT column_name,data_type,is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.filter(c => !fields || fields.includes(c.column_name));
  const names = columns.map(c => identifier(c.column_name)).join(',');
  const rows = (await source.query(`SELECT ${names} FROM ${sourceTable} ${where}`)).rows;
  if ((await target.query(`SELECT 1 FROM ${identifier(table)} LIMIT 1`)).rows.length) throw new Error(`Target ${table} is not empty; refusing to overwrite data`);
  for (const row of rows) await target.query(`INSERT INTO ${identifier(table)} (${names}) OVERRIDING SYSTEM VALUE VALUES (${columns.map((_,i)=>`$${i+1}`).join(',')})`, columns.map(c => ['json','jsonb'].includes(c.data_type) && row[c.column_name] !== null ? JSON.stringify(row[c.column_name]) : row[c.column_name]));
  for (const col of columns.filter(c=>c.is_identity === 'YES')) await target.query(`SELECT setval(pg_get_serial_sequence($1,$2),coalesce(max(${identifier(col.column_name)}),1),count(*)>0) FROM ${identifier(table)}`, [table,col.column_name]);
  const count = Number((await target.query(`SELECT count(*) FROM ${identifier(table)}`)).rows[0].count);
  if (count !== rows.length) throw new Error(`Count mismatch: ${table}`);
  return count;
}
(async () => {
  if (!process.argv.includes('--maintenance')) throw new Error('Stop all source writers and pass --maintenance after taking a backup');
  const source = new Client({ connectionString: process.env.DATABASE_URL });
  await source.connect();
  try {
    await source.query("SELECT pg_advisory_lock(hashtext('sd-connected-services-migration'))");
    await source.query(await readFile(join(root,'database/migrations/018_connected_services.sql'),'utf8'));
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const id of serviceIds) {
      const url = process.env[`${id.toUpperCase()}_DATABASE_URL`];
      if (!url || url === process.env.DATABASE_URL) throw new Error(`A separate ${id} database is required`);
      const target = new Client({ connectionString: url }); await target.connect();
      try {
        await target.query('BEGIN');
        await target.query(await readFile(join(root,'database/services/references.sql'),'utf8'));
        await target.query(await readFile(join(root,`database/services/${id}.sql`),'utf8'));
        const sourceFingerprint = await fingerprint(source,id);
        const marker = await target.query('SELECT service,source_fingerprint FROM service_migrations');
        if (marker.rows.some(row=>row.service !== id)) throw new Error('Target belongs to another service');
        if (marker.rows.length) {
          if (marker.rows[0].source_fingerprint !== sourceFingerprint) throw new Error(`${id}: source changed since import; reconcile changes before retrying`);
          console.log(`${id}: already imported, preserved`); await target.query('ROLLBACK'); continue;
        }
        for (const [table,fields] of Object.entries(REFERENCE_COLUMNS)) await copyTable(source,target,table,fields);
        for (const table of SERVICE_DEFINITIONS[id].tables) console.log(`${id}/${table}: ${await copyTable(source,target,table)} rows`);
        if (id === 'equipment') {
          // Existing devices in repair must appear in the new repair journal as well.
          await target.query(`INSERT INTO equipment_repairs(equipment_id,title,description,created_by,created_at)
            SELECT e.id,'Ремонт: ' || e.name,coalesce(e.comment,'Перенесено из реестра оборудования'),
              (SELECT id FROM users ORDER BY (id='00000000-0000-0000-0000-000000000001') DESC,created_at LIMIT 1),e.updated_at
            FROM equipment_items e WHERE e.status='repair'
              AND NOT EXISTS(SELECT 1 FROM equipment_repairs r WHERE r.equipment_id=e.id AND r.status IN ('new','in_progress'))`);
        }
        const auditFilter = id === 'security' ? "WHERE resource_type='security_record'" : id === 'surveillance' ? "WHERE resource_type LIKE 'camera_%'" : "WHERE resource_type IN ('equipment','equipment_item','equipment_movement','inventory_receipt','equipment_repairs')";
        await copyTable(source,target,'audit_log',null,auditFilter);
        await target.query('INSERT INTO service_migrations(service,source_fingerprint) VALUES($1,$2)',[id,sourceFingerprint]);
        await target.query('COMMIT');
      } catch(e) { await target.query('ROLLBACK'); throw e; } finally { await target.end(); }
    }
    await source.query('COMMIT');
    // Retire old ownership only after all three imports succeed. Keep a rollback copy.
    await source.query('BEGIN');
    await source.query('CREATE SCHEMA IF NOT EXISTS retired_services');
    for (const id of serviceIds) for (const table of SERVICE_DEFINITIONS[id].tables) {
      if ((await source.query('SELECT to_regclass($1) AS name',[`public.${table}`])).rows[0].name) await source.query(`ALTER TABLE public.${identifier(table)} SET SCHEMA retired_services`);
    }
    // Archived rows must not constrain live SD users, organizations or tickets.
    const foreignKeys=await source.query(`SELECT t.relname AS table_name,c.conname FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      JOIN pg_class referenced ON referenced.oid=c.confrelid JOIN pg_namespace rn ON rn.oid=referenced.relnamespace
      WHERE c.contype='f' AND n.nspname='retired_services' AND rn.nspname='public'`);
    for (const row of foreignKeys.rows) await source.query(`ALTER TABLE retired_services.${identifier(row.table_name)} DROP CONSTRAINT ${identifier(row.conname)}`);
    await source.query('COMMIT');
    console.log('Import complete. Services remain disabled until enabled in SD settings.');
  } catch(e) { await source.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { await source.end(); }
})().catch(e=>{ console.error(e.message); process.exitCode=1; });
