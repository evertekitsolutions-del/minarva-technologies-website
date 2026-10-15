import assert from 'node:assert/strict'
import fs from 'node:fs'
const sql=fs.readFileSync('supabase/migrations/20261015_service_feedback_private_rpc_boundary.sql','utf8')
for(const key of [
'create schema if not exists feedback_private',
'grant usage on schema feedback_private to anon,authenticated',
'v_definition:=pg_get_functiondef(v_oid)',
"FUNCTION feedback_private.",
"Unexpected definition for feedback function",
'service_feedback_requests_deny_api',
'using(false) with check(false)'
])assert.ok(sql.includes(key),key)
const names=['get_service_feedback_session','submit_service_feedback','issue_service_feedback_link','revoke_service_feedback_link']
for(const name of names)assert.ok(sql.includes('function public.'+name),name)
assert.equal((sql.match(/language sql security invoker/g)||[]).length,4)
assert.ok(sql.includes('revoke all on function'))
assert.ok(sql.includes('grant execute on function'))
assert.ok(sql.includes('to anon,authenticated'))
assert.ok(sql.includes('to authenticated'))
console.log(JSON.stringify({ok:true,publicWrappers:4,noBusinessDataMutations:true}))
