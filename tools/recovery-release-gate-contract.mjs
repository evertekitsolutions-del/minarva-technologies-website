import assert from 'node:assert/strict'
import fs from 'node:fs'
const migration=fs.readFileSync('supabase/migrations/20261012_recovery_gate_database_restore_evidence.sql','utf8')
const checks=[
  ['preserve existing privileged refresh function',migration.includes("pg_get_functiondef('private.platform_refresh_automated_release_checks()'::regprocedure)")],
  ['fail closed on unexpected source drift',migration.includes("raise exception 'Recovery gate function has drifted")],
  ['only count actual database/full restore types',/drill_type in \('database_restore','full_recovery'\)/.test(migration)],
  ['do not count configuration-only rehearsal',!/drill_type in \('configuration_restore'/.test(migration)],
  ['require isolated non-production environment',/lower\(btrim\(environment\)\) in \('non-production','staging','uat','isolated-restore'\)/.test(migration)],
  ['require start and later finish',/completed_at > started_at/.test(migration)],
  ['require restore point',/nullif\(btrim\(coalesce\(recovery_point,''\)\),''\) is not null/.test(migration)],
  ['require evidence reference',/nullif\(btrim\(coalesce\(evidence_reference,''\)\),''\) is not null/.test(migration)],
  ['no evidence means pending not fake pass',/v_new_status text := 'status=case when v_last_recovery is not null then ''pass'' else ''pending'' end'/.test(migration)],
  ['old evidence must clear',/else null end,\s*notes=/.test(migration)],
  ['no new exposed security definer RPC',!/create or replace function public\./i.test(migration)],
  ['explicitly preserve authenticated-only private grant',/grant execute on function private\.platform_refresh_automated_release_checks\(\)[\s\S]*?to authenticated/i.test(migration)],
  ['historical records are never deleted',!/delete\s+from\s+public\.platform_recovery_drills/i.test(migration)]
]
assert.ok(checks.every(([,pass])=>pass),checks.filter(([,pass])=>!pass).map(([name])=>name).join(', '))
console.log(JSON.stringify({ok:true,checks:checks.length,mode:'static-release-gate-contract-no-db-writes'}))
