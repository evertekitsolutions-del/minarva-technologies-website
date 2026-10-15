import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {computeServiceOperations,boardMatches,FIELD_FILTERS} from '../assets/service-operations-metrics.mjs'

const now=Date.parse('2026-10-15T10:00:00Z')
const before='2026-10-15T08:00:00Z'
const future='2026-10-16T08:00:00Z'
const soon='2026-10-15T10:30:00Z'
const j=(id,changes={})=>({id,job_number:'JOB-'+id,priority:'normal',
  created_at:'2026-10-14T00:00:00Z',assigned_technician_id:'a',
  status:'in_progress',scheduled_at:null,follow_up_at:null,
  arrived_at:null,completed_at:null,visit_started_at:null,
  sla_response_due_at:null,sla_resolution_due_at:null,...changes})
const items=[
 j('not-configured'),
 j('response-open',{sla_response_due_at:before}),
 j('arrival-on-time',{sla_response_due_at:before,arrived_at:'2026-10-15T07:30:00Z'}),
 j('arrival-late',{status:'completed',sla_response_due_at:before,arrived_at:'2026-10-15T08:30:00Z'}),
 j('resolution-open',{sla_resolution_due_at:before}),
 j('resolution-on-time',{status:'completed',sla_resolution_due_at:before,completed_at:'2026-10-15T07:30:00Z'}),
 j('resolution-late',{status:'completed',sla_resolution_due_at:before,completed_at:'2026-10-15T08:30:00Z'}),
 j('near-response',{sla_response_due_at:soon}),
 j('near-resolution',{sla_resolution_due_at:soon}),
 j('future',{sla_response_due_at:future,sla_resolution_due_at:future}),
 j('cancelled',{status:'cancelled',sla_response_due_at:before,sla_resolution_due_at:before}),
 j('completed-no-arrival',{status:'completed',sla_response_due_at:before}),
 j('hold-breach',{status:'on_hold',sla_resolution_due_at:before}),
 j('both-breach',{sla_response_due_at:before,sla_resolution_due_at:before}),
 j('both-near',{sla_response_due_at:soon,sla_resolution_due_at:soon})
]
const report=computeServiceOperations(items,[{id:'a',name:'Engineer A',active:true}],[],{now})
const flags=id=>report.flagsByJob[id]
assert.equal(report.counters.sla_response_breached,3)
assert.equal(report.counters.sla_resolution_breached,4)
assert.equal(report.counters.sla_due_soon,3)
assert.equal(report.slaEscalationCount,6,'Count individual jobs, not two alerts on same job')
assert.equal(flags('not-configured').sla_due_soon,false,'No invented priority-based SLA')
assert.equal(flags('arrival-on-time').sla_response_breached,false,'Actual arrival before SLA due')
assert.equal(flags('arrival-late').sla_response_breached,true,'Late arrival remains measurable after completion')
assert.equal(flags('resolution-on-time').sla_resolution_breached,false,'Actual completion before due')
assert.equal(flags('resolution-late').sla_resolution_breached,true,'Late completion recorded after closure')
assert.equal(flags('completed-no-arrival').sla_response_breached,false,'Do not label missing evidence as proven breach')
assert.equal(flags('cancelled').sla_response_breached,false)
assert.equal(flags('cancelled').sla_resolution_breached,false)
assert.equal(flags('hold-breach').sla_resolution_breached,true,'On hold does not suspend elapsed-clock target')
assert.equal(flags('both-near').sla_due_soon,true,'Near once, not twice for one job')
assert.equal(boardMatches(report.jobs.find(x=>x.id==='response-open'),'sla_response_breached'),true)
assert.equal(report.jobs[0].id,'response-open','Actual SLA breach sorts before ordinary attention')
assert.equal(FIELD_FILTERS.length,12,'SLA filters added without losing original attention filters')
const migration=readFileSync('supabase/migrations/20261015_field_service_sla_policies.sql','utf8')
const page=readFileSync('service-sla-policies.html','utf8')
const client=readFileSync('assets/service-sla-policies.js','utf8')
const form=readFileSync('service-jobs.html','utf8')
const tower=readFileSync('assets/service-operations.js','utf8')
const workflow=readFileSync('.github/workflows/service-pages-integrity.yml','utf8')
const required=[
 ['disabled seed',migration.includes("('low',false,null,null)")&&migration.includes("('urgent',false,null,null)")],
 ['RLS enforced',migration.includes('alter table public.service_sla_policies enable row level security')],
 ['admin policy',migration.includes('private.is_active_admin()')],
 ['anonymous revoked',migration.includes('revoke all on public.service_sla_policies from public,anon,authenticated')],
 ['snapshots trigger once',migration.includes('before insert on public.service_jobs')&&!migration.includes('before update on public.service_jobs')],
 ['explicit bounded duration',migration.includes('between 1 and 525600')],
 ['policy requires configured target',migration.includes('enabled_sla_requires_target')],
 ['target dates recorded on jobs',migration.includes('add column if not exists sla_response_due_at')&&migration.includes('add column if not exists sla_resolution_due_at')],
 ['no existing record backfill',!migration.includes('update public.service_jobs')],
 ['admin settings access',client.includes('requireActiveAdmin(db')],
 ['settings confirmed before update',client.includes("confirm('Save SLA policy")||client.includes("confirm('Save SLA policy for")],
 ['no default targets configured',page.includes('disabled by default')],
 ['deadline edit confirmation',form.includes("Update this service's contractual SLA deadlines?")],
 ['deadline edit only on real change',form.includes('slaResponse!==previousResponse||slaResolution!==previousResolution')],
 ['no unreviewed retroactive updates',!client.includes("update({sla_response_due_at")],
 ['tower displays real deadlines',tower.includes('Arrival SLA')&&tower.includes('Completion SLA')],
 ['tower alerts counted from actual deadlines',tower.includes('board.slaEscalationCount')],
 ['no outward messages',!tower.includes('functions.invoke(')&&!client.includes('functions.invoke(')],
 ['CI regression wired',workflow.includes('node tools/service-sla-contract.mjs')],
 ['staging route verified',readFileSync('tools/uat-isolation.mjs','utf8').includes("'/service-sla-policies'")]
]
for(const [label,condition] of required)assert.ok(condition,label)
for(const name of ['assets/service-operations.js','assets/service-operations-metrics.mjs','assets/service-sla-policies.js']){
 const x=spawnSync(process.execPath,['--check',name],{encoding:'utf8'})
 assert.equal(x.status,0,name+' JS syntax '+x.stderr)
}
const inline=form.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]
assert.ok(inline,'Service Jobs inline module missing')
const syntax=spawnSync(process.execPath,['--check','--input-type=module'],{input:inline,encoding:'utf8'})
assert.equal(syntax.status,0,'Service Jobs syntax: '+syntax.stderr)
console.log(JSON.stringify({ok:true,scenarios:items.length,staticChecks:required.length,
 clientSyntax:true,noAssumedSla:true,noCustomerMessages:true,productionWrites:0}))
