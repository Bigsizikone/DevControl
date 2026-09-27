const { cp, mkdir, access, writeFile, readdir, chown, stat } = require('node:fs/promises');
const { join } = require('node:path');
const { Client } = require('pg');
async function own(path) { await chown(path,1000,1000); if ((await stat(path)).isDirectory()) for (const entry of await readdir(path)) await own(join(path,entry)); }
(async()=>{
  for (const [id,dir,table,target] of [['surveillance','camera-violations','camera_violation_attachments','/camera-files'],['security','security','security_record_attachments','/security-files']]) {
    const db=new Client({connectionString:process.env[`${id.toUpperCase()}_DATABASE_URL`]}); await db.connect();
    try {
      const marker=join(target,'.legacy-imported');
      const imported=await access(marker).then(()=>true,()=>false);
      if (!imported) {
        await mkdir(target,{recursive:true});
        const source=join('/legacy-files',dir);
        if (await access(source).then(()=>true,()=>false)) await cp(source,join(target,dir),{recursive:true,errorOnExist:true,force:false});
      }
      const rows=(await db.query(`SELECT file_path,file_size FROM ${table}`)).rows;
      for(const row of rows) {
        const relative=String(row.file_path).replace(/^\/app\/storage\//,'').replace(/^storage\//,'');
        if(!relative.startsWith(`${dir}/`)||relative.includes('..')) throw new Error(`Unexpected stored attachment path in ${id}`);
        const file=await stat(join(target,relative)); if(Number(row.file_size)!==file.size) throw new Error(`Attachment size mismatch in ${id}`);
      }
      await own(target); await writeFile(marker,new Date().toISOString());
      console.log(`${id}: verified ${rows.length} attachments`);
    } finally{await db.end();}
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
