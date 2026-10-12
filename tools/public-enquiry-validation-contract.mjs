import assert from 'node:assert/strict'
import fs from 'node:fs'
const front=fs.readFileSync('assets/enquiry-form.js','utf8')
const home=fs.readFileSync('index.html','utf8')
const edge=fs.readFileSync('supabase/functions/public-enquiry-submit/index.ts','utf8')
for(const [name,s] of [['service client',front],['homepage',home],['Supabase Edge',edge]]){
  assert.ok(s.includes("replace(/\\D/g"),name+' must count actual phone digits')
  assert.ok(s.includes('length<7')||s.includes('length < 7'),name+' phone minimum')
  assert.ok(s.includes('length>15')||s.includes('length > 15'),name+' phone max')
}
assert.ok(home.includes('id="contactConsent"')&&home.includes('name="consent_to_contact" required'),'Homepage contact consent required')
assert.ok(home.includes("document.getElementById('contactConsent').checked"),'Homepage consent guard required')
assert.ok(home.includes('href="/privacy"'),'Privacy policy must be linked')
assert.ok(front.includes('Customer support request (manual review; no customer record lookup)'))
assert.ok(edge.includes('consume_public_enquiry_quota'),'Rate limiting preserved')
assert.ok(edge.includes('ALLOWED_ORIGINS'),'Origin restrictions preserved')
assert.ok(edge.includes('honeypot'),'Honeypot preserved')
assert.ok(!edge.includes('live_telephony_enabled'),'No telephony settings altered')
console.log(JSON.stringify({ok:true,edgeClientParity:true,antiSpamPreserved:true}))