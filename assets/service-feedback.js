import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'
const api=createClient('https://kwullzwhlzziosjsejud.supabase.co','sb_publishable_qfPTbekhbQy8IcU7qCpvUA_i1sdvMuj')
const byId=id=>document.getElementById(id)
const status=byId('status'),form=byId('feedbackForm'),review=byId('reviewPanel')
const token=location.hash.slice(1)
history.replaceState(null,'',location.pathname+location.search)
const allowedHosts=new Set(['g.page','search.google.com','www.google.com','maps.app.goo.gl'])
function showReview(link){
  if(!link)return
  try{
    const url=new URL(link)
    if(url.protocol!=='https:'||!allowedHosts.has(url.hostname))return
    byId('reviewLink').href=url.href
    review.hidden=false
  }catch{}
}
async function init(){
  if(!/^[0-9a-f]{64}$/.test(token)){status.textContent='Invalid or missing feedback link.';return}
  try{
    const {data,error}=await api.rpc('get_service_feedback_session',{p_token:token})
    if(error)throw error
    if(!data?.valid){status.textContent='Feedback link is invalid, expired or revoked.';return}
    byId('jobRef').textContent='Service: '+data.job_number
    showReview(data.google_review_url)
    if(data.already_submitted){status.textContent='Feedback for this service was already received. Thank you.';return}
    status.textContent='Please rate your actual experience. Your answer will be private.'
    form.hidden=false
  }catch{status.textContent='Unable to verify the feedback link. Please try again.'}
}
form.addEventListener('submit',async e=>{
  e.preventDefault()
  const rating=Number(form.querySelector('input[name="rating"]:checked')?.value)
  if(!Number.isInteger(rating)||rating<1||rating>5){status.textContent='Please select a rating.';return}
  const button=byId('submitBtn')
  button.disabled=true
  try{
    const {data,error}=await api.rpc('submit_service_feedback',{
      p_token:token,p_rating:rating,p_comments:byId('comments').value.trim(),
      p_callback_requested:byId('callback').checked
    })
    if(error||!data?.ok)throw error||Error('Feedback failed')
    form.hidden=true
    status.textContent='Thank you. Your feedback has been recorded.'
    showReview(data.google_review_url)
  }catch{
    status.textContent='Feedback could not be saved. The link may already be used or expired.'
    button.disabled=false
  }
})
init()
