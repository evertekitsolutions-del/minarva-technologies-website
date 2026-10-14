import assert from 'node:assert/strict'
import fs from 'node:fs'
import {qualifiesDatabaseRecovery,validateRecoveryDrillInput} from '../assets/recovery-drill-qualification.js'
const valid={status:'passed',drill_type:'database_restore',environment:'non-production',
 started_at:'2026-10-12T10:00:00Z',completed_at:'2026-10-12T10:05:00Z',
 recovery_point:'backup-id',evidence_reference:'restore-log'}
for(const [change,expected,label] of [
 [{},true,'valid'],[{drill_type:'full_recovery',environment:'staging'},true,'full recovery'],
 [{drill_type:'configuration_restore'},false,'config-only'],[{drill_type:'storage_restore'},false,'storage'],
 [{environment:'production'},false,'production'],[{environment:'Staging '},true,'normalization'],
 [{status:'planned'},false,'not passed'],[{status:'failed'},false,'failed'],
 [{completed_at:null},false,'missing completion'],[{completed_at:valid.started_at},false,'zero duration'],
 [{completed_at:'2026-10-12T09:00:00Z'},false,'negative duration'],
 [{recovery_point:null},false,'no backup point'],[{evidence_reference:null},false,'no evidence'],
 [{started_at:'invalid'},false,'invalid start']
]) assert.equal(qualifiesDatabaseRecovery({...valid,...change}),expected,label)
assert.equal(validateRecoveryDrillInput(valid).ok,true)
assert.equal(validateRecoveryDrillInput({...valid,drill_type:'configuration_restore',recovery_point:null}).ok,true)
for(const [change,pattern] of [
 [{environment:'production'},/non-production/],
 [{completed_at:valid.started_at},/end time/],
 [{evidence_reference:''},/evidence/],
 [{recovery_point:null},/backup point/]
]) assert.match(validateRecoveryDrillInput({...valid,...change}).reason,pattern)
const sql=fs.readFileSync('supabase/migrations/20261014_platform_health_qualified_recovery.sql','utf8')
for(const token of [
 "drill_type in ('database_restore','full_recovery')",
 "completed_at > started_at","v_last_configuration_recovery",
 "lower(btrim(environment)) in ('non-production','staging','uat','isolated-restore')",
 "pg_get_functiondef('public.platform_health_readiness()'::regprocedure)",
 "Health function has drifted",
 "revoke all on function public.platform_health_readiness() from public,anon,authenticated",
 "grant execute on function public.platform_health_readiness() to authenticated"
])assert.ok(sql.includes(token),'Missing migration control: '+token)
const html=fs.readFileSync('platform-health.html','utf8')
for(const token of [
 "import { qualifiesDatabaseRecovery, validateRecoveryDrillInput } from '/assets/recovery-drill-qualification.js'",
 'id="drillEnvironment"','DB RESTORE PENDING','DB RESTORE RECORDED',
 'r.last_configuration_drill_at','qualifiesDatabaseRecovery(x)',
 'validateRecoveryDrillInput(drill)'
])assert.ok(html.includes(token),'Missing admin UI control: '+token)
assert.doesNotMatch(html,/environment:'non-production'/)
console.log(JSON.stringify({ok:true,qualificationCases:14,formCases:6,staticChecks:15,productionWrites:0}))
