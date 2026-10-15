import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'
import {requireActiveAdmin} from '/admin-access.js'
import {installAdminSessionGuard} from '/admin-session-guard.js'
const db=createClient('https://kwullzwhlzziosjsejud.supabase.co','sb_publishable_qfPTbekhbQy8IcU7qCpvUA_i1sdvMuj')
installAdminSessionGuard(db)
const el=id=>document.getElementById(id)
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const humanTime=value=>value?new Intl.DateTimeFormat('en-IN',{
  dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'
}).format(new Date(value))+' IST':'Not recorded'
const names={
  response_breach:'Engineer arrival SLA breached',
  resolution_breach:'Service completion SLA breached',
  response_due_soon:'Arrival deadline within 60 minutes',
  resolution_due_soon:'Completion deadline within 60 minutes'
}
const loadedLimit=250
let authorized=false
async function load(){
  if(!authorized)return
  const button=el('refreshBtn')
  button.disabled=true
  el('status').textContent='Loading private SLA alerts…'
  el('alerts').replaceChildren()
  try{
    const choice=el('stateFilter').value
    let q=db.from('service_sla_alerts')
      .select('id,service_job_id,alert_kind,target_due_at,status,detected_at,last_seen_at,acknowledged_at,resolved_at,resolution_reason,service_jobs(job_number,service_category,priority,status,assigned_technician_id,technicians(name))',{count:'exact'})
      .order('detected_at',{ascending:false})
      .limit(loadedLimit)
    if(choice!=='all')q=q.eq('status',choice)
    const {data,error,count}=await q
    if(error)throw error
    const items=data||[]
    el('summary').textContent=items.length+' displayed'+
      (count>items.length?' of '+count+' matching records (refine filter for more)':' matching alerts')+
      ' · Last read '+humanTime(new Date().toISOString())
    el('alerts').innerHTML=items.length?items.map(a=>{
      const job=Array.isArray(a.service_jobs)?a.service_jobs[0]:a.service_jobs
      const engineer=Array.isArray(job?.technicians)?job.technicians[0]:job?.technicians
      const ref=encodeURIComponent(a.service_job_id)
      return '<article class="alert"><div class="alerthead"><div>'+
        '<a href="/service-jobs?job='+ref+'">'+esc(job?.job_number||'Service job')+'</a>'+
        '<div class="meta">'+esc(job?.service_category||'')+' · '+esc(job?.priority||'')+
        ' · Engineer: '+esc(engineer?.name||'Unassigned')+'</div></div>'+
        '<span class="tag '+esc(a.status)+'">'+esc(a.status)+'</span></div>'+
        '<h2 style="margin-top:13px">'+esc(names[a.alert_kind]||a.alert_kind)+'</h2>'+
        '<div class="meta">SLA deadline: '+esc(humanTime(a.target_due_at))+
        ' · Detected: '+esc(humanTime(a.detected_at))+
        (a.acknowledged_at?' · Acknowledged: '+esc(humanTime(a.acknowledged_at)):'')+
        (a.resolved_at?' · Resolved: '+esc(humanTime(a.resolved_at)):'')+
        '</div><div class="controls"><a href="/job-sheet?job='+ref+
        '">Open Job Sheet</a>'+
        (a.status==='open'?'<button type="button" data-ack="'+esc(a.id)+'">Acknowledge alert</button>':'')+
        '</div></article>'
    }).join(''):'<p class="muted">No '+esc(choice)+' SLA alerts. New alerts appear only for explicitly configured job deadlines.</p>'
    for(const button of el('alerts').querySelectorAll('[data-ack]')){
      button.addEventListener('click',()=>acknowledge(button))
    }
    el('status').textContent='Live admin-only alert records. Changes from cron may take up to 15 minutes to appear.'
  }catch(e){
    el('summary').textContent=''
    el('status').textContent='Unable to load SLA inbox: '+String(e.message||e)
  }finally{button.disabled=false}
}
async function acknowledge(button){
  if(!authorized)return
  if(!confirm('Mark this SLA alert as reviewed by an administrator?'))return
  button.disabled=true
  try{
    const {data,error}=await db.rpc('acknowledge_service_sla_alert',{p_alert_id:button.dataset.ack})
    if(error||!data?.ok)throw error||Error('Acknowledgement failed')
    await load()
  }catch(e){
    el('status').textContent='Could not acknowledge alert: '+String(e.message||e)
    button.disabled=false
  }
}
el('stateFilter').addEventListener('change',load)
el('refreshBtn').addEventListener('click',load)
authorized=Boolean(await requireActiveAdmin(db,{userLine:el('userLine')}))
if(authorized)await load()
else el('status').textContent='Active administrator access is required. No SLA alerts loaded.'
