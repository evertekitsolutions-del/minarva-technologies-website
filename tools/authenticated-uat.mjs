import { chromium } from 'playwright'
const base=(process.env.BASE_URL||'https://minarva-technologies-website.vercel.app').replace(/\/$/,'')
const email=process.env.UAT_ADMIN_EMAIL
const password=process.env.UAT_ADMIN_PASSWORD
if(!email||!password) throw new Error('UAT_ADMIN_EMAIL and UAT_ADMIN_PASSWORD are required')
const browser=await chromium.launch()
const page=await browser.newPage({viewport:{width:390,height:844}})
const evidence=[]
try{
  await page.goto(base+'/admin',{waitUntil:'networkidle'})
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await Promise.all([page.locator('#loginForm').evaluate(f=>f.requestSubmit()),page.waitForTimeout(1500)])
  await page.waitForSelector('#dashboard',{state:'visible',timeout:15000})
  evidence.push({gate:'admin_auth',pass:true})
  const routes=[
    ['/quotations','Quotation'],
    ['/invoices','Invoice'],
    ['/service-jobs','Service'],
    ['/customer-care','Customer Care'],
    ['/voice-simulator','Voice'],
    ['/calling-readiness','Calling'],
    ['/platform-health','Platform'],
    ['/release-readiness','Release']
  ]
  for(const [route,label] of routes){
    const res=await page.goto(base+route,{waitUntil:'networkidle'})
    const body=await page.locator('body').innerText()
    const pass=res?.status()===200 && body.length>40
    evidence.push({gate:'route:'+route,pass,status:res?.status(),label})
    if(!pass) throw new Error('Authenticated route failed: '+route)
  }
  await page.goto(base+'/admin',{waitUntil:'networkidle'})
  await page.waitForSelector('#dashboard',{state:'visible'})
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2)
  evidence.push({gate:'mobile_390x844_no_page_overflow',pass:overflow})
  if(!overflow) throw new Error('Mobile viewport has horizontal page overflow')
  console.log(JSON.stringify({ok:true,base,evidence},null,2))
}finally{await browser.close()}
