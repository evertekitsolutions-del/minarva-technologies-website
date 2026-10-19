import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {
  draftRenewalFollowup,renewalContactReview,renewalFollowupCandidates
} from '../assets/maintenance-renewal-followup.mjs';
const read=path=>readFileSync(path,'utf8');
const code=read('assets/maintenance-renewal-followup.mjs');
const admin=read('assets/service-maintenance.js');
const page=read('service-maintenance.html');
const customer={id:'customer1',name:'Example Customer',preferred_language:'ml',
  do_not_call:true,call_consent:true,preferred_contact_channel:'whatsapp'};
const contract={id:'c1',customer_id:'customer1',contract_number:'MNT-123',
  service_category:'CCTV Maintenance',ends_on:'2026-10-20',renewed_from_contract_id:null};
const english=draftRenewalFollowup({contract,customer,today:'2026-10-19',language:'en'});
const malayalam=draftRenewalFollowup({contract,customer,today:'2026-10-19',language:'ml'});
const expired=draftRenewalFollowup({contract,customer,today:'2026-10-21',language:'en'});
assert.match(english,/is due to end on 2026-10-20/);
assert.match(expired,/expired on 2026-10-20/);
assert.match(malayalam,/അവസാനിക്കും/);
assert.match(malayalam,/2026-10-20/);
assert.match(english,/Example Customer/);
assert.match(malayalam,/MNT-123/);
assert.doesNotMatch(english,/₹\s*\d+|payment has been received|invoice is due/i);
assert.doesNotMatch(malayalam,/₹\s*\d+/);
for(const malformed of [
  {...contract,ends_on:'2026-02-30'},
  {...contract,ends_on:'not-a-date'},
  {...contract,contract_number:''}
])assert.throws(()=>draftRenewalFollowup({contract:malformed,customer,today:'2026-10-19'}));
assert.throws(()=>draftRenewalFollowup({contract,customer:null,today:'2026-10-19'}));
const candidates=renewalFollowupCandidates([
  contract,{id:'c2',customer_id:'customer1',ends_on:'2026-10-01'},
  {id:'c3',customer_id:'customer1',ends_on:'2027-01-01'},
  {id:'c4',customer_id:'customer1',ends_on:'2026-11-01',renewed_from_contract_id:'c2'},
],'2026-10-19');
assert.deepEqual(candidates.map(x=>x.contract.id),['c1','c4']);
assert.match(renewalContactReview(customer),/DO NOT CALL/);
assert.match(renewalContactReview(customer),/NOT proof/);
assert.match(renewalContactReview({...customer,do_not_call:false}),/NOT proof/);

const checks=[
  ['no outbound integrations',!/\.rpc\(|fetch\(|XMLHttpRequest|WebSocket|whatsapp|window\.open\s*\(|location\.href\s*=|send_message|send_sms/i.test(
    code.replace(/\/\/[^\n]*/g,''))],
  ['only explicit clipboard copy',/navigator\.clipboard\.writeText\(message\.value\)/.test(code)],
  ['copy requires manual permission',/!confirmPermission\.checked/.test(code)],
  ['permission reset on change',/const redraw=\(\)=>\{\s*clear\(\)/.test(code)],
  ['permission reset after edits',/message\.addEventListener\('input',\(\)=>\{\s*confirmPermission\.checked=false/.test(code)],
  ['clipboard button disabled without permission',/copy\.disabled=!confirmPermission\.checked/.test(code)],
  ['no consent persistence',!/\.insert\(|\.update\(|localStorage|sessionStorage/.test(code)],
  ['no fake phone optin assertion',/not proof of renewal-message\/WhatsApp opt-in/i.test(code)],
  ['admin gate before all loads',/authorized=Boolean\(await requireActiveAdmin\(db/.test(admin)],
  ['admin source customer preferences',/select\('id,name,preferred_language,preferred_contact_channel,call_consent,do_not_call'\)/.test(admin)],
  ['followup wired into real reload',/renderFollowupDesk\(\{contracts,customers,asOf:nowDate\(\)\}\)/.test(admin)],
  ['no public route',/noindex,nofollow/.test(page)],
  ['draft editing and clear control',/data-followup="message"/.test(page)],
  ['explicit permission checkbox',/data-followup="permission"/.test(page)],
  ['copy initially disabled',/data-followup="copy" disabled/.test(page)],
  ['status feedback accessible',/data-followup="status" role="status" aria-live="polite"/.test(page)],
  ['service communication provider unchanged',!/service_job_notification_outbox|customer_contact_outbox|notification_template_variants/.test(code)],
];
for(const [name,good] of checks)assert.ok(good,name);
for(const name of ['assets/maintenance-renewal-followup.mjs','assets/service-maintenance.js']){
  const check=spawnSync(process.execPath,['--check',name],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
}
console.log(JSON.stringify({ok:true,checks:checks.length,templates:2,
  expiredScenarios:2,customerConsentGate:true,noOutboundContact:true,noProductionWrites:true}));
