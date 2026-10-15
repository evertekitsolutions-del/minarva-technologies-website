import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'
import {requireActiveAdmin} from '/admin-access.js'
import {installAdminSessionGuard} from '/admin-session-guard.js'
import {computeServiceOperations,boardMatches,FIELD_FILTERS} from '/assets/service-operations-metrics.mjs'

const db=createClient('https://kwullzwhlzziosjsejud.supabase.co','sb_publishable_qfPTbekhbQy8IcU7qCpvUA_i1sdvMuj')
installAdminSessionGuard(db)
const el=id=>document.getElementById(id)
const safe=value=>String(value??'').replace(/[&<>"']/g,character=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[character]))
const inIST=value=>{
  if(!value||!Number.isFinite(Date.parse(value)))return 'Not recorded'
  return new Intl.DateTimeFormat('en-IN',{
    timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'
  }).format(new Date(value))+' IST'
}
const statusText=(text,error=false)=>{
  el('status').textContent=text
  el('status').style.color=error?'#a52619':'#344965'
}
let board=null
let filter='all'
const PAGE=500,MAX_PAGES=20 // 10,000-record safety cap, clearly marked partial.
async function readAll(table,columns,order){
  const rows=[]
  let total=null
  for(let page=0;page<MAX_PAGES;page++){
    let q=db.from(table).select(columns,page===0?{count:'exact'}:{})
      .order(order,{ascending:table==='technicians'})
      .range(page*PAGE,(page+1)*PAGE-1)
    const {data,error,count}=await q
    if(error)throw Error('Unable to read '+table+': '+error.message)
    if(page===0)total=count
    rows.push(...(data||[]))
    if((data||[]).length<PAGE)return {rows,truncated:total!==null&&rows.length<total}
  }
  return {rows,truncated:true}
}
function customerName(job){
  const c=Array.isArray(job.customers)?job.customers[0]:job.customers
  return c?.name||'Customer'
}
function engineerName(job){
  const t=Array.isArray(job.technicians)?job.technicians[0]:job.technicians
  return t?.name||'Unassigned'
}
function renderCards(){
  if(!board)return
  el('cards').innerHTML=FIELD_FILTERS.filter(([key])=>key!=='all').map(([key,label])=>
    '<button type="button" class="metric" data-service-filter="'+safe(key)+
    '" aria-pressed="'+String(filter===key)+'"><span>'+safe(label)+
    '</span><strong>'+String(board.counters[key]||0)+'</strong></button>'
  ).join('')
  for(const button of el('cards').querySelectorAll('[data-service-filter]'))
    button.addEventListener('click',()=>{filter=button.dataset.serviceFilter;render()})
}
function renderEngineers(){
  if(!board)return
  el('engineerRows').innerHTML=board.engineers.length?board.engineers.map(t=>
    '<button type="button" class="engineer" data-engineer-id="'+safe(t.id)+
    '" aria-pressed="'+String(filter==='engineer:'+t.id)+'"><strong>'+safe(t.name)+
    (t.active?'':' (inactive)')+'</strong><small>'+t.open+' active · '+
    t.attention+' needing attention · '+t.scheduled+' scheduled · '+
    t.completed+' completed</small></button>'
  ).join(''):'No engineers registered.'
  for(const button of el('engineerRows').querySelectorAll('[data-engineer-id]'))
    button.addEventListener('click',()=>{filter='engineer:'+button.dataset.engineerId;render()})
}
function renderJobs(){
  if(!board)return
  const query=el('search').value.trim().toLocaleLowerCase()
  const rows=board.jobs.filter(job=>{
    if(!boardMatches(job,filter))return false
    if(!query)return true
    return [job.job_number,job.service_category,job.complaint,
      customerName(job),engineerName(job),job.site_address
    ].join(' ').toLocaleLowerCase().includes(query)
  })
  el('jobCount').textContent=rows.length+' displayed of '+board.jobs.length+
    ' loaded · '+board.activeCount+' active · '+board.completedCount+' completed'
  el('jobRows').innerHTML=rows.length?rows.slice(0,250).map(job=>{
    const tags=FIELD_FILTERS.filter(([key])=>key!=='all'&&job.operations[key])
      .map(([,label])=>'<span class="tag alert">'+safe(label)+'</span>').join('')
    const id=encodeURIComponent(job.id)
    const date=job.scheduled_at?'Visit '+inIST(job.scheduled_at):'No appointment scheduled'
    const follow=job.follow_up_at?' · Follow-up '+inIST(job.follow_up_at):''
    return '<article class="job"><div class="jobhead"><a href="/service-jobs?job='+id+
      '">'+safe(job.job_number||'Service job')+'</a><span class="tag">'+
      safe(job.status||'open')+'</span></div><div class="meta">'+
      safe(customerName(job))+' · '+safe(job.service_category||'')+
      ' · Engineer: '+safe(engineerName(job))+' · Priority: '+
      safe(job.priority||'normal')+'</div><div class="meta">'+safe(date+follow)+
      '</div>'+tags+'<div class="meta"><a href="/job-sheet?job='+id+
      '">Open visit / job sheet</a></div></article>'
  }).join('')+
    (rows.length>250?'<p class="note">Only the first 250 matching jobs are displayed. Narrow search/filter for the rest.</p>':'')
    :'<p class="muted">No jobs match the current filter. Select All jobs to reset.</p>'
}
function render(){
  if(!board)return
  el('filter').value=FIELD_FILTERS.some(([name])=>name===filter)?filter:'all'
  renderCards();renderEngineers();renderJobs()
}
async function refresh(){
  el('refresh').disabled=true
  statusText('Reading service jobs, engineer assignments and customer feedback…')
  try{
    const [jobs,engineers,feedback]=await Promise.all([
      readAll('service_jobs',
       'id,job_number,customer_id,service_category,complaint,site_address,priority,status,assigned_technician_id,created_at,scheduled_at,follow_up_at,next_visit_at,visit_started_at,resolution_status,callback_required,callback_at,customers(name),technicians(name)',
       'created_at'),
      readAll('technicians','id,name,active','name'),
      readAll('service_feedback','service_job_id,rating,callback_requested,created_at','created_at')
    ])
    board=computeServiceOperations(jobs.rows,engineers.rows,feedback.rows)
    render()
    if(jobs.truncated||engineers.truncated||feedback.truncated)
      statusText('PARTIAL DATA: at least one query exceeded the safe 10,000-row page cap. Metrics reflect loaded records ONLY.',true)
    else
      statusText('Live read-only snapshot · '+new Intl.DateTimeFormat('en-IN',{
        timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'
      }).format(new Date())+' IST · '+jobs.rows.length+' jobs · no SLA assumptions')
  }catch(error){
    board=null
    el('cards').replaceChildren()
    el('jobRows').textContent='Service data unavailable. Check the administrator account and connection.'
    el('engineerRows').replaceChildren()
    el('jobCount').textContent=''
    statusText('Unable to load board: '+String(error.message||error),true)
  }finally{el('refresh').disabled=false}
}
for(const [key,label] of FIELD_FILTERS)el('filter').add(new Option(label,key))
el('filter').addEventListener('change',()=>{filter=el('filter').value;render()})
el('search').addEventListener('input',renderJobs)
el('refresh').addEventListener('click',refresh)
const granted=await requireActiveAdmin(db,{userLine:el('userLine')})
if(granted)await refresh()
else statusText('An active administrator account is required. No service data loaded.',true)
