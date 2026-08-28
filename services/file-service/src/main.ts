import { createPool, createServiceServer, dependencyStatus, readJson, sendJson, connectRedis } from '../../../packages/shared-kernel/src/runtime';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

async function bootstrap() {
const pool = createPool(process.env.FILE_DATABASE_URL ?? process.env.DATABASE_URL);
const redis = await connectRedis();
const s3 = process.env.S3_ENDPOINT ? new S3Client({ region: process.env.S3_REGION ?? 'us-east-1', endpoint: process.env.S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' } }) : null;
const bucket = process.env.S3_BUCKET ?? 'service-desk-files';
const port = Number(process.env.PORT ?? 4008);

const server = createServiceServer({ serviceName:'file-service', port, readiness:()=>dependencyStatus(pool,redis,null), routes:{
  'POST /files/presign': async (request,response,_url,context) => {
    if (!pool) return sendJson(response,503,{error:'File DB не настроена'},context);
    if (!s3) return sendJson(response,503,{error:'S3/MinIO не настроен'},context);
    const body = await readJson(request); const objectKey=`${body.ownerService ?? 'unknown'}/${body.entityType ?? 'file'}/${body.entityId ?? randomUUID()}/${randomUUID()}-${String(body.fileName ?? 'file')}`;
    const uploadUrl=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:objectKey,ContentType:String(body.mimeType ?? 'application/octet-stream')}),{expiresIn:Number(process.env.S3_PRESIGN_TTL ?? 900)});
    return sendJson(response,200,{objectKey,uploadUrl,expiresIn:Number(process.env.S3_PRESIGN_TTL ?? 900)},context);
  },
  'POST /files': async (request,response,_url,context) => {
    if (!pool) return sendJson(response,503,{error:'File DB не настроена'},context);
    const body=await readJson(request); const result=await pool.query('INSERT INTO files (owner_service,entity_type,entity_id,object_key,original_file_name,mime_type,file_size,checksum,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[body.ownerService,body.entityType,body.entityId,body.objectKey,body.fileName,body.mimeType,body.fileSize,body.checksum??null,context.actorId]);
    return sendJson(response,201,{file:result.rows[0]},context);
  },
} });
const shutdown=async()=>{server.close();await pool?.end();redis?.disconnect();process.exit(0);};
process.once('SIGTERM',()=>void shutdown());process.once('SIGINT',()=>void shutdown());
}
void bootstrap();
