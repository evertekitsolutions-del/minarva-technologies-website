import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { chromium } from 'playwright'

// Real browser interactions, isolated from actual Supabase and outside-network traffic.
// The mock records form invocation arguments in browser memory only. No database writes.
const moduleMock = String.raw`export function createClient(){
  return {functions:{invoke:async(name,args)=>{
    window.__fakeInvocations.push({name,body:args.body});
    if(window.__mockFailure)return {error:new Error('Simulated offline failure')};
    return {data:{accepted:true}};
  }}};
}`
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.webp':'image/webp'}
const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://127.0.0.1').pathname
  const rel=p==='/'?'index.html':p.slice(1)
  const file=path.resolve(process.cwd(),rel+(path.extname(rel)?'':'.html'))
  if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('missing');return}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain'})
  res.end(fs.readFileSync(file))
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch()
const page=await browser.newPage()
const errors=[]
page.on('pageerror',err=>errors.push(err.message))
await page.addInitScript(()=>{
  window.__fakeInvocations=[]
  window.__mockFailure=false
  window.open=()=>({location:{href:''}})
})
await page.route('**/*',route=>{
  const u=new URL(route.request().url())
  if(u.hostname==='cdn.jsdelivr.net')return route.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:moduleMock})
  if(u.origin===origin)return route.continue()
  return route.abort('blockedbyclient')
})
const ready=()=>page.waitForFunction(()=>Number(document.querySelector('[name="form_started_at"]')?.value)>0,{timeout:15000})
const count=()=>page.evaluate(()=>window.__fakeInvocations.length)
try{
  await page.goto(origin+'/services/cctv-security',{waitUntil:'domcontentloaded'})
  await ready()
  await page.locator('#name').fill('Browser Test')
  await page.locator('#phone').fill('+91 98765 43210')
  await page.locator('button[type="submit"]').click()
  assert.equal(await count(),0,'Service request without consent must be blocked')
  await page.locator('#phone').fill('---------')
  await page.locator('input[type="checkbox"][required]').check()
  await page.locator('button[type="submit"]').click()
  assert.equal(await count(),0,'Invalid phone must not reach backend')
  assert.match(await page.locator('[role="status"]').innerText(),/valid phone number/i)
  await page.locator('#phone').fill('+91 98765 43210')
  await page.locator('#urgency').selectOption('Urgent')
  await page.locator('#preferred_date').fill('2026-11-15')
  await page.locator('#message').fill('Please assess camera position at my office entrance')
  await page.locator('button[type="submit"]').click()
  await page.waitForFunction(()=>window.__fakeInvocations.length===1)
  const servicePayload=await page.evaluate(()=>window.__fakeInvocations[0])
  assert.equal(servicePayload.name,'public-enquiry-submit')
  assert.equal(servicePayload.body.service,'CCTV & Security Systems')
  assert.equal(servicePayload.body.consent_to_contact,true,'Service consent must reach Edge payload')
  assert.match(servicePayload.body.message,/Priority: Urgent/)
  assert.match(servicePayload.body.message,/Preferred visit date \(request only\): 2026-11-15/)
  assert.ok(servicePayload.body.form_started_at>0)
  assert.match(await page.locator('[role="status"]').innerText(),/Enquiry saved/)
  assert.ok(await page.locator('[data-whatsapp-fallback]').isVisible())

  await page.goto(origin+'/support',{waitUntil:'domcontentloaded'})
  await ready()
  await page.evaluate(()=>window.__mockFailure=true)
  await page.locator('#name').fill('Browser Test')
  await page.locator('#phone').fill('9876543210')
  await page.locator('#message').fill('Recorder not recording')
  await page.locator('input[type="checkbox"][required]').check()
  await page.locator('button[type="submit"]').click()
  await page.waitForFunction(()=>window.__fakeInvocations.length===1)
  const support=await page.evaluate(()=>window.__fakeInvocations[0])
  assert.equal(support.body.service,'Complete Technology Solution')
  assert.equal(support.body.consent_to_contact,true,'Support consent must reach Edge payload')
  assert.match(support.body.message,/Customer support request \(manual review; no customer record lookup\)/)
  assert.match(await page.locator('[role="status"]').innerText(),/could not be saved/)
  assert.ok(await page.locator('[data-whatsapp-fallback]').isVisible())

  await page.goto(origin+'/',{waitUntil:'domcontentloaded'})
  await ready()
  await page.locator('#name').fill('Browser Test')
  await page.locator('#phone').fill('-------')
  await page.locator('#service').selectOption('CCTV & Security Systems')
  await page.locator('#leadSubmit').click()
  assert.equal(await count(),0,'Homepage must block invalid phone')
  await page.locator('#phone').fill('9876543210')
  await page.locator('#leadSubmit').click()
  assert.equal(await count(),0,'Homepage must block submission without contact consent')
  assert.equal(await page.locator('#contactConsent').isChecked(),false)
  await page.locator('#contactConsent').check()
  await page.locator('#leadSubmit').click()
  await page.waitForFunction(()=>window.__fakeInvocations.length===1)
  const home=await page.evaluate(()=>window.__fakeInvocations[0])
  assert.equal(home.name,'public-enquiry-submit')
  assert.equal(home.body.service,'CCTV & Security Systems')
  assert.equal(home.body.consent_to_contact,true,'Homepage consent must reach Edge payload')
  assert.match(await page.locator('#formStatus').innerText(),/Enquiry saved/)
  assert.deepEqual(errors,[],'No unhandled page errors')
  console.log(JSON.stringify({ok:true,mode:'browser-mocked-edge-no-production-writes',tested:['invalid service phone','successful service enquiry','support failure fallback','support message classification','invalid homepage phone','missing homepage consent','successful homepage consented enquiry'],realRecordsCreated:0}))
}finally{
  await browser.close()
  await new Promise(resolve=>server.close(resolve))
}