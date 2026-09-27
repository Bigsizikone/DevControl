import { RequestVerifier, signRequest } from '../src/plugins/service-auth';
import { routeOwner } from '../src/plugins/contracts';
import { ModulesService } from '../src/plugins/modules.service';
import { ModulesController } from '../src/plugins/modules.controller';
import { installServiceGateway } from '../src/plugins/gateway';
const secret = 'test-secret-with-more-than-thirty-two-characters';
const actor = { userId: 'actor', role: 'admin' };
describe('Service trust boundary', () => {
  test('binds the signature to actor, service, URL, method and body, and rejects replay', () => {
    const token = signRequest(secret,'equipment','POST','/assets/receipts','{"quantity":1}',actor);
    const verify = (aud='equipment',method='POST',path='/assets/receipts',body='{"quantity":1}') => new RequestVerifier().verify(token,secret,aud,method,path,body);
    expect(verify()).toEqual(actor);
    expect(()=>verify('security')).toThrow();
    expect(()=>verify('equipment','DELETE')).toThrow();
    expect(()=>verify('equipment','POST','/admin/tables/users/rows')).toThrow();
    expect(()=>verify('equipment','POST','/assets/receipts','{"quantity":100}')).toThrow();
    const verifier=new RequestVerifier(); verifier.verify(token,secret,'equipment','POST','/assets/receipts','{"quantity":1}');
    expect(()=>verifier.verify(token,secret,'equipment','POST','/assets/receipts','{"quantity":1}')).toThrow();
    expect(()=>new RequestVerifier().verify(token,'wrong-key'.repeat(5),'equipment','POST','/assets/receipts','{"quantity":1}')).toThrow();
  });
  test('rejects expired claims', () => {
    jest.useFakeTimers(); const token=signRequest(secret,'equipment','GET','/assets','',actor); jest.advanceTimersByTime(31000);
    expect(()=>new RequestVerifier().verify(token,secret,'equipment','GET','/assets','')).toThrow(); jest.useRealTimers();
  });
  test.each(['/assets/equipment','/ASSETS/equipment','/%61ssets/equipment','/admin/tables/equipment_items/rows','/admin/tables/%65quipment_items/rows'])('resolves service ownership: %s', path => { expect(routeOwner(path)).toBe('equipment'); });
  test.each(['/assets/../tickets','/assets/%2e%2e/tickets','/assets/%2565quipment','/assets/%5cequipment'])('rejects ambiguous paths: %s', path=>{expect(()=>routeOwner(path)).toThrow();});
  test('keeps SD and development outside the plug-in registry',()=>{expect(routeOwner('/tickets')).toBeUndefined();expect(routeOwner('/admin/tables/development_boards/rows')).toBeUndefined();});
});
describe('Connected block controls',()=>{
  test('disabled blocks fail before any outbound request and catalogue degrades safely',async()=>{
    const database={query:jest.fn().mockResolvedValue({rows:[{enabled:false}]})}; const modules=new ModulesService(database as any);
    const fetchSpy=jest.spyOn(globalThis,'fetch');
    await expect(modules.call('equipment','/assets/equipment','GET','',actor)).rejects.toMatchObject({status:503});
    expect(await modules.equipmentCatalog()).toEqual({rows:[],available:false});expect(fetchSpy).not.toHaveBeenCalled();fetchSpy.mockRestore();
  });
  test('only an administrator can toggle; core cannot be disabled; updates require a current revision',async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[]})};const service=new ModulesService(db as any);const controller=new ModulesController(service);
    expect(()=>controller.update('security','operator','user',{enabled:false,revision:0})).toThrow();expect(db.query).not.toHaveBeenCalled();
    await expect(service.setEnabled('core',false,0,'actor')).rejects.toMatchObject({status:400});
    await expect(service.setEnabled('security','false',0,'actor')).rejects.toMatchObject({status:400});
    await expect(service.setEnabled('security',false,0,'actor')).rejects.toMatchObject({status:409});
  });
  test('unready service cannot be enabled',async()=>{
    const db={query:jest.fn()}; const service=new ModulesService(db as any);jest.spyOn(service,'call').mockResolvedValue(new Response('{"ready":false}'));
    await expect(service.setEnabled('security',true,0,'actor')).rejects.toMatchObject({status:503});expect(db.query).not.toHaveBeenCalled();
  });
  test('gateway gates admin routes and forwards only the verified context',async()=>{
    let middleware:any; const service={call:jest.fn().mockResolvedValue(new Response('{"rows":[]}'))};
    installServiceGateway({use:(m:any)=>{middleware=m;}},service as any,{} as any);
    const response={status:jest.fn().mockReturnThis(),setHeader:jest.fn(),send:jest.fn(),json:jest.fn()}; const next=jest.fn();
    await middleware({path:'/admin/tables/equipment_items/rows',url:'/admin/tables/equipment_items/rows?limit=5',method:'GET',headers:{'x-user-id':'verified-user','x-role':'operator',cookie:'never-forward','x-sd-token':'never-forward'}},response,next);
    expect(service.call).toHaveBeenCalledWith('equipment','/admin/tables/equipment_items/rows?limit=5','GET','',{userId:'verified-user',role:'operator'});expect(next).not.toHaveBeenCalled();
  });
});
