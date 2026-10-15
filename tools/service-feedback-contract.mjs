import assert from 'node:assert/strict'
import fs from 'node:fs'
import {spawnSync} from 'node:child_process'
const files=[
'supabase/migrations/20261015_service_feedback_storage.sql',
'supabase/migrations/20261015_service_feedback_admin_rpc.sql',
'supabase/migrations/20261015_service_feedback_token_rpc.sql']
const [storage,admin,token]=files.map(x=>fs.readFileSync(x,'utf8'))
const page=fs.readFileSync('service-feedback.html','utf8')
const browser=fs.readFileSync('assets/service-feedback.js','utf8')
const panel=fs.readFileSync('service-feedback-admin.html','utf8')
const manage=fs.readFileSync('assets/service-feedback-admin.js','utf8')
const checks=[
['feedback tables are private',storage.includes('alter table public.service_feedback enable row level security')&&storage.includes('alter table public.service_feedback_requests enable row level security')],
['no direct anonymous table grants',storage.includes('revoke all on public.service_feedback from anon,authenticated')&&storage.includes('revoke all on public.service_feedback_requests from anon,authenticated')],
['hash never raw bearer token',storage.includes('token_hash text not null unique')&&admin.includes("extensions.digest(v_token,'sha256')")],
['cryptographically random token',admin.includes('extensions.gen_random_bytes(32)')],
['only completed jobs can issue links',admin.includes("v_job.status<>'completed'")],
['admin is required to issue',admin.includes('if not private.is_active_admin() then')],
['expiry and cooldown',admin.includes("interval '14 days'")&&admin.includes("interval '10 minutes'")],
['admin may revoke',admin.includes('revoke_service_feedback_link')],
['bearer length restricted',token.includes("p_token !~ '^[0-9a-f]{64}$'")],
['single use token row lock',token.includes('for update;')&&token.includes('submitted_at is not null')],
['rating limited',storage.includes('rating between 1 and 5')&&token.includes('p_rating not between 1 and 5')],
['callback is explicit',token.includes('coalesce(p_callback_requested,false)')],
['Google link independent of rating',token.includes('select google_review_url')&&token.includes("'google_review_url',v_review")],
['no invented review link',storage.includes('google_review_url text')&&storage.includes('values(true)')],
['anonymous RPC only',token.includes('grant execute on function public.submit_service_feedback')&&token.includes('to anon,authenticated')],
['no public table read',!storage.includes('grant select on public.service_feedback to anon')],
['admin review link has allowlist',manage.includes("'g.page','search.google.com','www.google.com','maps.app.goo.gl'")],
['review not gated on rating',browser.includes('showReview(data.google_review_url)')&&browser.indexOf('showReview(data.google_review_url)')<browser.indexOf("form.addEventListener('submit'")],
['customer token in fragment',browser.includes('location.hash.slice(1)')],
['remove bearer token from visible address',browser.includes('history.replaceState')],
['noindex feedback page',page.includes('noindex,nofollow')],
['feedback private response only',token.includes("'job_number',v_job.job_number")&&!token.includes("'customer_phone'")],
['separate admin route',panel.includes('/assets/service-feedback-admin.js')],
['manual sending only',panel.includes('does not automatically send WhatsApp')],
['linked from service jobs',fs.readFileSync('service-jobs.html','utf8').includes('/service-feedback-admin')]
]
assert.ok(checks.every(x=>x[1]),checks.filter(x=>!x[1]).map(x=>x[0]).join('; '))
for(const file of ['assets/service-feedback.js','assets/service-feedback-admin.js']){
 const p=spawnSync(process.execPath,['--check',file],{encoding:'utf8'})
 assert.equal(p.status,0,file+' syntax: '+p.stderr)
}
for(const sql of [admin,token])assert.equal((sql.match(/as \$\$/g)||[]).length,(sql.match(/^\$\$;/gm)||[]).length,'Unbalanced function delimiters')
console.log(JSON.stringify({ok:true,checks:checks.length,jsSyntax:true,syntheticReviews:0,realMessages:0}))
