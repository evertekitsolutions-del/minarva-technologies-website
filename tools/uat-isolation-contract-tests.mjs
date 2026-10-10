import assert from 'node:assert/strict'
import fs from 'node:fs'
import {validateEnvironment,checkPageIsolation,runIsolationPreflight} from './uat-isolation.mjs'

const stage='https://minarva-uat.example.com'
const backend='https://stageexampleproject123.supabase.co'
const prod='https://kwullzwhlzziosjsejud.supabase.co'
const csp='default-src self; connect-src self '+backend+' wss://stageexampleproject123.supabase.co'
assert.throws(()=>validateEnvironment('https://minarva-technologies-website.vercel.app',backend),/Production frontend/)
assert.throws(()=>validateEnvironment(stage,prod),/Production Supabase/)
assert.throws(()=>validateEnvironment('http://minarva-uat.example.com',backend),/HTTPS/)
assert.throws(()=>checkPageIsolation({route:'/admin',html:'https://kwullzwhlzziosjsejud.supabase.co',backendOrigin:backend,headers:{'content-security-policy':csp}}),/does not match/)
assert.throws(()=>checkPageIsolation({route:'/admin',html:backend,backendOrigin:backend,headers:{'content-security-policy':'connect-src '+backend+' '+prod}}),/production backend remains allowed/)
assert.throws(()=>checkPageIsolation({route:'/admin',html:'no backend configured',backendOrigin:backend,headers:{'content-security-policy':csp}}),/does not match/)
assert.equal(checkPageIsolation({route:'/admin',html:backend,backendOrigin:backend,headers:{'content-security-policy':csp}}).pass,true)

const fake=async url=>{
  const src=url.endsWith('/release-readiness.js')?backend:'<script type="module" src="/release-readiness.js"></script>'+backend
  return {status:200,url,headers:{get:()=>csp},text:async()=>src}
}
const result=await runIsolationPreflight(stage,backend,{routes:['/release-readiness'],fetcher:fake})
assert.equal(result.ok,true)
assert.equal(result.checks[0].moduleCount,1)

// Static route test must actually fetch and validate the extracted JS module;
// a legacy inline-only test cannot prove release readiness works in production.
const smoke=fs.readFileSync('tools/production-route-smoke.mjs','utf8')
assert.match(smoke,/moduleHttp200/)
assert.match(smoke,/moduleGuard/)
assert.match(smoke,/moduleReleaseReadiness/)
assert.match(smoke,/moduleMime/)
assert.match(smoke,/release-readiness\.js/)

const workflow=fs.readFileSync('.github/workflows/isolated-transactional-uat.yml','utf8')
assert.match(workflow,/Verify isolation before handling credentials/)
assert.match(workflow,/vars\.UAT_SUPABASE_URL/)
assert.match(workflow,/UAT_MODE: preflight/)
assert.doesNotMatch(workflow,/UAT_ALLOW_SYNTHETIC_DATA:\s*'true'/)

console.log(JSON.stringify({ok:true,securityTests:10,mode:'read-only isolated preflight'},null,2))
