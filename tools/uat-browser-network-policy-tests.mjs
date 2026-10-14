import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createUatPreflightNetworkPolicy,UAT_PREFLIGHT_ROUTES} from './uat-browser-network-policy.mjs'

const base='https://dedicated-uat.example.com'
const backend='https://stagingunit123.supabase.co'
const prod='https://kwullzwhlzziosjsejud.supabase.co'
const decide=createUatPreflightNetworkPolicy({baseUrl:base,backendUrl:backend})
const permitted=[
  ['staging document',base+'/admin','GET'],
  ['staging JS',base+'/assets/enquiry-form.js','GET'],
  ['staging CORS preflight',base+'/admin','OPTIONS'],
  ['staging head',base+'/platform-health','HEAD'],
  ['staging backend rows',backend+'/rest/v1/customers?select=id','GET'],
  ['staging backend row head',backend+'/rest/v1/invoices?select=id','HEAD'],
  ['staging backend auth user',backend+'/auth/v1/user','GET'],
  ['staging auth settings',backend+'/auth/v1/settings','GET'],
  ['staging storage object',backend+'/storage/v1/object/public/avatars/test.png','GET'],
  ['reviewed platform health',backend+'/rest/v1/rpc/platform_health_readiness','POST'],
  ['reviewed release readiness',backend+'/rest/v1/rpc/platform_release_readiness','POST'],
  ['reviewed call readiness',backend+'/rest/v1/rpc/customer_care_call_readiness_audit','POST'],
  ['staging font', 'https://fonts.googleapis.com/css?family=Manrope','GET'],
  ['staging font file','https://fonts.gstatic.com/x/font.woff2','GET'],
  ['pinned supabase ESM','https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm','GET'],
  ['legacy static icon','https://d2ol7oe51mr4n9.cloudfront.net/icon.svg','GET'],
  ['staging backend OPTIONS',backend+'/rest/v1/customer','OPTIONS']
]
for(const [label,url,method] of permitted){
  assert.equal(decide({url,method}).allow,true,label)
}
assert.equal(decide({url:backend+'/auth/v1/token?grant_type=password',method:'POST',phase:'login'}).allow,true,'staging-only password login')
assert.equal(decide({url:backend+'/auth/v1/token?grant_type=refresh_token',method:'POST',phase:'read_only'}).allow,true,'staging-only refresh')
const denied=[
  ['staging frontend POST',base+'/contact','POST','read_only'],
  ['staging frontend PATCH',base+'/admin','PATCH','read_only'],
  ['staging backend create customer',backend+'/rest/v1/customers','POST','read_only'],
  ['staging backend update customer',backend+'/rest/v1/customers?id=eq.1','PATCH','read_only'],
  ['staging backend delete invoice',backend+'/rest/v1/invoices?id=eq.1','DELETE','read_only'],
  ['payment mutation RPC',backend+'/rest/v1/rpc/record_invoice_payment','POST','read_only'],
  ['admin change RPC',backend+'/rest/v1/rpc/platform_update_manual_release_check','POST','read_only'],
  ['customer care provider settings mutation',backend+'/rest/v1/rpc/customer_care_provider_runtime_state','POST','read_only'],
  ['voice adapter settings mutation',backend+'/rest/v1/rpc/customer_care_voice_select_adapters','POST','read_only'],
  ['calling dry run potentially writes',backend+'/rest/v1/rpc/customer_care_call_dry_run','POST','read_only'],
  ['staging edge dispatcher',backend+'/functions/v1/customer-care-dispatcher','POST','read_only'],
  ['staging edge voice simulator',backend+'/functions/v1/customer-care-voice-simulator','POST','read_only'],
  ['staging auth signup',backend+'/auth/v1/signup','POST','read_only'],
  ['unapproved token grant',backend+'/auth/v1/token?grant_type=signup','POST','login'],
  ['password login outside login phase',backend+'/auth/v1/token?grant_type=password','POST','read_only'],
  ['refresh during login phase',backend+'/auth/v1/token?grant_type=refresh_token','POST','login'],
  ['production database fetch',prod+'/rest/v1/customers','GET','read_only'],
  ['other Supabase project fetch','https://wmjgefbaliuwmaxyzxkq.supabase.co/rest/v1/customers','GET','read_only'],
  ['production website','https://www.minarvatechnologies.com/admin','GET','read_only'],
  ['unexpected outbound request','https://wa.me/12345678','GET','read_only'],
  ['unexpected analytics','https://tracker.invalid/event','POST','read_only'],
  ['unapproved image host','https://external.invalid/img.png','GET','read_only'],
  ['HTTP downgrade','http://dedicated-uat.example.com/admin','GET','read_only'],
  ['staging websocket','wss://stagingunit123.supabase.co/realtime/v1/websocket','GET','read_only'],
  ['external asset write','https://cdn.jsdelivr.net/npm/test','POST','read_only'],
  ['GET edge function',backend+'/functions/v1/customer-care-dispatcher','GET','read_only'],
  ['unknown backend path',backend+'/admin/v1/projects','GET','read_only'],
  ['unreviewed RPC',backend+'/rest/v1/rpc/unknown','POST','read_only']
]
for(const [label,url,method,phase] of denied){
  const result=decide({url,method,phase})
  assert.equal(result.allow,false,label)
  assert.equal(typeof result.reason,'string',label)
}
assert.throws(()=>createUatPreflightNetworkPolicy({baseUrl:base,backendUrl:prod}),/Production Supabase/)
assert.throws(()=>createUatPreflightNetworkPolicy({baseUrl:'https://www.minarvatechnologies.com',backendUrl:backend}),/Production frontend/)
assert.equal(new Set(UAT_PREFLIGHT_ROUTES).size,UAT_PREFLIGHT_ROUTES.length,'No duplicate routes')
assert.ok(UAT_PREFLIGHT_ROUTES.includes('/platform-health'))
assert.ok(UAT_PREFLIGHT_ROUTES.includes('/release-readiness'))
assert.ok(UAT_PREFLIGHT_ROUTES.includes('/technician'))
const harness=fs.readFileSync('tools/transactional-uat.mjs','utf8')
assert.match(harness,/serviceWorkers:'block'/)
assert.match(harness,/context\.routeWebSocket/)
assert.match(harness,/createUatPreflightNetworkPolicy/)
assert.match(harness,/ensureClean\(\)/)
assert.match(harness,/phase='read_only'/)
assert.doesNotMatch(harness,/UAT_ALLOW_SYNTHETIC_DATA/)
console.log(JSON.stringify({
  ok:true,allowedCases:permitted.length+2,deniedCases:denied.length,
  authenticatedRouteCount:UAT_PREFLIGHT_ROUTES.length,
  mode:'pure-policy-tests-only',productionWrites:0,phoneCalls:0
}))
