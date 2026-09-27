import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type ServiceActor = { userId: string; role: string };
type Claims = ServiceActor & { audience: string; method: string; path: string; digest: string; expires: number; nonce: string };
const digest = (body: string) => createHash('sha256').update(body).digest('hex');
export function signRequest(secret: string, audience: string, method: string, path: string, body: string, actor: ServiceActor): string {
  if (secret.length < 32) throw new Error('Service secret must contain at least 32 characters');
  const claims: Claims = { ...actor, audience, method, path, digest: digest(body), expires: Date.now() + 30_000, nonce: randomUUID() };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export class RequestVerifier {
  private readonly used = new Map<string, number>();
  verify(token: string, secret: string, audience: string, method: string, path: string, body: string): ServiceActor {
    if (secret.length < 32 || token.length > 4096) throw new Error('Invalid service token');
    const [payload, signature, extra] = token.split('.');
    const expected = createHmac('sha256', secret).update(payload || '').digest();
    const actual = Buffer.from(signature || '', 'base64url');
    if (extra || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Invalid service signature');
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Claims;
    const now = Date.now();
    for (const [nonce, expiry] of this.used) if (expiry < now) this.used.delete(nonce);
    if (c.audience !== audience || c.method !== method || c.path !== path || c.digest !== digest(body) || c.expires < now || c.expires > now + 30_000 || !c.nonce || this.used.has(c.nonce) || !c.userId || !c.role) throw new Error('Invalid service claims');
    this.used.set(c.nonce, c.expires);
    return { userId: c.userId, role: c.role };
  }
}
