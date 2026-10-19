import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/migrations/20261019_service_rpc_private_boundaries.sql','utf8');
const priorSla=readFileSync('supabase/migrations/20261015_service_sla_internal_alerts.sql','utf8');
const priorMaintenance=readFileSync('supabase/migrations/20261015_maintenance_admin_refresh.sql','utf8');
const scripts=[
  readFileSync('assets/service-sla-alerts.js','utf8'),
  readFileSync('assets/service-maintenance.js','utf8')
];

const signatures=[
  ['acknowledge_service_sla_alert','p_alert_id uuid','uuid'],
  ['refresh_maintenance_schedule','','']
];
for(const [name,args,grantArgs] of signatures){
  const privateStart=`create or replace function service_ops_private.${name}(${args})`;
  const publicStart=`create or replace function public.${name}(${args})`;
  assert.ok(sql.includes(privateStart),`private implementation: ${name}`);
  assert.ok(sql.includes(publicStart),`public wrapper: ${name}`);
  const privateBody=sql.slice(sql.indexOf(privateStart),sql.indexOf(publicStart));
  const publicBody=sql.slice(sql.indexOf(publicStart),sql.indexOf('\n$fn$;',sql.indexOf(publicStart))+6);
  assert.match(privateBody,/language plpgsql security definer set search_path=''/);
  assert.match(privateBody,/auth\.uid\(\) is null or not private\.is_active_admin\(\)/);
  assert.match(privateBody,/errcode='42501'/);
  assert.match(publicBody,/language sql security invoker set search_path=''/);
  assert.match(publicBody,new RegExp(`select service_ops_private\\.${name}\\(`));
  assert.doesNotMatch(publicBody,/security definer|\bupdate\b|\binsert\b|\bdelete\b/i);
  assert.ok(sql.includes(`service_ops_private.${name}(${grantArgs})`));
  assert.ok(sql.includes(`public.${name}(${grantArgs})`));
  assert.ok(scripts.some(x=>x.includes(name)),`existing client call retained: ${name}`);
}
assert.match(priorSla,/create or replace function public\.acknowledge_service_sla_alert/);
assert.match(priorMaintenance,/create or replace function public\.refresh_maintenance_schedule/);
assert.match(sql,/revoke all on schema service_ops_private from public, anon, authenticated/);
assert.match(sql,/grant usage on schema service_ops_private to authenticated/);
assert.match(sql,/from public, anon, authenticated;\s+grant execute on function/);
assert.match(sql,/to authenticated;\s+-- No grants for anon/);
assert.match(sql,/where id=p_alert_id for update/);
assert.match(sql,/if v_row.status='open' then/);
assert.match(sql,/acknowledged_by=auth\.uid\(\)/);
assert.match(sql,/return private\.refresh_service_maintenance_visits\(current_date\)/);
assert.doesNotMatch(sql.replace(/--[^\n]*/g,''),/cron\.schedule|http_post|net\.http_post|twilio|send_sms|send_email/i);
assert.match(sql,/^begin;[\s\S]*\ncommit;\s*$/m);
assert.equal((sql.match(/as \$fn\$/g)||[]).length,4);
assert.equal((sql.match(/^\$fn\$;/gm)||[]).length,4);
console.log(JSON.stringify({ok:true,privateImplementations:2,invokerWrappers:2,clientRpcNamesPreserved:true,noOutboundActions:true}));
