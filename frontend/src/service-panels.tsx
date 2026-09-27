import { useEffect, useState, type FormEvent } from 'react';
import { EquipmentPanel, InventoryPanel } from './business-panels';
import { CamerasPanelV2 } from './camera-panel-v2';
import { serviceRequest } from './connected-services';
import { currentUser } from './session';
type Case = { id: string; number: number; title: string; description: string; status: string; object_name?: string; inventory_number?: string; equipment_name?: string; author_name: string; assignee_name?: string; resolution?: string; created_at: string };
type Equipment = { id: string; name: string; inventory_number: string; is_active: boolean; status: string };
const statusLabels: Record<string,string> = { new:'Новое',in_progress:'В работе',completed:'Выполнено',cancelled:'Отменено' };
function CasesPanel({ repair }: { repair: boolean }) {
  const path = repair ? '/assets/repairs' : '/cameras/tickets';
  const [cases,setCases] = useState<Case[]>([]); const [users,setUsers] = useState<Array<{id:string;display_name:string}>>([]);
  const [equipment,setEquipment] = useState<Equipment[]>([]); const [selected,setSelected] = useState<Case | null>(null);
  const [message,setMessage] = useState(''); const [busy,setBusy] = useState(false); const [loaded,setLoaded] = useState(false);
  const load = async () => { const result = await serviceRequest<{cases:Case[];users:typeof users}>(path); setCases(result.cases); setUsers(result.users); if (repair) setEquipment((await serviceRequest<Equipment[]>('/assets/equipment')).filter(e=>e.is_active && e.status!=='written_off')); setLoaded(true); };
  useEffect(()=>{ void load().catch(e=>setMessage(e.message)); },[path]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true); setMessage('');
    try { await serviceRequest(path,{method:'POST',body:JSON.stringify(Object.fromEntries(data))}); form.reset(); await load(); setMessage(repair?'Ремонт зарегистрирован.':'Тикет зарегистрирован.'); }
    catch(e) { setMessage(e instanceof Error?e.message:'Не удалось сохранить'); } finally {setBusy(false);}
  }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!selected)return; const data=new FormData(event.currentTarget); setBusy(true); setMessage('');
    try {await serviceRequest(`${path}/${selected.id}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(data))});setSelected(null);await load();setMessage('Изменения сохранены.');}
    catch(e){setMessage(e instanceof Error?e.message:'Не удалось сохранить');}finally{setBusy(false);}
  }
  return <section className="panel service-cases"><div className="eyebrow">{repair?'ОБСЛУЖИВАНИЕ ОБОРУДОВАНИЯ':'ВИДЕОНАБЛЮДЕНИЕ'}</div><h1>{repair?'Ремонты оборудования':'Тикеты по камерам'}</h1>{message&&<p className="inline-error" role="status">{message}</p>}
    <form className="case-form" onSubmit={create}><label>Тема<input name="title" required maxLength={200} placeholder={repair?'Замена блока питания':'Камера не передаёт изображение'}/></label>{repair?<label>Оборудование<select name="equipmentId" required><option value="">Выберите оборудование</option>{equipment.map(e=><option key={e.id} value={e.id}>{e.inventory_number} · {e.name}</option>)}</select></label>:<label>Камера или объект<input name="objectName" required maxLength={200} placeholder="Камера 12 · Главный вход"/></label>}<label>Исполнитель<select name="assigneeId"><option value="">Не назначен</option>{users.map(u=><option key={u.id} value={u.id}>{u.display_name}</option>)}</select></label><label>Описание<textarea name="description" maxLength={10000} rows={3}/></label><div className="case-wide"><button className="primary-button" disabled={busy||!loaded}>{busy?'Сохранение…':repair?'Открыть ремонт':'Создать тикет'}</button></div></form>
    {selected&&<form className="case-editor" onSubmit={update} key={selected.id}><strong>№{selected.number} · {selected.title}</strong><p>{selected.description||'Описание не задано'}</p><label>Статус<select name="status" defaultValue={selected.status}>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Результат / причина отмены<textarea name="resolution" defaultValue={selected.resolution||''} maxLength={10000}/></label><div className="case-actions"><button className="primary-button" disabled={busy||['completed','cancelled'].includes(selected.status)}>Сохранить</button><button type="button" className="secondary-button" onClick={()=>setSelected(null)}>Закрыть</button></div></form>}
    <div className="table-wrap"><table><thead><tr><th>Номер / тема</th><th>{repair?'Оборудование':'Камера / объект'}</th><th>Статус</th><th>Исполнитель</th><th>Создано</th></tr></thead><tbody>{cases.map(c=><tr key={c.id}><td><button className="case-list-button" onClick={()=>setSelected(c)}>№{c.number} · {c.title}</button></td><td>{repair?`${c.inventory_number} · ${c.equipment_name}`:c.object_name}</td><td>{statusLabels[c.status]}</td><td>{c.assignee_name||'Не назначен'}</td><td>{new Date(c.created_at).toLocaleDateString('ru-RU')}</td></tr>)}</tbody></table>{cases.length===0&&<p className="case-empty">{loaded?'Записей пока нет. Создайте первую выше.':'Загрузка…'}</p>}</div>
  </section>;
}
export function EquipmentServicePanel() {
  const [tab,setTab]=useState('equipment'); const canRepair=['admin','agent','executor','dispatcher','equipment_manager','support_specialist'].includes(currentUser.role);
  return <div className="tool-page"><h1 className="service-section-title">Поступление и ремонт оборудования</h1><div className="service-tabs" role="tablist" aria-label="Оборудование">{[['equipment','Оборудование'],['inventory','Поступления и движения'],...(canRepair?[['repairs','Ремонты']]:[])].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div><div role="tabpanel">{tab==='equipment'?<EquipmentPanel/>:tab==='inventory'?<InventoryPanel/>:<CasesPanel repair/>}</div></div>;
}
export function SurveillanceServicePanel() {
  const [tab,setTab]=useState('schedule');
  return <div className="tool-page"><h1 className="service-section-title">Видеонаблюдение</h1><div className="service-tabs" role="tablist" aria-label="Видеонаблюдение">{[['schedule','Камеры и график'],['tickets','Тикеты по камерам']].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div><div role="tabpanel">{tab==='schedule'?<CamerasPanelV2/>:<CasesPanel repair={false}/>}</div></div>;
}
