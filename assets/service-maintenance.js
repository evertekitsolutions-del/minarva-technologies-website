import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'
import {requireActiveAdmin} from '/admin-access.js'
import {installAdminSessionGuard} from '/admin-session-guard.js'
import {maintenancePreview} from '/assets/maintenance-calendar.mjs'
const db=createClient('https://kwullzwhlzziosjsejud.supabase.co','sb_publishable_qfPTbekhbQy8IcU7qCpvUA_i1sdvMuj')
installAdminSessionGuard(db)
const el=id=>document.getElementById(id)
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const date=v=>String(v??'').slice(0,10)
const nowDate=()=>{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date()).map(part=>[part.type,part.value]))
  return p.year+'-'+p.month+'-'+p.day
}
let authorized=false,customers=[],technicians=[],contracts=[],visits=[]
const status=(v)=>{el('status').textContent=v}
const formStatus=v=>{el('formStatus').textContent=v}
function setType(){
  const warranty=el('type').value!=='amc'
  const recurring=el('type').value!=='warranty'
  for(const id of ['warrantyStarts','warrantyEnds'])el(id).required=warranty
  for(const id of ['interval','firstVisit'])el(id).disabled=!recurring
  el('firstVisit').required=recurring
  if(!recurring)el('preview').textContent='Warranty-only coverage never creates recurring maintenance visits.'
  else updatePreview()
}
function updatePreview(){
  if(el('type').value==='warranty')return
  const items=maintenancePreview({
    startsOn:el('starts').value,endsOn:el('ends').value,
    firstVisitOn:el('firstVisit').value,intervalMonths:Number(el('interval').value),
    asOf:nowDate()
  })
  el('preview').textContent=items.length?
    'Potential visit dates (if activated now): '+items.slice(0,8).join(' · ')+
      (items.length>8?' · and '+(items.length-8)+' more':''):
    'No planned visit within the next 45 days. Recurring maintenance requires activation.'
}
function customerName(id){return customers.find(c=>c.id===id)?.name||'Customer'}
function technicianName(id){return id?(technicians.find(t=>t.id===id)?.name||'Unknown Engineer'):'Unassigned'}
async function loadSelectors(){
  const [cs,ts]=await Promise.all([
    db.from('customers').select('id,name').order('name',{ascending:true}).limit(1000),
    db.from('technicians').select('id,name,active').order('name',{ascending:true}).limit(1000)
  ])
  if(cs.error||ts.error)throw cs.error||ts.error
  customers=cs.data||[];technicians=ts.data||[]
  el('customerId').innerHTML='<option value="">Choose customer…</option>'+
    customers.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')
  el('engineerId').innerHTML='<option value="">Unassigned</option>'+
    technicians.filter(t=>t.active).map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join('')
}
function renderContracts(){
  el('contracts').innerHTML=contracts.length?contracts.map(c=>{
    const active=c.active===true
    const recurring=c.contract_type!=='warranty'
    return '<article class="entry"><strong>'+esc(c.contract_number)+'</strong>'+
      '<div class="muted">'+esc(customerName(c.customer_id))+' · '+esc(c.contract_type.toUpperCase())+
      ' · '+esc(c.service_category)+'</div>'+
      '<div class="muted">Equipment: '+esc(c.equipment_details)+' · '+esc(date(c.starts_on))+
      ' to '+esc(date(c.ends_on))+'</div>'+
      '<div class="muted">Warranty: '+esc(c.warranty_starts_on||'Not recorded')+
      ' → '+esc(c.warranty_ends_on||'Not recorded')+
      (recurring?' · Every '+esc(c.maintenance_interval_months)+' months':' · No recurring visits')+
      ' · Engineer: '+esc(technicianName(c.assigned_technician_id))+'</div>'+
      '<span class="tag '+(active?'':'warning')+'">'+(active?'ACTIVE':'INACTIVE')+'</span>'+
      '<div class="actions"><button type="button" class="ghost" data-contract="'+esc(c.id)+'" data-action="'+(active?'deactivate':'activate')+'">'+
      (active?'Deactivate Contract':'Activate Contract')+'</button></div></article>'
  }).join(''):'<p class="muted">No real AMC/Warranty contracts have been registered yet.</p>'
  for(const button of el('contracts').querySelectorAll('[data-contract]')){
    button.addEventListener('click',()=>toggleContract(button))
  }
}
function renderVisits(total){
  const asOf=nowDate()
  el('visits').innerHTML=visits.length?visits.map(v=>{
    const c=contracts.find(c=>c.id===v.contract_id)
    const linked=Boolean(v.service_job_id),skipped=Boolean(v.skipped_at)
    const flag=linked?'JOB CREATED':skipped?'SKIPPED':v.due_on<asOf?'DUE / OVERDUE':'PLANNED'
    return '<article class="entry"><strong>'+esc(c?.contract_number||'Maintenance visit')+
      ' · '+esc(v.due_on)+'</strong><div class="muted">'+
      esc(customerName(c?.customer_id))+' · '+esc(c?.service_category||'')+
      '</div><span class="tag '+(flag==='DUE / OVERDUE'?'warning':'')+'">'+esc(flag)+'</span>'+
      (skipped?'<div class="muted">Skipped: '+esc(v.skip_reason)+'</div>':'')+
      '<div class="actions">'+(linked?
        '<a href="/service-jobs?job='+encodeURIComponent(v.service_job_id)+'">Open linked Service Job</a>':
        skipped?'':c?.active?
        '<button type="button" data-visit="'+esc(v.id)+'" data-action="create">Create Service Job</button>'+
        '<button type="button" class="ghost" data-visit="'+esc(v.id)+'" data-action="skip">Skip with Reason</button>':
        '<span class="muted">Activate contract before creating a job.</span>')+
      '</div></article>'
  }).join(''):'<p class="muted">No planned maintenance visits yet. Activate an AMC and refresh the schedule.</p>'
  if(total>visits.length)el('visits').insertAdjacentHTML('beforeend',
    '<p class="note">Only first '+visits.length+' of '+total+' visit records shown. Pagination will be expanded as usage grows.</p>')
  for(const button of el('visits').querySelectorAll('[data-visit]')){
    button.addEventListener('click',()=>actOnVisit(button))
  }
}
async function reload(){
  if(!authorized)return
  status('Reading contracts and planned visits…')
  const [cs,vs]=await Promise.all([
    db.from('service_maintenance_contracts')
      .select('id,contract_number,customer_id,contract_type,service_category,equipment_details,equipment_serial,starts_on,ends_on,warranty_starts_on,warranty_ends_on,maintenance_interval_months,first_visit_on,site_address,assigned_technician_id,active,activated_at,created_at')
      .order('created_at',{ascending:false}).limit(1000),
    db.from('service_maintenance_visits')
      .select('id,contract_id,due_on,service_job_id,skipped_at,skip_reason,generated_at',{count:'exact'})
      .order('due_on',{ascending:true}).limit(500)
  ])
  if(cs.error||vs.error){status('Data unavailable: '+String(cs.error?.message||vs.error?.message));return}
  contracts=cs.data||[];visits=vs.data||[]
  renderContracts();renderVisits(vs.count||0)
  status(contracts.length+' contracts · '+visits.length+' planned/linked/skipped visits loaded. No outbound communications.')
}
async function toggleContract(button){
  const active=button.dataset.action==='activate',id=button.dataset.contract
  const c=contracts.find(c=>c.id===id)
  if(!c||!authorized)return
  const prompt=active?
    'Activate '+c.contract_number+'? The daily scheduler will create planned visit records for this AMC. No customer message or Service Job will be sent/created automatically.':
    'Deactivate '+c.contract_number+'? This stops new visit planning. Existing visit records remain for audit.'
  if(!confirm(prompt))return
  button.disabled=true
  try{
    const {data,error}=await db.from('service_maintenance_contracts')
      .update({active}).eq('id',id).select('id').single()
    if(error||!data)throw error||Error('Contract update failed')
    if(active&&c.contract_type!=='warranty'){
      const scheduled=await db.rpc('refresh_maintenance_schedule')
      if(scheduled.error)status('Contract activated, but visit refresh failed: '+scheduled.error.message)
    }
    await reload()
  }catch(e){status('Unable to change contract: '+String(e.message||e));button.disabled=false}
}
async function actOnVisit(button){
  if(!authorized)return
  const id=button.dataset.visit,action=button.dataset.action
  if(action==='skip'){
    const reason=prompt('Why is this maintenance visit skipped? (5–500 characters)')
    if(reason===null)return
    if(reason.trim().length<5||reason.trim().length>500){status('Reason must be 5–500 characters.');return}
    if(!confirm('Permanently skip this planned visit with the given reason?'))return
    button.disabled=true
    const {error}=await db.rpc('skip_maintenance_visit',{p_visit_id:id,p_reason:reason.trim()})
    if(error)status('Unable to skip: '+error.message)
    else await reload()
    button.disabled=false
    return
  }
  if(!confirm('Create one Service Job for this planned AMC visit? The actual appointment and customer messaging must still be managed separately.'))return
  button.disabled=true
  try{
    const {data,error}=await db.rpc('create_maintenance_service_job',{
      p_visit_id:id,p_scheduled_at:null,p_technician_id:null
    })
    if(error||!data?.id)throw error||Error('Service job was not created')
    await reload()
    status((data.already_created?'Existing':'New')+' Service Job linked successfully. Set a customer-agreed visit slot in Service Jobs.')
  }catch(e){status('Unable to convert visit: '+String(e.message||e));button.disabled=false}
}
async function createContract(e){
  e.preventDefault()
  if(!authorized)return
  const type=el('type').value,recurring=type!=='warranty'
  const starts=el('starts').value,ends=el('ends').value
  const warrantyStarts=el('warrantyStarts').value||null
  const warrantyEnds=el('warrantyEnds').value||null
  if(ends<starts){formStatus('Coverage end cannot precede start.');return}
  if(type!=='amc'&&(!warrantyStarts||!warrantyEnds||warrantyEnds<warrantyStarts)){
    formStatus('Enter valid warranty start/end dates.');return
  }
  const firstVisit=recurring?(el('firstVisit').value||null):null
  if(recurring&&(!firstVisit||firstVisit<starts||firstVisit>ends)){
    formStatus('First AMC visit date must fall inside coverage dates.');return
  }
  if(!confirm('Save this coverage as INACTIVE? Nothing will schedule until the administrator activates it.'))return
  el('createBtn').disabled=true
  formStatus('Saving contract…')
  const data={
    customer_id:el('customerId').value,contract_type:type,
    service_category:el('category').value.trim(),
    equipment_details:el('equipment').value.trim(),equipment_serial:el('serial').value.trim()||null,
    site_address:el('site').value.trim()||null,assigned_technician_id:el('engineerId').value||null,
    starts_on:starts,ends_on:ends,warranty_starts_on:warrantyStarts,warranty_ends_on:warrantyEnds,
    maintenance_interval_months:recurring?Number(el('interval').value):null,
    first_visit_on:firstVisit,notes:el('notes').value.trim()||null,active:false
  }
  try{
    const {data:record,error}=await db.from('service_maintenance_contracts')
      .insert(data).select('id,contract_number').single()
    if(error||!record)throw error||Error('Contract registration failed')
    el('contractForm').reset();setType()
    await reload()
    formStatus('Saved '+record.contract_number+' (inactive). Activate explicitly to schedule visits.')
  }catch(e){formStatus('Could not register contract: '+String(e.message||e))}
  finally{el('createBtn').disabled=false}
}
el('type').addEventListener('change',setType)
for(const id of ['starts','ends','firstVisit','interval'])el(id).addEventListener('change',updatePreview)
el('contractForm').addEventListener('submit',createContract)
el('clearBtn').addEventListener('click',()=>{el('contractForm').reset();setType();formStatus('')})
el('refreshBtn').addEventListener('click',async()=>{
 if(!authorized)return
 const {error}=await db.rpc('refresh_maintenance_schedule')
 if(error)status('Schedule refresh failed: '+error.message)
 else await reload()
})
authorized=Boolean(await requireActiveAdmin(db,{userLine:el('userLine')}))
if(authorized){
 try{await loadSelectors();setType();await reload()}catch(e){status('Unable to load: '+String(e.message||e))}
}else status('Active administrator required. No contract data loaded.')
