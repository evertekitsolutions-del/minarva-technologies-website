import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql=fs.readFileSync('supabase/migrations/20261010_platform_release_rpc_privilege_boundary.sql','utf8')
const checks=[
 ['untrusted advisor-certification endpoint removed',/drop function public\.platform_verify_leaked_password_gate\(boolean,text\)/i.test(sql)],
 ['external gate cannot be self-passed or waived',/p_check_key='security_leaked_passwords'[\s\S]*p_status in \('pass','waived','not_applicable'\)/i.test(sql)],
 ['public updater security invoker',/create or replace function public\.platform_update_manual_release_check\([\s\S]*?\) returns jsonb language sql security invoker/i.test(sql)],
 ['public UAT updater security invoker',/create or replace function public\.platform_update_uat_step\([\s\S]*?\) returns jsonb language sql security invoker/i.test(sql)],
 ['public UAT run factory security invoker',/create or replace function public\.platform_create_uat_run\([\s\S]*?\) returns uuid language sql security invoker/i.test(sql)],
 ['public auto-refresh security invoker',/public\.platform_refresh_automated_release_checks\(\)[\s\S]*?returns jsonb language sql security invoker/i.test(sql)],
 ['private workers enforce active admin',/create or replace function private\.platform_update_manual_release_check[\s\S]*private\.is_active_admin\(\)/i.test(sql)],
 ['freeze checks blocking gate status',/blocking=true and check_key<>'release_freeze' and status<>'pass'/i.test(sql)],
 ['UAT direct table writes removed',/revoke insert,update,delete,truncate,references,trigger[\s\S]*platform_uat_runs,public\.platform_uat_steps from authenticated/i.test(sql)],
 ['UAT read policies active admin only',/create policy "active_admin_read_platform_uat_steps"[\s\S]*private\.is_active_admin\(\)/i.test(sql)],
 ['workers not open to anon or public',/revoke all on function private\.platform_create_uat_run[\s\S]*from public,anon,authenticated/i.test(sql)]
]
const failed=checks.filter(([,pass])=>!pass)
console.log(JSON.stringify({ok:failed.length===0,checks:checks.map(([name,pass])=>({name,pass}))},null,2))
assert.equal(failed.length,0,failed.map(x=>x[0]).join(', '))
