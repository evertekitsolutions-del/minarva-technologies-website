import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration=fs.readFileSync('supabase/migrations/20261008_platform_release_control_integrity.sql','utf8')
const uat=fs.readFileSync('supabase/migrations/20261007_platform_uat_evidence_hardening.sql','utf8')
const guard=fs.readFileSync('admin-session-guard.js','utf8')
const access=fs.readFileSync('admin-access.js','utf8')

const checks=[
 ['direct checklist writes revoked',/revoke insert, update, delete, truncate, references, trigger[\s\S]*platform_release_checklist from authenticated/i.test(migration)],
 ['checklist RLS is read-only',/for select to authenticated/i.test(migration)&&!/for all to authenticated/i.test(migration)],
 ['manual RPC requires active admin',/platform_update_manual_release_check[\s\S]*private\.is_active_admin\(\)/i.test(migration)],
 ['automated checks reject manual mutation',/Automated release checks cannot be manually changed/i.test(migration)],
 ['UAT and responsive bypass blocked',/UAT and responsive gates must be updated through evidence-backed UAT steps/i.test(migration)],
 ['pass or waiver requires evidence',/Passing or waiving a release check requires evidence/i.test(migration)],
 ['leaked-password pass cannot self certify',/Leaked-password protection PASS must come from verified Auth\/Security Advisor evidence/i.test(migration)],
 ['release freeze checks every other blocker',/check_key<>'release_freeze' and status<>'pass'/i.test(migration)],
 ['UAT pass requires evidence',/Passing a UAT step requires real evidence/i.test(uat)],
 ['anonymous manual RPC denied',/revoke all on function public\.platform_update_manual_release_check[\s\S]*public,anon,authenticated/i.test(migration)],
 ['session guard validates server user',/supabase\.auth\.getUser\(\)/.test(guard)],
 ['central access validates active admin',/admin\.active!==true/.test(access)]
]
const failed=checks.filter(([,pass])=>!pass)
console.log(JSON.stringify({ok:failed.length===0,checks:checks.map(([name,pass])=>({name,pass}))},null,2))
assert.equal(failed.length,0,failed.map(x=>x[0]).join(', '))