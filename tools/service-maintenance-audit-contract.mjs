import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validateFollowupActivity,describeFollowupActivity} from '../assets/maintenance-followup-audit.mjs';

const sql=readFileSync('supabase/migrations/20261019_maintenance_manual_followup_audit.sql','utf8');
const client=readFileSync('assets/maintenance-followup-audit.mjs','utf8');
const html=readFileSync('service-maintenance.html','utf8');
const admin=readFileSync('assets/service-maintenance.js','utf8');
const contract={id:'test-contract',customer_id:'test-customer'};
const customer={id:'test-customer',name:'Customer',do_not_call:false};
const valid={contract,customer,event_type:'draft_reviewed',channel:'whatsapp',
  language:'ml',consent_reference:'Permission received on 2026-10-19 for renewal message',
  summary:'Operator reviewed a manual template'};
assert.equal(validateFollowupActivity(valid),null);
assert.equal(validateFollowupActivity({...valid,event_type:'manual_attempt_reported'}),null);
assert.equal(validateFollowupActivity({...valid,event_type:'customer_reply_reported',consent_reference:''}),null);
assert.match(validateFollowupActivity({...valid,customer:{...customer,id:'someone-else'}}),/matching real/);
assert.match(validateFollowupActivity({...valid,consent_reference:''}),/permission source/);
assert.match(validateFollowupActivity({...valid,channel:'phone',customer:{...customer,do_not_call:true}}),/Do Not Call/);
assert.equal(validateFollowupActivity({...valid,channel:'phone',event_type:'customer_reply_reported',
  customer:{...customer,do_not_call:true}}),null);
assert.match(validateFollowupActivity({...valid,event_type:'delivered'}),/valid activity/);
assert.match(validateFollowupActivity({...valid,language:'de'}),/valid activity/);
assert.match(validateFollowupActivity({...valid,summary:'x'}),/note must be/);
assert.match(describeFollowupActivity(valid),/reviewed\/approved/);

const checks=[
  ['isolated append-only event table',/create table public\.service_maintenance_followup_events/.test(sql)],
  ['row-level security enabled',/alter table public\.service_maintenance_followup_events enable row level security/.test(sql)],
  ['anonymous and old grants revoked',/revoke all on public\.service_maintenance_followup_events from public,anon,authenticated/.test(sql)],
  ['read and insert only',/grant select,insert on public\.service_maintenance_followup_events to authenticated/.test(sql)],
  ['admin-only select policy',/create policy maintenance_followup_admin_read[\s\S]*?private\.is_active_admin\(\)/.test(sql)],
  ['admin-only insert policy',/create policy maintenance_followup_admin_insert[\s\S]*?private\.is_active_admin\(\)/.test(sql)],
  ['insert attributed to auth identity',/recorded_by = \(select auth\.uid\(\)\)/.test(sql)],
  ['source customer FK',/customer_id uuid not null references public\.customers\(id\)/.test(sql)],
  ['real source contract FK',/contract_id uuid not null references public\.service_maintenance_contracts\(id\)/.test(sql)],
  ['database compares customer identity',/new\.customer_id is distinct from v_customer_id/.test(sql)],
  ['database blocks do-not-call phone',/new\.channel='phone' and v_do_not_call=true/.test(sql)],
  ['separate permission attestation enforced',/Document where customer permission was obtained/.test(sql)],
  ['server timestamps replace client timestamps',/new\.recorded_at:=now\(\)/.test(sql)],
  ['server actor replaces client identity',/new\.recorded_by:=auth\.uid\(\)/.test(sql)],
  ['client retries idempotent',/client_event_id uuid not null unique/.test(sql)&&/requestId\?\?=crypto\.randomUUID\(\)/.test(client)],
  ['no update/delete privileges',!/grant\s+(?:update|delete|all)\s+on public\.service_maintenance_followup_events/i.test(sql)],
  ['no direct privileged API RPC',!/create or replace function public\./i.test(sql)],
  ['function is security invoker',/language plpgsql security invoker set search_path=''/.test(sql)],
  ['private function revoke',/revoke all on function private\.maintenance_prepare_followup_event\(\)/.test(sql)],
  ['no server-side message sending',!/cron\.schedule|http_post|net\.http|twilio|send_sms|send_email|insert into public\.customer_contact_outbox/i.test(sql.replace(/--[^\n]*/g,''))],
  ['UI only inserts audit events',/\.from\('service_maintenance_followup_events'\)\.insert\(payload\)/.test(client)],
  ['explicit reviewed-record confirmation',/if\(!confirm\('Store an append-only administrator statement/.test(client)],
  ['no webhooks or provider APIs in UI',!/functions\.invoke|fetch\(|WebSocket|\.rpc\(|window\.open/.test(client)],
  ['selected real contract',/if\(!byId\.has\(contractId\)\)/.test(client)],
  ['original draft and copy preserved',/installRenewalFollowupDesk/.test(admin)&&/renderFollowupDesk\(\{contracts,customers,asOf:nowDate\(\)\}\)/.test(admin)],
  ['admin gate before reads',/authorized=Boolean\(await requireActiveAdmin\(db/.test(admin)],
  ['new event read after admin loading',/renderFollowupHistory\(\{contracts,customers\}\)/.test(admin)],
  ['new panel is private',/id="renewalFollowupHistory"/.test(html)&&/noindex,nofollow/.test(html)],
  ['operator truthfulness checkbox',/data-history="attestation"/.test(html)],
  ['submit disabled by default',/data-history="save" disabled/.test(html)],
  ['transaction bounded',/begin;[\s\S]*commit;\s*$/.test(sql)]
];
for(const [label,ok] of checks)assert.ok(ok,label);

for(const file of ['assets/maintenance-followup-audit.mjs','assets/service-maintenance.js']){
  const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
}
console.log(JSON.stringify({ok:true,staticChecks:checks.length,semanticScenarios:10,
  appendOnly:true,noProviderSending:true,realDatabaseUAT:false}));
