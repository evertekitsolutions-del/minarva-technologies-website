import { chromium } from 'playwright'
import { runIsolationPreflight } from './uat-isolation.mjs'
import { createUatPreflightNetworkPolicy, UAT_PREFLIGHT_ROUTES } from './uat-browser-network-policy.mjs'

// Historical filename only: this runner performs READ-ONLY authenticated
// staging preflight, NOT customer/invoice/job transactions or UAT approval.
const base=process.env.BASE_URL||''
const backend=process.env.UAT_SUPABASE_URL||''
const email=process.env.UAT_ADMIN_EMAIL
const password=process.env.UAT_ADMIN_PASSWORD
const mode=process.env.UAT_MODE||''
if(mode!=='preflight')throw Error('Only UAT_MODE=preflight is supported; transactional mutations are not implemented')
if(!base||!backend)throw Error('BASE_URL and UAT_SUPABASE_URL are required')

// Anonymous static dependency preflight MUST finish before loading credentials.
const isolation=await runIsolationPreflight(base,backend)
if(!email||!password)throw Error('Dedicated staging admin credentials are required')
const assess=createUatPreflightNetworkPolicy({baseUrl:base,backendUrl:backend})
const runId='PREFLIGHT-'+Date.now()
const browser=await chromium.launch()
const context=await browser.newContext({
  viewport:{width:1440,height:1000},
  serviceWorkers:'block' // A cached worker must never bypass request interception.
})
const blocked=[]
let phase='login'
const recordBlocked=(reason,method='WEBSOCKET')=>blocked.push({reason,method})
await context.route('**/*',route=>{
  const request=route.request()
  const decision=assess({url:request.url(),method:request.method(),phase})
  if(!decision.allow){
    // Never log credentials, request bodies, URLs or query strings.
    recordBlocked(decision.reason,request.method())
    return route.abort('blockedbyclient')
  }
  return route.continue()
})
// Playwright HTTP routes do not intercept WebSocket frames: disallow sockets
// altogether during this credential-bearing READ-ONLY preflight.
await context.routeWebSocket('**/*',socket=>{
  recordBlocked('websocket_forbidden')
  socket.close()
})
const ensureClean=()=>{
  if(blocked.length)throw Error('Unsafe staging browser request detected: '+JSON.stringify(blocked))
}
const page=await context.newPage()
const evidence=[]
try{
  const loginResponse=await page.goto(new URL('/admin',isolation.baseOrigin).href,{waitUntil:'networkidle'})
  if(loginResponse?.status()!==200)throw Error('Staging admin page did not return HTTP 200')
  ensureClean()
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#loginForm').evaluate(form=>form.requestSubmit())
  await page.waitForSelector('#dashboard',{state:'visible',timeout:15000})
  ensureClean()
  phase='read_only'
  evidence.push({gate:'staging_admin_auth',pass:true,runId})
  for(const route of UAT_PREFLIGHT_ROUTES){
    const response=await page.goto(new URL(route,isolation.baseOrigin).href,{waitUntil:'networkidle'})
    if(response?.status()!==200)throw Error('Staging route failed: '+route)
    ensureClean()
    evidence.push({gate:'staging_route:'+route,pass:true})
  }
  ensureClean()
  console.log(JSON.stringify({
    ok:true,runId,mode:'isolated-authenticated-read-only-preflight',
    stagingBackendVerified:true,blockedRequests:0,protectedRoutes:evidence.length-1,
    transactionsPerformed:0,uatReleaseGatesUpdated:0,evidence
  },null,2))
}finally{
  await context.close()
  await browser.close()
}
