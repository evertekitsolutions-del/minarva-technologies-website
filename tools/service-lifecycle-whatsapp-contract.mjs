import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'

const base='supabase/migrations/'
const schema=readFileSync(base+'20261015_service_lifecycle_whatsapp_consent.sql','utf8')
const mobile=readFileSync(base+'20261015_service_technician_notification_consent_guard.sql','utf8')
const ui=readFileSync('service-jobs.html','utf8')
const checks=[
 ['explicit opt-in defaults false',/customer_updates_opt_in boolean not null default false/.test(schema)],
 ['audit opt-in timestamp',/customer_updates_opt_in_at:=now\(\)/.test(schema)],
 ['record consent source',/admin_confirmed_customer_permission/.test(schema)],
 ['records withdrawal',/customer_updates_opt_out_at:=now\(\)/.test(schema)],
 ['opt-out suppresses unsent lifecycle messages',/status in \('pending','ready'\)/.test(schema)],
 ['no live outbound adapters',!/runtime_mode\s*=\s*'live'|provider_adapter_key\s*=\s*'whatsapp_unconfigured'/.test(schema)],
 ['mock adapter deliberately selected',/adapter_key='mock_whatsapp' and runtime_mode='test'/.test(schema)],
 ['language variants registered',/service_registered','whatsapp','ml'/.test(schema)&&/service_registered','whatsapp','en'/.test(schema)],
 ['engineer assignment templates',/service_engineer_assigned','whatsapp','ml'/.test(schema)],
 ['visit scheduling and reschedule templates',/service_visit_scheduled','whatsapp','en'/.test(schema)&&/service_visit_rescheduled','whatsapp','ml'/.test(schema)],
 ['no synthetic service jobs inserted',!/insert into public\.service_jobs[\s(]/i.test(schema)],
 ['new create RPC reuses existing validated create',/v_result:=public\.create_service_job\(/.test(schema)],
 ['new create RPC explicit admin authorization',/if not private\.is_active_admin\(\) then/.test(schema)],
 ['customer consent and job created in same transaction',/update public\.service_jobs set customer_updates_opt_in=true/.test(schema)],
 ['only authenticated create',/grant execute on function public\.create_service_job_with_updates[\s\S]*?to authenticated/.test(schema)],
 ['no direct anon permissions',!/grant execute on function public\.create_service_job_with_updates[\s\S]*?to anon/.test(schema)],
 ['outbox event key unique',/service-lifecycle:/.test(schema)],
 ['customer opt-out respected',/p\.opted_out=true/.test(schema)],
 ['consent required for lifecycle queue',/v_job\.customer_updates_opt_in_at is null then return/.test(schema)],
 ['technician messages consent protected',/new\.status:='suppressed'/.test(mobile)&&/j\.customer_updates_opt_in_at is not null/.test(mobile)],
 ['technician channel opt-out protected',/p\.opted_out=true/.test(mobile)],
 ['UI opt-in clear label','id="customerUpdatesOptIn"'.includes('customerUpdatesOptIn')&&/id="customerUpdatesOptIn" type="checkbox"/.test(ui)],
 ['UI opt-in defaults false',/customerUpdatesOptIn\.checked=false/.test(ui)],
 ['UI creates atomic job and permission',/rpc\('create_service_job_with_updates'/.test(ui)&&/p_customer_updates_opt_in:customerUpdatesOptIn.checked/.test(ui)],
 ['UI preserves opt-in in updates',/customer_updates_opt_in:customerUpdatesOptIn.checked/.test(ui)],
 ['UI displays notification source and status',/id="serviceNotifications"/.test(ui)&&/customer_contact_outbox/.test(ui)],
 ['UI checks customer phone',/Customer phone is required for opted-in WhatsApp updates/.test(ui)],
 ['no hard-coded claim of live WhatsApp',/real WhatsApp sending is OFF|live sending is OFF/i.test(ui)],
 ['template text not labeled approved',!/\bMeta-approved\b/.test(ui)],
 ['migration transaction',/begin;[\s\S]*commit;/.test(schema)&&/begin;[\s\S]*commit;/.test(mobile)]
]
assert.ok(checks.every(([,ok])=>ok),checks.filter(([,ok])=>!ok).map(([name])=>name).join('; '))
const script=ui.match(/<script type="module">([\s\S]*?)<\/script>/i)?.[1]
assert.ok(script,'Service page must have a module script')
const dir=mkdtempSync(join(tmpdir(),'minarva-service-js-'))
try{
  const path=join(dir,'script.mjs')
  writeFileSync(path,script)
  const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'})
  assert.equal(result.status,0,'Service form module syntax: '+result.stderr)
}finally{rmSync(dir,{recursive:true,force:true})}
console.log(JSON.stringify({ok:true,staticChecks:checks.length,serviceFormJsValid:true,productionWrites:0,liveMessagesSent:0}))
