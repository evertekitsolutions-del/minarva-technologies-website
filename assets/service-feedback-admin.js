import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'
import {requireActiveAdmin} from '/admin-access.js'
const db=createClient('https://kwullzwhlzziosjsejud.supabase.co','sb_publishable_qfPTbekhbQy8IcU7qCpvUA_i1sdvMuj')
const el=id=>document.getElementById(id)
const state=(id,value)=>el(id).textContent=String(value||'')
let allowed=false
async function load(){
 if(!await requireActiveAdmin(db,{userLine:el('userLine')}))return
 allowed=true
 const jobs=await db.from('service_jobs').select('id,job_number,service_category').eq('status','completed').limit(200)
 if(jobs.error)throw jobs.error
 el('jobSelect').replaceChildren(new Option('Select completed service',''))
 for(const j of jobs.data||[])el('jobSelect').add(new Option(j.job_number+' | '+j.service_category,j.id))
 const settings=await db.from('service_feedback_settings').select('google_review_url').eq('singleton',true).maybeSingle()
 if(settings.error)throw settings.error
 el('googleReviewUrl').value=settings.data?.google_review_url||''
}
async function loadFeedback(){
 const job=el('jobSelect').value
 el('issueBtn').disabled=!job;el('revokeBtn').disabled=!job
 el('linkOutput').value='';el('copyBtn').disabled=true
 el('feedbackList').textContent=job?'Loading…':'Select a completed service.'
 if(!job)return
 const x=await db.from('service_feedback').select('rating,comments,callback_requested,created_at').eq('service_job_id',job).maybeSingle()
 if(x.error)throw x.error
 const f=x.data
 state('feedbackList',f?f.rating+'/5 • '+(f.comments||'(no comments)')+' • Callback requested: '+(f.callback_requested?'Yes':'No'):'No feedback received yet.')
}
async function issue(){
 const job=el('jobSelect').value
 if(!allowed||!job)return
 const x=await db.rpc('issue_service_feedback_link',{p_service_job_id:job})
 if(x.error)throw x.error
 el('linkOutput').value=new URL('/service-feedback#'+x.data.token,location.origin).href
 el('copyBtn').disabled=false
 state('linkStatus','Private link issued. Send manually to the correct customer only.')
}
async function revoke(){
 if(!allowed||!el('jobSelect').value||!confirm('Revoke unused feedback link?'))return
 const x=await db.rpc('revoke_service_feedback_link',{p_service_job_id:el('jobSelect').value})
 if(x.error)throw x.error
 el('linkOutput').value='';el('copyBtn').disabled=true
 state('linkStatus',x.data.revoked?'Revoked.':'No unused link found.')
}
async function saveReview(){
 const v=el('googleReviewUrl').value.trim()
 if(v){
   const u=new URL(v)
   if(u.protocol!=='https:'||!['g.page','search.google.com','www.google.com','maps.app.goo.gl'].includes(u.hostname))throw Error('Official Google HTTPS review link required.')
 }
 const x=await db.from('service_feedback_settings').upsert({singleton:true,google_review_url:v||null})
 if(x.error)throw x.error
 state('status',v?'Official review link saved.':'Review link cleared.')
}
const safe=fn=>async()=>{try{await fn()}catch(e){state('status',e.message||'Request failed')}}
el('jobSelect').addEventListener('change',safe(loadFeedback))
el('issueBtn').addEventListener('click',safe(issue))
el('revokeBtn').addEventListener('click',safe(revoke))
el('saveReviewBtn').addEventListener('click',safe(saveReview))
el('copyBtn').addEventListener('click',safe(async()=>{
 await navigator.clipboard.writeText(el('linkOutput').value)
 state('linkStatus','Private link copied. Share only with the correct customer.')
}))
safe(load)()
