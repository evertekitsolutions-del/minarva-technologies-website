import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {nextRenewalStart,renewalAttention,renewalWatch} from '../assets/maintenance-renewal.mjs';

const migration=readFileSync('supabase/migrations/20261019_service_maintenance_renewal_links.sql','utf8');
const client=readFileSync('assets/service-maintenance.js','utf8');
const page=readFileSync('service-maintenance.html','utf8');
const guard=readFileSync('supabase/migrations/20261015_service_maintenance_scheduler.sql','utf8');
const checks=[
  ['successor self FK',/renewed_from_contract_id uuid\s+references public\.service_maintenance_contracts\(id\) on delete restrict/.test(migration)],
  ['unique successor enforcement',/create unique index[^;]*\(renewed_from_contract_id\)/s.test(migration)],
  ['server validation trigger',/before insert or update on public\.service_maintenance_contracts/.test(migration)],
  ['renewal ancestry immutable',/new\.renewed_from_contract_id is distinct from old\.renewed_from_contract_id/.test(migration)],
  ['same customer verified at DB',/new\.customer_id is distinct from v_prior_customer/.test(migration)],
  ['no overlapping coverage',/new\.starts_on <= v_prior_ends/.test(migration)],
  ['source read through RLS',/from public\.service_maintenance_contracts/.test(migration)],
  ['reject active renewal at creation',/tg_op='INSERT' and new\.active/.test(migration)],
  ['new function invoker',/language plpgsql security invoker set search_path=''/.test(migration)],
  ['private function not executable by API users',/revoke all on function private\.service_maintenance_validate_renewal\(\)/.test(migration)],
  ['original immutable dates preserved',/new\.ends_on is distinct from old\.ends_on/.test(guard)],
  ['renewal UI source field read',client.includes('renewed_from_contract_id,contract_type')],
  ['renewal saved inactive',client.includes('notes:el(\'notes\').value.trim()||null,active:false')],
  ['reviewed draft action',client.includes('beginRenewal(button.dataset.contract)')],
  ['no automatic end-date assumption',client.includes("el('ends').value=''")],
  ['explicit admin guard',client.includes('requireActiveAdmin(db')],
  ['renewal watch page',page.includes('id="renewalWatch"')],
  ['cancel draft control',page.includes('id="cancelRenewalBtn"')],
  ['no outbound or invoice writes',!/insert\s+into\s+public\.invoices|net\.http_post|http_post|twilio/i.test(migration.replace(/--[^\n]*/g,''))],
  ['transactional migration',/begin;[\s\S]*commit;\s*$/.test(migration)],
];
for(const [name,pass] of checks)assert.ok(pass,name);

assert.equal(nextRenewalStart('2026-12-31'),'2027-01-01');
assert.equal(nextRenewalStart('2028-02-28'),'2028-02-29');
assert.equal(nextRenewalStart('2028-02-29'),'2028-03-01');
assert.throws(()=>nextRenewalStart('2026-02-30'),RangeError);
assert.deepEqual(renewalAttention({ends_on:'2026-10-19'},'2026-10-19'),{
  code:'expiring',label:'Coverage ends today',daysRemaining:0,needsAttention:true
});
assert.equal(renewalAttention({ends_on:'2026-10-18'},'2026-10-19').code,'expired');
assert.equal(renewalAttention({ends_on:'2026-12-18'},'2026-10-19').code,'expiring');
assert.equal(renewalAttention({ends_on:'2026-12-19'},'2026-10-19').code,'later');
assert.equal(renewalAttention({ends_on:'2026-09-01'},'2026-10-19',true).code,'renewed');
assert.equal(renewalAttention({ends_on:'invalid'},'2026-10-19').code,'invalid');
const fixtures=[
  {id:'a',ends_on:'2026-10-20'},
  {id:'b',ends_on:'2026-10-01'},
  {id:'c',ends_on:'2026-12-30'},
  {id:'d',ends_on:'2027-01-19',renewed_from_contract_id:'b'}
];
assert.deepEqual(renewalWatch(fixtures,'2026-10-19').map(x=>x.contract.id),['a']);
for(const filename of ['assets/maintenance-renewal.mjs','assets/service-maintenance.js']){
 const check=spawnSync(process.execPath,['--check',filename],{encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
}
console.log(JSON.stringify({ok:true,checks:checks.length,calendarCases:10,renewalWatch:true,noProductionWrites:true}));
