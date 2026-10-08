import { chromium } from 'playwright'

const base=(process.env.BASE_URL||'').replace(/\/$/,'')
const email=process.env.UAT_ADMIN_EMAIL
const password=process.env.UAT_ADMIN_PASSWORD
const allowSynthetic=process.env.UAT_ALLOW_SYNTHETIC_DATA==='true'
const productionHosts=new Set(['https://minarva-technologies-website.vercel.app'])
if(!base) throw new Error('BASE_URL is required')
if(productionHosts.has(base)) throw new Error('Transactional E2E refuses to run against production')
if(!allowSynthetic) throw new Error('UAT_ALLOW_SYNTHETIC_DATA=true is required for transactional E2E')
if(!email||!password) throw new Error('UAT_ADMIN_EMAIL and UAT_ADMIN_PASSWORD are required')

const runId='UAT-'+new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)
const browser=await chromium.launch()
const page=await browser.newPage({viewport:{width:1440,height:1000}})
const evidence=[]
try{
  await page.goto(base+'/admin',{waitUntil:'networkidle'})
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#loginForm').evaluate(f=>f.requestSubmit())
  await page.waitForSelector('#dashboard',{state:'visible',timeout:15000})
  evidence.push({gate:'admin_auth',pass:true,runId})

  // The harness is intentionally fail-closed until an isolated UAT backend exists.
  // Business mutations are never redirected to production as a fallback.
  const requiredRoutes=['/quotations','/invoices','/service-jobs','/customer-care','/voice-simulator','/calling-readiness']
  for(const route of requiredRoutes){
    const response=await page.goto(base+route,{waitUntil:'networkidle'})
    if(response?.status()!==200) throw new Error('UAT route failed: '+route)
    evidence.push({gate:'route:'+route,pass:true})
  }
  console.log(JSON.stringify({ok:true,runId,mode:'isolated-uat-preflight',evidence},null,2))
}finally{await browser.close()}
