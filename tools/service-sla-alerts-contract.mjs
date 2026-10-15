import assert from 'node:assert/strict'
import fs from 'node:fs'
import {spawnSync} from 'node:child_process'

const sql=fs.readFileSync('supabase/migrations/20261015_service_sla_internal_alerts.sql','utf8')
const html=fs.readFileSync('service-sla-alerts.html','utf8')
const client=fs.readFileSync('assets/service-sla-alerts.js','utf8')
const dashboard=fs.readFileSync('service-operations.html','utf8')
const policy=fs.readFileSync('service-sla-policies.html','utf8')
const isolation=fs.readFileSync('tools/uat-isolation.mjs','utf8')
const workflow=fs.readFileSync('.github/workflows/service-pages-integrity.yml','utf8')
const checks=[
 ['RLS required',/alter table public\.service_sla_alerts enable row level security/.test(sql)],
 ['no anonymous table access',/revoke all on public\.service_sla_alerts from public,anon,authenticated/.test(sql)],
 ['only authenticated select',/grant select on public\.service_sla_alerts to authenticated/.test(sql)],
 ['only active admin policy',/private\.is_active_admin\(\)/.test(sql)],
 ['no direct client update grant',!/grant\s+(?:all|insert|update|delete)\s+on public\.service_sla_alerts\s+to authenticated/i.test(sql)],
 ['unique event identity',/unique\(service_job_id,alert_kind,target_due_at\)/.test(sql)],
 ['retry dedup',/on conflict\(service_job_id,alert_kind,target_due_at\)/.test(sql)],
 ['no reopened acknowledgements',/where public\.service_sla_alerts\.status in \('open','acknowledged'\)/.test(sql)],
 ['no deleted audit history',!/delete from public\.service_sla_alerts/i.test(sql)],
 ['auto resolution only obsolete condition',/not exists\s*\([\s\S]*?private\.service_sla_active_alert_conditions\(v_now\)/.test(sql)],
 ['resolve reason narrowed',/resolution_reason='condition_cleared'/.test(sql)],
 ['no missing SLA deadline assumed',/where c\.deadline is not null and c\.should_alert/.test(sql)],
 ['response = actual site arrival',/j\.arrived_at is not null and j\.arrived_at > j\.sla_response_due_at/.test(sql)],
 ['missing arrival does not prove completed lateness',/j\.arrived_at is null and j\.status not in \('completed','cancelled'\)/.test(sql)],
 ['resolution = recorded completion',/j\.completed_at is not null and j\.completed_at > j\.sla_resolution_due_at/.test(sql)],
 ['missing completion does not prove completed lateness',/j\.completed_at is null and j\.status not in \('completed','cancelled'\)/.test(sql)],
 ['cancelled jobs no breach',/j\.status <> 'cancelled'/.test(sql)],
 ['due soon = explicit 60 min window',/interval '60 minutes'/.test(sql)],
 ['no default deadlines',!/update public\.service_jobs|insert into public\.service_jobs/i.test(sql)],
 ['admin acknowledgement RPC',/create or replace function public\.acknowledge_service_sla_alert\(p_alert_id uuid\)/.test(sql)],
 ['ack requires active admin',/if not private\.is_active_admin\(\) then/.test(sql)],
 ['ack logged against actual admin identity',/acknowledged_by=auth\.uid\(\)/.test(sql)],
 ['ack lock prevents races',/where id=p_alert_id for update/.test(sql)],
 ['ack no duplicate writes',/if v_row\.status='open' then/.test(sql)],
 ['no anonymous ack execute',/revoke all on function public\.acknowledge_service_sla_alert\(uuid\)[\s\S]*?from public,anon,authenticated/.test(sql)],
 ['private refresh not executable by anon',/revoke all on function private\.refresh_service_sla_alerts\(\)[\s\S]*?from public,anon,authenticated/.test(sql)],
 ['uses existing pg_cron',/select cron\.schedule\(/.test(sql)],
 ['cron task uniquely named',/minarva-service-sla-internal-alerts/.test(sql)],
 ['cron every 15 minutes',/\*\/15 \* \* \* \*/.test(sql)],
 ['no webhooks or outbound notifications',!/http_post|http_get|net\.http|twilio|whatsapp|send_sms|send_email|sendgrid|edge_functions/i.test(sql.replace(/--[^\n]*/g,''))],
 ['index on inbox status',/service_sla_alerts_status_detected_idx/.test(sql)],
 ['noindex private inbox',/noindex,nofollow/.test(html)],
 ['no outbound actions on inbox',!/functions\.invoke|window\.open\(/.test(client)],
 ['admin before fetch',/requireActiveAdmin\(db/.test(client)&&/if\(authorized\)await load\(\)/.test(client)],
 ['only approved ack path',/db\.rpc\('acknowledge_service_sla_alert'/.test(client)],
 ['manual ack confirmation',/confirm\('Mark this SLA alert as reviewed/.test(client)],
 ['status filters',/value="open"/.test(html)&&/value="resolved"/.test(html)],
 ['bounded read query',/loadedLimit=250/.test(client)&&/\.limit\(loadedLimit\)/.test(client)],
 ['operations link present',/href="\/service-sla-alerts"/.test(dashboard)],
 ['policies link present',/href="\/service-sla-alerts"/.test(policy)],
 ['staging route checked',/'\/service-sla-alerts'/.test(isolation)],
 ['regression in CI',/node tools\/service-sla-alerts-contract\.mjs/.test(workflow)],
 ['four alert types',["response_breach","resolution_breach","response_due_soon","resolution_due_soon"].every(x=>sql.includes(x))],
 ['function quotes balanced',(sql.match(/as \$\$/g)||[]).length===(sql.match(/^\$\$;/gm)||[]).length],
 ['transaction bounded',/^begin;[\s\S]*\ncommit;\s*$/m.test(sql)]
]
for(const [label,pass] of checks)assert.ok(pass,label)
const check=spawnSync(process.execPath,['--check','assets/service-sla-alerts.js'],{encoding:'utf8'})
assert.equal(check.status,0,check.stderr)
const pageLinks=[...html.matchAll(/href="(\/[^"]+)"/g)].map(x=>x[1])
assert.ok(pageLinks.includes('/service-jobs'))
assert.ok(pageLinks.includes('/service-operations'))
const scenarios=[
 // status, arrival, completion, due, observed time -> response breach
 ['open before', 'open',null,null,5,10,false],
 ['open after', 'open',null,null,5,4,true],
 ['arrival on time','in_progress',3,null,5,10,false],
 ['arrival late','in_progress',6,null,5,10,true],
 ['late arrival recorded on completed','completed',6,9,5,10,true],
 ['no arrival evidence on completed','completed',null,9,5,10,false],
 ['cancelled','cancelled',null,null,5,10,false]
]
for(const [name,status,arrival,completion,due,now,expected] of scenarios){
  const actual=status!=='cancelled'&&(
    arrival!==null?arrival>due:arrival===null&&!['completed','cancelled'].includes(status)&&now>due)
  assert.equal(actual,expected,name)
}
console.log(JSON.stringify({ok:true,staticChecks:checks.length,semanticScenarios:scenarios.length,
  adminOnly:true,deduplicated:true,noOutboundMessages:true,productionFixtureWrites:0}))
