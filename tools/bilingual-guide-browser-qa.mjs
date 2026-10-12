import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { chromium } from 'playwright'

const root=process.cwd()
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1')
 const suffix=url.pathname==='/'?'index.html':url.pathname.slice(1)
 const file=path.resolve(root,suffix+(path.extname(suffix)?'':'.html'))
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'})
 res.end(fs.readFileSync(file))
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const base='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch()
const checks=[]
try{
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:850}})
    const errors=[],outbound=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/*',route=>{
      if(new URL(route.request().url()).origin!==base){outbound.push(route.request().url());return route.abort('blockedbyclient')}
      return route.continue()
    })
    await page.goto(base+'/assistant',{waitUntil:'domcontentloaded',timeout:20000})
    await page.locator('#assistGo').waitFor()
    const ask=async (language,question)=>{
      await page.locator('#assistLanguage').selectOption(language)
      await page.locator('#assistService').selectOption('')
      await page.locator('#assistQuery').fill(question)
      await page.locator('#assistGo').click()
      return {text:await page.locator('#assistResult').innerText(),links:await page.locator('#assistResult .option a').evaluateAll(els=>els.map(e=>e.getAttribute('href')))}
    }
    assert.deepEqual((await ask('en','Wi-Fi coverage')).links,['/services/networking-wifi'],'Wi-Fi category')
    checks.push({width,case:'english_wifi'})
    assert.deepEqual((await ask('en','camera and wifi')).links.sort(),['/services/cctv-security','/services/networking-wifi'].sort(),'ambiguous camera + network')
    checks.push({width,case:'ambiguity'})
    assert.deepEqual((await ask('ml','എനിക്ക് ക്യാമറ വേണം')).links,['/services/cctv-security'],'Malayalam camera')
    checks.push({width,case:'malayalam_cctv'})
    const ml=await ask('ml','വൈഫൈ കണക്ഷൻ കിട്ടുന്നില്ല')
    assert.deepEqual(ml.links,['/services/networking-wifi'],'Malayalam Wi-Fi')
    assert.match(ml.text,/നെറ്റ്/,'Malayalam result')
    checks.push({width,case:'malayalam_wifi'})
    assert.deepEqual((await ask('en','planning a project')).links,[],'Do not match LAN inside planning')
    checks.push({width,case:'no_false_positive'})
    assert.deepEqual((await ask('en','zzz unrecognized')).links,[],'No fabricated category')
    assert.equal(await page.locator('#assistResult a[href="/support#enquire"]').count(),1,'Human fallback absent')
    checks.push({width,case:'human_handoff'})
    await page.locator('#assistService').selectOption('solar')
    await page.locator('#assistLanguage').selectOption('ml')
    assert.equal(await page.locator('#assistService').inputValue(),'solar','Language switch lost selection')
    assert.deepEqual(await page.locator('#assistResult .option a').evaluateAll(els=>els.map(e=>e.getAttribute('href'))),['/services/solar-inverter'])
    checks.push({width,case:'selected_service_preserved'})
    await page.locator('#assistReset').click()
    assert.equal(await page.locator('#assistQuery').inputValue(),'','Reset left query')
    assert.equal(await page.locator('#assistService').inputValue(),'','Reset left selection')
    checks.push({width,case:'reset'})
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2)
    assert.equal(overflow,false,'Overflow at '+width)
    assert.deepEqual(errors,[],'Browser JS errors at '+width)
    assert.ok(outbound.every(url=>!url.includes('supabase.co')),'Guide contacted production Supabase')
    await page.close()
  }
  console.log(JSON.stringify({ok:true,mode:'local-browser-only',cases:checks.length,widths:[390,1440],realEnquiries:0},null,2))
}finally{
 await browser.close()
 await new Promise(resolve=>server.close(resolve))
}
