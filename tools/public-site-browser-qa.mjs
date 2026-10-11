import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const routes=['/','/services/cctv-security','/services/computer-laptop','/services/networking-wifi','/services/solar-inverter','/services/home-automation','/services/custom-software','/services/website-development','/support','/privacy','/terms','/assistant']
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml','.xml':'application/xml','.txt':'text/plain'}
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost')
  const relative=url.pathname==='/'?'index.html':url.pathname.slice(1)
  const filename=path.resolve(process.cwd(),relative+(path.extname(relative)?'':'.html'))
  if(!filename.startsWith(process.cwd()+path.sep)||!fs.existsSync(filename)){res.writeHead(404);res.end('Not found');return}
  const data=fs.readFileSync(filename)
  res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'})
  res.end(data)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const base='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch()
const evidence=[]
try {
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:860}})
    const localErrors=[]
    page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)localErrors.push(r.status()+' '+r.url())})
    for(const route of routes){
      const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:30000})
      assert.equal(response.status(),200,route+' missing')
      assert.ok(await page.locator('h1').count(),route+' heading missing')
      assert.equal(await page.locator('link[rel="canonical"]').count(),1,route+' canonical missing')
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2)
      assert.equal(overflow,false,route+' overflows at '+width)
      const localImageFail=await page.evaluate(async()=>{
        const imgs=[...document.querySelectorAll('img[src^="/assets/"]')]
        await Promise.all(imgs.map(img=>img.decode().catch(()=>{})))
        return imgs.filter(img=>img.naturalWidth===0).map(img=>img.getAttribute('src'))
      })
      assert.deepEqual(localImageFail,[],route+' broken images')
      if(route.startsWith('/services/')||route==='/support'){
        assert.equal(await page.locator('[data-enquiry-form] [name="service"]').count(),1,route+' missing service')
        assert.equal(await page.locator('[data-enquiry-form] input[type="checkbox"][required]').count(),1,route+' missing consent')
        assert.equal(await page.locator('[data-enquiry-form] button[type="submit"]').count(),1,route+' missing form submit')
      }
      if(route.startsWith('/services/')){
        assert.ok(await page.locator('details').count()>0,route+' FAQ missing')
        await page.locator('details summary').first().click()
        assert.equal(await page.locator('details').first().evaluate(el=>el.open),true,route+' FAQ not interactive')
      }
      if(route==='/assistant'){
        await page.locator('#assistService').selectOption('cctv')
        await page.locator('#assistGo').click()
        assert.ok((await page.locator('#assistResult').innerText()).includes('CCTV / Security'),'Finder recommendation missing')
      }
      if(route==='/'&&width===390){
        await page.locator('#menuToggle').click()
        assert.equal(await page.locator('#menuToggle').getAttribute('aria-expanded'),'true')
        await page.keyboard.press('Escape')
        assert.equal(await page.locator('#menuToggle').getAttribute('aria-expanded'),'false')
      }
      evidence.push({route,width,ok:true})
    }
    assert.deepEqual(localErrors,[],'Broken local assets')
    await page.close()
  }
  console.log(JSON.stringify({ok:true,mode:'local-browser-only-no-data-writes',routes:routes.length,viewports:2,cases:evidence.length},null,2))
}finally{
  await browser.close()
  await new Promise(resolve=>server.close(resolve))
}
