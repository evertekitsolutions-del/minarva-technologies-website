import assert from 'node:assert/strict'
import {runIsolationPreflight,checkPageIsolation} from './uat-isolation.mjs'

const origin='https://minarva-uat.example.com'
const backend='https://stageexampleproject123.supabase.co'
const prod='https://kwullzwhlzziosjsejud.supabase.co'
const csp="default-src 'self'; connect-src 'self' "+backend+' wss://stageexampleproject123.supabase.co'
const goodHtml='<script type="module" src="/entry.js"></script>'
const goodFiles={
 '/':goodHtml,
 '/entry.js':"import {value} from './dependency.js'; const api='"+backend+"';",
 '/dependency.js':"export {value} from './leaf.js'",
 '/leaf.js':"export const value='"+backend+"'",
 '/technician':'<script type="module">import "/entry.js"; const api="'+backend+'"</script>',
 '/technician-sw.js':'const stagingBackend="'+backend+'"'
}
const fetcher=(files,headers=csp,overrides={})=>async url=>{
 const path=new URL(url).pathname
 const body=files[path]
 const status=body===undefined?404:200
 return {status,url:overrides[path]||url,headers:{get:key=>key.toLowerCase()==='content-security-policy'?headers:''},text:async()=>body||''}
}
const run=(files,routes=['/'],headers=csp,redirects={})=>
 runIsolationPreflight(origin,backend,{routes,fetcher:fetcher(files,headers,redirects)})
const report=await run(goodFiles)
assert.equal(report.ok,true)
assert.equal(report.checks[0].moduleCount,3,'Must traverse script → imported module → re-export')
assert.equal(report.mode,'isolated-static-dependency-preflight-only')
const withSw=await run(goodFiles,['/technician'])
assert.equal(withSw.ok,true)
assert.equal(withSw.checks[0].moduleCount,4,'Check inline import closure and PWA service worker')

const denied=[
 ['nested module points to production',{...goodFiles,'/leaf.js':"export const value='"+prod+"'"},['/'],csp,{},/does not match isolated backend|production Supabase/],
 ['external script src',{'/':'<script src="https://attacker.invalid/script.js"></script>'+backend},['/'],csp,{},/non-staging origin/],
 ['external ES module import',{...goodFiles,'/entry.js':"import 'https://attacker.invalid/code.js';"+backend},['/'],csp,{},/non-staging origin/],
 ['inline import loads production',{...goodFiles,'/':'<script type="module">import "/evil.js";const api="'+backend+'"</script>','/evil.js':"const forbidden='"+prod+"'"},['/'],csp,{},/does not match isolated backend|production Supabase/],
 ['relative imported script points outside stage',{...goodFiles,'/leaf.js':"export {value} from 'https://minarvatechnologies.com/client.js';"+backend},['/'],csp,{},/non-staging origin/],
 ['missing transitive module',{...goodFiles,'/dependency.js':"export {value} from './missing.js'"},['/'],csp,{},/fetch or redirect failed/],
 ['same-origin URL redirects externally',goodFiles,['/'],csp,{'/dependency.js':'https://attacker.invalid/code.js'},/fetch or redirect failed/],
 ['production service worker',{...goodFiles,'/technician-sw.js':'const backend="'+prod+'"'},['/technician'],csp,{},/does not match isolated backend|production Supabase/],
 ['CSP wildcard',goodFiles,['/'],"connect-src 'self' * "+backend,{},/wildcard CSP/],
 ['CSP impostor token',goodFiles,['/'],"connect-src 'self' "+backend+'-attacker',{},/exact CSP/],
 ['CSP still permits production',goodFiles,['/'],"connect-src 'self' "+backend+' '+prod,{},/production backend remains allowed/],
 ['CSP wildcard subdomain',goodFiles,['/'],"connect-src 'self' "+backend+' https://*.supabase.co',{},/wildcard CSP/],
 ['unapproved bare import',{...goodFiles,'/entry.js':"import './dependency.js'; import '@unsafe/package'; const api='"+backend+"'"},['/'],csp,{},/unsupported external\/bare/],
]
for(const [name,files,routes,headers,redirects,pattern] of denied)
 await assert.rejects(()=>run(files,routes,headers,redirects),pattern,name)

assert.equal(checkPageIsolation({route:'/',html:backend,backendOrigin:backend,headers:{'content-security-policy':csp}}).pass,true)
console.log(JSON.stringify({ok:true,positiveDependencyTests:2,negativeIsolationTests:denied.length,sourceWrites:0,backendWrites:0}))
