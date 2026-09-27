// Integration test against an isolated, already migrated copy. Never point at production.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { mkdirSync, createWriteStream } = require('node:fs');
const { join, resolve } = require('node:path');
const { Client } = require('pg');
const { hashPassword } = require('../dist/http/auth');
const ids=['equipment','surveillance','security']; const children=new Map();
const root=resolve(__dirname,'..'); const port=Number(process.env.TEST_PORT||45300); const origin=`http://127.0.0.1:${port}`;
const testRoot=process.env.TEST_ARTIFACT_DIR; let cookie='';
const secrets=Object.fromEntries(ids.map(id=>[`${id.toUpperCase()}_SECRET`,randomBytes(32).toString('hex')]));
async function waitReady(p){for(let n=0;n<100;n++){try{if((await fetch(`http://127.0.0.1:${p}/health/live`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(`Port ${p} not ready`);}
function start(id){const index=ids.indexOf(id);const env={...process.env,...secrets,NODE_ENV:'test',SERVICE_ID:id,PORT:String(id==='core'?port:port+index+1),DATABASE_URL:process.env[id==='core'?'TEST_CORE_DATABASE_URL':`TEST_${id.toUpperCase()}_DATABASE_URL`],APP_BASE_PATH:'/ServiceDesk',PUBLIC_ORIGIN:origin,CORE_URL:origin};ids.forEach((s,i)=>env[`${s.toUpperCase()}_URL`]=`http://127.0.0.1:${port+i+1}`);const child=spawn(process.execPath,[id==='core'?'dist/main.js':`dist/plugins/${id}.main.js`],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});const log=createWriteStream(join(testRoot,`${id}.log`),{flags:'a'});child.stdout.pipe(log);child.stderr.pipe(log);children.set(id,child);return waitReady(Number(env.PORT));}
async function stop(id){const child=children.get(id);if(!child)return;children.delete(id);await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
async function call(path,method='GET',body,expected=200,headers={}){const r=await fetch(`${origin}/ServiceDesk/api${path}`,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);return data;}
async function toggle(id,enabled){const list=await call('/modules');return call(`/modules/${id}`,'PATCH',{enabled,revision:list.services.find(s=>s.code===id).revision});}
async function login(login){const r=await fetch(`${origin}/ServiceDesk/api/auth/login`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({login,password:'LocalSplitTest-Only-2026!'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
async function provision(db,login,role){const uid=(await db.query('INSERT INTO users(email,display_name) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET is_active=true RETURNING id',[`${login}@local.test`,`Проверка · ${role}`])).rows[0].id;await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2 ON CONFLICT DO NOTHING',[uid,role]);await db.query('INSERT INTO auth_credentials VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash',[uid,login,await hashPassword('LocalSplitTest-Only-2026!')]);return uid;}
(async()=>{
  if(!testRoot)throw new Error('Set TEST_ARTIFACT_DIR');
  for(const key of ['CORE',...ids.map(s=>s.toUpperCase())]){const url=new URL(process.env[`TEST_${key}_DATABASE_URL`]||'');if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='55439')throw new Error('Tests require the isolated localhost:55439 PostgreSQL cluster');}
  mkdirSync(testRoot,{recursive:true});
  const db=new Client({connectionString:process.env.TEST_CORE_DATABASE_URL});await db.connect();
  try{
    await start('core');const actor=await provision(db,'split.review','admin');await provision(db,'split.operator','operator');cookie=await login('split.review');
    for(const id of ids)await toggle(id,false);
    assert((await call('/tickets')).tickets.length>=3);assert(Array.isArray((await call('/tickets/development')).tasks));
    assert.equal((await call('/tickets/catalog')).equipmentAvailable,false);
    for(const path of ['/assets/equipment','/cameras/meta','/security/meta','/admin/tables/equipment_items/rows','/admin/tables/camera_violations/rows'])await call(path,'GET',undefined,503);
    const created=await call('/tickets','POST',{userId:actor,subject:'Проверка ядра без подключённых сервисов'},201);assert(created.ticket.id);
    for(const id of ids)await start(id);
    for(const id of ids)await toggle(id,true);
    assert.equal((await call('/tickets/catalog')).equipmentAvailable,true);
    const assets=await call('/assets/overview');assert(assets.equipment.length>=3);assert(assets.stock.length>=3);
    await call('/cameras/meta');await call('/cameras/schedule');await call('/security/meta');await call('/security/dashboard');await call('/integrations/overview');
    const tables=(await call('/admin/tables')).tables;assert(tables.some(t=>t.name==='equipment_items'));assert(tables.some(t=>t.name==='camera_work_shifts'));
    const ticket=await call('/cameras/tickets','POST',{title:'Проверка камеры',objectName:'Тестовая камера',description:'Изолированный тест'},201);
    await call(`/cameras/tickets/${ticket.case.id}`,'PATCH',{status:'completed',resolution:'Изображение восстановлено'});
    const equipment=await call('/assets/equipment','POST',{name:'Тестовый регистратор',equipmentType:'Камера',status:'new'},201);
    const repair=await call('/assets/repairs','POST',{title:'Проверка ремонта',equipmentId:equipment.equipment.id},201);
    await call('/assets/repairs','POST',{title:'Дубликат',equipmentId:equipment.equipment.id},400);
    await call(`/assets/repairs/${repair.case.id}`,'PATCH',{status:'completed'},400);
    await call(`/assets/repairs/${repair.case.id}`,'PATCH',{status:'completed',resolution:'Исправно'});
    assert.equal((await call('/assets/equipment')).find(e=>e.id===equipment.equipment.id).status,'in_stock');
    const scopedTicket=await call('/tickets','POST',{userId:actor,subject:'Связь оборудования',equipmentId:equipment.equipment.id},201);
    await toggle('equipment',false);assert.equal((await call(`/tickets/${scopedTicket.ticket.id}`)).ticket.equipment_name,'Тестовый регистратор');
    await call('/admin/tables/%65quipment_items/rows','GET',undefined,503);
    assert(!(await call('/admin/tables')).tables.some(t=>t.name==='equipment_items'));
    await toggle('equipment',true);assert((await call('/assets/repairs')).cases.some(c=>c.id===repair.case.id));
    const revision=(await call('/modules')).services.find(s=>s.code==='equipment').revision;await call('/modules/equipment','PATCH',{enabled:false,revision:revision-1},409);
    const adminCookie=cookie;cookie=await login('split.operator');await call('/modules/security','PATCH',{enabled:false,revision:0},403,{'x-role':'admin'});await call('/assets/equipment','POST',{name:'Запрещено'},403,{'x-role':'admin'});await call('/admin/tables/equipment_items/rows','GET',undefined,403);cookie=adminCookie;
    for(let i=0;i<ids.length;i++)assert.equal((await fetch(`http://127.0.0.1:${port+i+1}${['/assets/equipment','/cameras/meta','/security/meta'][i]}`,{headers:{'x-role':'admin','x-user-id':actor}})).status,401);
    await stop('equipment');await call('/assets/equipment','GET',undefined,503);await call('/tickets');assert.equal((await call('/tickets/catalog')).equipmentAvailable,false);await call('/cameras/tickets');await start('equipment');assert((await call('/assets/repairs')).cases.some(c=>c.id===repair.case.id));
    assert.equal((await db.query("SELECT to_regclass('public.equipment_items') AS name")).rows[0].name,null);
    console.log('PASS: migration, 4 independent processes, disabled APIs/NSI, revision conflicts, signed identity, service outage isolation, ticket snapshots, repairs and camera tickets.');
    if(process.argv.includes('--keep-running')){console.log(`Preview: ${origin}/ServiceDesk/ (isolated test data, login split.review)`);return;}
  }finally{await db.end();if(!process.argv.includes('--keep-running'))for(const id of [...children.keys()])await stop(id);}
})().catch(async e=>{console.error(e.message);for(const id of [...children.keys()])await stop(id);process.exitCode=1;});
process.on('SIGINT',async()=>{for(const id of [...children.keys()])await stop(id);process.exit();});
