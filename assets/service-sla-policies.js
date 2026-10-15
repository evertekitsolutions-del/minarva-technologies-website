import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'
import {requireActiveAdmin} from '/admin-access.js'
import {installAdminSessionGuard} from '/admin-session-guard.js'
const db=createClient('https://kwullzwhlzziosjsejud.supabase.co','sb_publishable_qfPTbekhbQy8IcU7qCpvUA_i1sdvMuj')
installAdminSessionGuard(db)
const el=id=>document.getElementById(id)
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const priorities=['low','normal','high','urgent']
const human=m=>m==null?'Not configured':m+' minutes ('+(m/60).toFixed(1)+' hours)'
function render(rows){
  el('policyRows').innerHTML=priorities.map(priority=>{
    const p=rows.find(item=>item.priority===priority)
    if(!p)return '<article class="policy">Missing policy configuration: '+priority+'</article>'
    return '<article class="policy" data-priority="'+priority+'"><h2>'+esc(priority.toUpperCase())+'</h2>'+
      '<label class="toggle"><input type="checkbox" class="enabled" '+(p.enabled?'checked':'')+'> Enable for future jobs</label>'+
      '<label>Arrival response target (minutes)<input type="number" class="response" min="1" max="525600" step="1" value="'+esc(p.response_target_minutes??'')+'" placeholder="Not configured"></label>'+
      '<label>Resolution target (minutes)<input type="number" class="resolution" min="1" max="525600" step="1" value="'+esc(p.resolution_target_minutes??'')+'" placeholder="Not configured"></label>'+
      '<p class="hint">Current response: '+esc(human(p.response_target_minutes))+' · Resolution: '+esc(human(p.resolution_target_minutes))+'</p>'+
      '<button type="button" class="save">Save '+priority+' policy</button><div class="status" role="status" aria-live="polite"></div>'+
      '</article>'
  }).join('')
  for(const card of el('policyRows').querySelectorAll('[data-priority]')){
    card.querySelector('.save').addEventListener('click',()=>save(card))
  }
}
function minutes(text){
  const value=String(text).trim()
  if(value==='')return null
  const number=Number(value)
  if(!Number.isInteger(number)||number<1||number>525600)
    throw Error('SLA target must be an integer between 1 and 525600 minutes.')
  return number
}
async function save(card){
  const message=card.querySelector('.status')
  const button=card.querySelector('.save')
  try{
    const enabled=card.querySelector('.enabled').checked
    const response_target_minutes=minutes(card.querySelector('.response').value)
    const resolution_target_minutes=minutes(card.querySelector('.resolution').value)
    if(enabled&&response_target_minutes==null&&resolution_target_minutes==null)
      throw Error('Enable a policy only after entering at least one SLA target.')
    const approval=confirm('Save SLA policy for '+card.dataset.priority.toUpperCase()+'? Applies only to NEW jobs. Existing job deadlines will not change.')
    if(!approval)return
    button.disabled=true
    message.textContent='Saving…'
    const {data,error}=await db.from('service_sla_policies').update({
      enabled,response_target_minutes,resolution_target_minutes
    }).eq('priority',card.dataset.priority).select('priority').single()
    if(error)throw error
    if(!data)throw Error('Policy could not be saved')
    message.textContent='Saved. Future jobs use this policy only if enabled.'
  }catch(error){message.textContent=error.message||'Unable to save policy'}
  finally{button.disabled=false}
}
async function init(){
  if(!await requireActiveAdmin(db,{userLine:el('userLine')})){
    el('status').textContent='Administrator access is required.'
    return
  }
  const {data,error}=await db.from('service_sla_policies')
    .select('priority,enabled,response_target_minutes,resolution_target_minutes,updated_at')
  if(error){el('status').textContent='Unable to load SLA settings: '+error.message;return}
  render(data||[])
  el('status').textContent='Review and save each customer-agreed priority target. Nothing is enabled automatically.'
}
init().catch(e=>{el('status').textContent='Unable to load SLA settings: '+String(e.message||e)})
