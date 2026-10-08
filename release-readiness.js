import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'
import { installAdminSessionGuard } from '/admin-session-guard.js'
import { requireActiveAdmin } from '/admin-access.js'

const supabase=createClient('https://kwullzwhlzziosjsejud.supabase.co','sb_publishable_qfPTbekhbQy8IcU7qCpvUA_i1sdvMuj')
installAdminSessionGuard(supabase)
const $=id=>document.getElementById(id)
let readiness=null,checks=[],uatRuns=[],uatSteps=[]
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const fmt=v=>v?new Date(v).toLocaleString():'—'
function setMsg(id,text,type=''){const e=$(id);e.textContent=text||'';e.className='statusmsg'+(type?' '+type:'')}
async function verifyAdmin(){return Boolean(await requireActiveAdmin(supabase,{userLine:$('userLine')}))}

function renderChecks(){
  $('checkCount').textContent=checks.length+' item(s)'
  $('checkList').innerHTML=checks.length?checks.map(x=>'<div class="check"><div class="check-top"><div><strong>'+esc(x.title)+'</strong><div class="meta">'+esc(x.category)+' • '+(x.automated?'Automated':'Manual')+(x.blocking?' • Blocking':'')+'</div></div><span class="pill '+esc(x.status)+'">'+esc(x.status.toUpperCase())+'</span></div>'+(x.evidence?'<div class="meta" style="margin-top:6px">Evidence: '+esc(x.evidence)+'</div>':'')+(x.notes?'<div class="meta">'+esc(x.notes)+'</div>':'')+'</div>').join(''):'<div class="meta">No checklist items.</div>'
  const manual=checks.filter(x=>!x.automated)
  $('manualCheck').innerHTML=manual.map(x=>'<option value="'+esc(x.check_key)+'">'+esc(x.title)+' — '+esc(x.status)+'</option>').join('')
}
function renderUat(){
  const run=uatRuns[0]
  if(!run){$('uatState').textContent='NONE';$('uatState').className='pill pending';$('uatSummary').textContent='No UAT run yet.';$('uatRows').innerHTML='<tr><td colspan="5">No UAT run.</td></tr>';return}
  $('uatState').textContent=run.status.toUpperCase();$('uatState').className='pill '+run.status
  $('uatSummary').textContent=run.name+' • '+run.environment+' • Started '+fmt(run.started_at||run.created_at)+(run.completed_at?' • Completed '+fmt(run.completed_at):'')
  $('uatRows').innerHTML=uatSteps.length?uatSteps.map(s=>'<tr><td>'+esc(s.area)+'</td><td><strong>'+esc(s.title)+'</strong></td><td><span class="pill '+esc(s.status)+'">'+esc(s.status.toUpperCase())+'</span></td><td><input data-uat-evidence="'+esc(s.id)+'" value="'+esc(s.evidence||'')+'" placeholder="Evidence reference"></td><td><select data-uat-status="'+esc(s.id)+'"><option value="pending" '+(s.status==='pending'?'selected':'')+'>Pending</option><option value="pass" '+(s.status==='pass'?'selected':'')+'>Pass</option><option value="fail" '+(s.status==='fail'?'selected':'')+'>Fail</option><option value="blocked" '+(s.status==='blocked'?'selected':'')+'>Blocked</option><option value="not_applicable" '+(s.status==='not_applicable'?'selected':'')+'>N/A</option></select><button class="btn btn-ghost" data-save-uat="'+esc(s.id)+'" style="margin-top:5px;padding:7px 9px">Save</button></td></tr>').join(''):'<tr><td colspan="5">No UAT steps.</td></tr>'
  document.querySelectorAll('[data-save-uat]').forEach(b=>b.addEventListener('click',()=>saveUatStep(b.dataset.saveUat)))
}
function renderStats(){
  $('blockingTotal').textContent=readiness?.blocking_total??0;$('blockingPass').textContent=readiness?.blocking_pass??0;$('blockingFail').textContent=readiness?.blocking_fail??0;$('blockingPending').textContent=readiness?.blocking_pending??0
  $('releaseState').textContent=readiness?.ready_for_release?'READY':'BLOCKED';$('releaseState').style.color=readiness?.ready_for_release?'var(--green)':'var(--red)'
  $('lockBox').innerHTML='<strong>Release ready: '+(readiness?.ready_for_release?'YES':'NO')+'</strong><br>Automated calling live: '+(readiness?.automated_calling_live_enabled?'YES':'NO')+'<br>Telephony emergency stop: '+(readiness?.telephony_emergency_stop?'ON':'OFF')+'<br><br><strong>Current policy:</strong> release and real automated calling are separate gates. A software release does not enable phone dialing.'
}
async function load(){
  const [r,c,u]=await Promise.all([supabase.rpc('platform_release_readiness'),supabase.from('platform_release_checklist').select('*').order('sort_order',{ascending:true}),supabase.from('platform_uat_runs').select('*').order('created_at',{ascending:false}).limit(10)])
  if(r.error)throw r.error;if(c.error)throw c.error;if(u.error)throw u.error
  readiness=r.data||{};checks=c.data||[];uatRuns=u.data||[];uatSteps=[]
  if(uatRuns[0]){const s=await supabase.from('platform_uat_steps').select('*').eq('run_id',uatRuns[0].id).order('sort_order',{ascending:true});if(s.error)throw s.error;uatSteps=s.data||[]}
  renderStats();renderChecks();renderUat()
}
async function startUat(){
  $('startUatBtn').disabled=true;setMsg('uatMsg','')
  const {data,error}=await supabase.rpc('platform_create_uat_run',{p_name:$('uatName').value.trim()||'Production Release UAT',p_environment:$('uatEnv').value})
  $('startUatBtn').disabled=false;if(error){setMsg('uatMsg',error.message,'err');return}
  setMsg('uatMsg','UAT run started: '+data,'ok');await load()
}
async function saveUatStep(id){
  const status=document.querySelector('[data-uat-status="'+id+'"]').value,evidence=document.querySelector('[data-uat-evidence="'+id+'"]').value.trim()
  const {error}=await supabase.rpc('platform_update_uat_step',{p_step_id:id,p_status:status,p_evidence:evidence||null,p_notes:null})
  if(error){setMsg('uatMsg',error.message,'err');return}setMsg('uatMsg','UAT step saved.','ok');await load()
}
async function saveCheck(){
  const key=$('manualCheck').value;if(!key)return
  const {error}=await supabase.rpc('platform_update_manual_release_check',{p_check_key:key,p_status:$('manualStatus').value,p_evidence:$('manualEvidence').value.trim()||null,p_notes:null})
  if(error){setMsg('checkMsg',error.message,'err');return}
  $('manualEvidence').value='';setMsg('checkMsg','Checklist evidence saved.','ok');await load()
}
async function init(){try{if(!await verifyAdmin())return;await load()}catch(error){setMsg('uatMsg','Could not load release readiness: '+(error.message||error),'err')}}
$('refreshBtn').addEventListener('click',load);$('startUatBtn').addEventListener('click',startUat);$('saveCheckBtn').addEventListener('click',saveCheck)
$('healthBtn').addEventListener('click',()=>location.href='/platform-health');$('careBtn').addEventListener('click',()=>location.href='/customer-care');$('adminBtn').addEventListener('click',()=>location.href='/admin')
supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')location.href='/admin'})
init()
