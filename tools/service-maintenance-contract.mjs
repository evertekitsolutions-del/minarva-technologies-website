import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {addCalendarMonths,maintenancePreview} from '../assets/maintenance-calendar.mjs'
const read=p=>readFileSync(p,'utf8')
const schema=read('supabase/migrations/20261015_service_maintenance_schema.sql')
const cron=read('supabase/migrations/20261015_service_maintenance_scheduler.sql')
const job=read('supabase/migrations/20261015_service_maintenance_job_link.sql')
const refresh=read('supabase/migrations/20261015_maintenance_admin_refresh.sql')
const page=read('assets/service-maintenance.js')
const checks=[
 ['private contracts',schema.includes('service_maintenance_contracts enable row level security')],
 ['private visits',schema.includes('service_maintenance_visits enable row level security')],
 ['anon revoked',schema.includes('from public,anon,authenticated')],
 ['admin role required',schema.includes('private.is_active_admin()')],
 ['defaults inactive',schema.includes('active boolean not null default false')],
 ['warranty has no visits',schema.includes("contract_type='warranty' and maintenance_interval_months is null")],
 ['intervals restricted',schema.includes('maintenance_interval_months in (1,2,3,4,6,12)')],
 ['customer link',schema.includes('references public.customers(id)')],
 ['engineer link',schema.includes('references public.technicians(id)')],
 ['visits unique',schema.includes('unique(contract_id,due_on)')],
 ['jobs unique',schema.includes('service_job_id uuid unique')],
 ['no direct visit writes',!schema.includes('grant update on public.service_maintenance_visits')],
 ['activation timestamp',cron.includes('new.activated_at:=now()')],
 ['contract scope immutable',cron.includes('new.customer_id is distinct from old.customer_id')],
 ['only active planned',cron.includes('c.active=true')],
 ['activation cutover',cron.includes('greatest(starts_on,activated_at::date,p_as_of)')],
 ['horizon 45 days',cron.includes('p_as_of+45')],
 ['idempotent planner',cron.includes('on conflict(contract_id,due_on) do nothing')],
 ['existing cron',cron.includes("cron.schedule('minarva-maintenance-visits-daily'")],
 ['admin refresh',refresh.includes('private.is_active_admin()')],
 ['locked job conversion',job.includes('where id=p_visit_id for update')],
 ['reuse service job',job.includes('public.create_service_job(')],
 ['job idempotence',job.includes('already_created')],
 ['skip guarded',job.includes('Skipped visits cannot create service jobs')],
 ['skip reason',job.includes('between 5 and 500')],
 ['active admin before RPC',page.includes('requireActiveAdmin(db')],
 ['explicit activation',page.includes('if(!confirm(prompt))return')],
 ['explicit job creation',page.includes("if(!confirm('Create one Service Job")],
 ['no calls',!page.includes('functions.invoke(')],
 ['staging route',read('tools/uat-isolation.mjs').includes("'/service-maintenance'")],
 ['CI script',read('tools/service-pages-integrity.mjs').includes("await import('./service-maintenance-contract.mjs')")]
]
for(const [label,valid] of checks)assert.ok(valid,label)
assert.equal(addCalendarMonths('2026-01-31',1),'2026-02-28')
assert.equal(addCalendarMonths('2026-01-31',2),'2026-03-31')
assert.equal(addCalendarMonths('2028-01-31',1),'2028-02-29')
assert.deepEqual(maintenancePreview({
 startsOn:'2026-01-01',endsOn:'2026-12-31',firstVisitOn:'2026-01-31',
 intervalMonths:1,asOf:'2026-01-15'
}),['2026-01-31','2026-02-28'])
assert.deepEqual(maintenancePreview({
 startsOn:'2026-01-01',endsOn:'2026-12-31',firstVisitOn:'2026-01-31',
 intervalMonths:1,asOf:'2026-01-15',activeOn:'2026-02-01'
}),['2026-02-28'])
for(const file of ['assets/maintenance-calendar.mjs','assets/service-maintenance.js']){
 const z=spawnSync(process.execPath,['--check',file],{encoding:'utf8'})
 assert.equal(z.status,0,z.stderr)
}
console.log(JSON.stringify({ok:true,securityChecks:checks.length,calendarScenarios:5,noExternalCalls:true}))
