import { chromium } from 'playwright'
const base=(process.env.BASE_URL||'https://minarva-technologies-website.vercel.app').replace(/\/$/,'')
const browser=await chromium.launch()
const cases=[['/',1440,900],['/',390,844],['/admin',1440,900],['/admin',390,844]]
const evidence=[]
try{
 for(const [route,width,height] of cases){
  const page=await browser.newPage({viewport:{width,height}})
  const pageErrors=[],consoleErrors=[]
  page.on('pageerror',e=>pageErrors.push(String(e)))
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())})
  const response=await page.goto(base+route,{waitUntil:'networkidle',timeout:30000})
  await page.waitForTimeout(1500)
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2)
  if(response?.status()!==200)throw new Error(route+' returned '+response?.status())
  if(pageErrors.length)throw new Error(route+' pageerror: '+pageErrors.join(' | '))
  if(overflow)throw new Error(route+' horizontal overflow at '+width)
  if(route==='/admin'){
    const form=page.locator('#loginForm')
    if(!(await form.isVisible()))throw new Error('Anonymous admin login form not visible')
    if(!page.url().includes('/admin'))throw new Error('Admin anonymous redirect loop detected')
  }
  evidence.push({route,width,height,status:response.status(),overflow,pageErrors,consoleErrors})
  await page.close()
 }
 console.log(JSON.stringify({ok:true,base,evidence},null,2))
}finally{await browser.close()}
