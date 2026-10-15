import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {buildIsolatedUat} from './build-isolated-uat.mjs'
import {REQUIRED_ROUTES,runIsolationPreflight} from './uat-isolation.mjs'

const temp=mkdtempSync(join(tmpdir(),'minarva-uat-build-'))
const out=join(temp,'public')
const stage='https://isolated123test.supabase.co'
const key='sb_publishable_unit_test_only_abcdefghijklmnopqrstuvwxyz'
const prod='kwullzwhlzziosjsejud.supabase.co'
const files=['index.html','admin.html','assets/enquiry-form.js','release-readiness.js','technician-sw.js']
const prodSnapshot=files.map(f=>readFileSync(f))
try{
  assert.throws(()=>buildIsolatedUat({backendUrl:'https://'+prod,publishableKey:key,outputDir:out}),/Production Supabase/)
  assert.throws(()=>buildIsolatedUat({backendUrl:stage,publishableKey:'sb_secret_fake',outputDir:out}),/publishable key/)
  const report=buildIsolatedUat({backendUrl:stage,publishableKey:key,outputDir:out})
  assert.equal(report.ok,true)
  assert.ok(report.files>=25,'Expected the actual website static pages and assets')
  assert.ok(report.rewritten>=10,'Expected to rewrite all production backend references')
  assert.ok(existsSync(join(out,'assets/site/hero.webp')))
  assert.ok(existsSync(join(out,'assets/service-operations-metrics.mjs')),'Shared field metrics must be present in isolated UAT')
  assert.ok(existsSync(join(out,'service-operations.html')),'Field operations route must be available in isolated UAT')
  assert.ok(existsSync(join(out,'services/cctv-security.html')))
  assert.equal(existsSync(join(out,'supabase')),false,'Never publish Supabase privileged source')
  assert.equal(existsSync(join(out,'.github')),false)
  assert.equal(existsSync(join(out,'sitemap.xml')),false)
  assert.equal(readFileSync(join(out,'robots.txt'),'utf8'),'User-agent: *\nDisallow: /\n')
  const config=JSON.parse(readFileSync(join(out,'vercel.json'),'utf8'))
  const security=config.headers[0].headers
  assert.ok(security.some(h=>h.key==='X-Robots-Tag'&&h.value.includes('noindex')))
  assert.ok(security.some(h=>h.key==='X-UAT-Isolated'&&h.value==='true'))
  const csp=security.find(h=>h.key==='Content-Security-Policy').value
  assert.ok(csp.includes(stage)&&!csp.includes(prod))
  for(const f of files){
    const c=readFileSync(join(out,f),'utf8')
    assert.ok(!c.includes(prod),'Production backend in '+f)
    assert.ok(!c.includes('sb_publishable_qfPTbekhbQy8IcU7qCpvUA_i1sdvMuj'),'Production key in '+f)
    assert.ok(!c.includes('sb_secret_'),'Privileged key in '+f)
  }
  assert.ok(readFileSync(join(out,'assets/enquiry-form.js'),'utf8').includes(key))
  assert.ok(readFileSync(join(out,'technician-sw.js'),'utf8').includes(new URL(stage).hostname),'Service worker must reference the staging backend hostname')

  // Emulate HTTP route delivery from the staged build without accessing any
  // production/staging database, making the existing isolation preflight real.
  const origin='https://isolated-uat.example.com'
  const fetcher=async url=>{
    const path=new URL(url).pathname
    const file=join(out,path==='/'?'index.html':path.slice(1)+(path.split('/').pop().includes('.')?'':'.html'))
    const found=existsSync(file)
    return {status:found?200:404,url,headers:{get:name=>name==='content-security-policy'?csp:''},text:async()=>found?readFileSync(file,'utf8'):''}
  }
  const isolation=await runIsolationPreflight(origin,stage,{routes:REQUIRED_ROUTES,fetcher})
  assert.equal(isolation.checks.length,REQUIRED_ROUTES.length)
  assert.ok(isolation.checks.every(x=>x.pass))
  assert.throws(()=>buildIsolatedUat({backendUrl:stage,publishableKey:key,outputDir:out}),/already exists/)
  for(let i=0;i<files.length;i++)assert.deepEqual(readFileSync(files[i]),prodSnapshot[i],'Production source changed: '+files[i])
  console.log(JSON.stringify({ok:true,staticBuild:true,isolatedRoutes:isolation.checks.length,sourceUnmodified:true,syntheticDbWrites:0,stagingBackendCreated:false}))
}finally{rmSync(temp,{recursive:true,force:true})}
