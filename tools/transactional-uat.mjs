import { chromium } from 'playwright'
import { runIsolationPreflight,PRODUCTION_SUPABASE_HOST } from './uat-isolation.mjs'

// Despite the historical filename, this is a READ-ONLY protected-route preflight.
// It does NOT execute transactional customer/invoice/service/voice tests or mark UAT PASS.
const base=process.env.BASE_URL||''
const backend=process.env.UAT_SUPABASE_URL||''
const email=process.env.UAT_ADMIN_EMAIL
const password=process.env.UAT_ADMIN_PASSWORD
const mode=process.env.UAT_MODE||''
if(mode!=='preflight')throw Error('Only UAT_MODE=preflight is supported; transactional mutations are not implemented')
if(!base||!backend)throw Error('BASE_URL and UAT_SUPABASE_URL are required')
const isolation=await runIsolationPreflight(base,backend)
if(!email||!password)throw Error('Dedicated staging admin credentials are required')
const runId='PREFLIGHT-'+Date.now()
const browser=await chromium.launch()
const context=await browser.newContext({viewport:{width:1440,height:1000}})
const expectedBackend=new URL(backend).hostname
const blocked=[]
await context.route('**/*',route=>{
  const url=new URL(route.request().url())
  if(url.hostname===PRODUCTION_SUPABASE_HOST||
     (url.hostname.endsWith('.supabase.co')&&url.hostname!==expectedBackend)){
    blocked.push({host:url.hostname,path:url.pathname})
    return route.abort('blockedbyclient')
  }
  return route.continue()
})
const page=await context.newPage()
const evidence=[]
try{
  await page.goto(new URL('/admin',isolation.baseOrigin).href,{waitUntil:'networkidle'})
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#loginForm').evaluate(form=>form.requestSubmit())
  await page.waitForSelector('#dashboard',{state:'visible',timeout:15000})
  evidence.push({gate:'staging_admin_auth',pass:true,runId})
  const routes=['/quotations','/invoices','/service-jobs','/customer-care','/voice-simulator','/calling-readiness']
  for(const route of routes){
    const response=await page.goto(new URL(route,isolation.baseOrigin).href,{waitUntil:'networkidle'})
    if(response?.status()!==200)throw Error('Staging route failed: '+route)
    if(blocked.length)throw Error('Blocked unsafe backend request on '+route)
    evidence.push({gate:'staging_route:'+route,pass:true})
  }
  if(blocked.length)throw Error('Unsafe backend request attempted')
  console.log(JSON.stringify({ok:true,runId,mode:'isolated-uat-preflight-only',isolation,blockedRequests:blocked.length,evidence},null,2))
}finally{await browser.close()}
