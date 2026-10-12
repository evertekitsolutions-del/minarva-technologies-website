import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { chromium } from 'playwright'

const routes=['/','/services/cctv-security','/services/computer-laptop','/services/networking-wifi','/services/solar-inverter','/services/home-automation','/services/custom-software','/services/website-development','/support','/privacy','/terms','/assistant']
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml'}
const root=process.cwd()
const server=http.createServer((req,res)=>{
  const relative=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html'
  const file=path.resolve(root,relative+(path.extname(relative)?'':'.html'))
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('Not found');return}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'})
  res.end(fs.readFileSync(file))
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const base='http://127.0.0.1:'+server.address().port
const axe=fs.readFileSync('node_modules/axe-core/axe.min.js','utf8')
const browser=await chromium.launch()
const failures=[],summaries=[]
try{
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:860}})
    await page.route('**/*',route=>{
      if(new URL(route.request().url()).origin!==base)return route.abort()
      return route.continue()
    })
    for(const route of routes){
      const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:25000})
      assert.equal(response.status(),200,route+' failed to load')
      await page.addScriptTag({content:axe})
      const report=await page.evaluate(async()=>globalThis.axe.run(document,{
        runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},
        resultTypes:['violations']
      }))
      const violations=report.violations.map(v=>({
        id:v.id,impact:v.impact,help:v.help,
        nodes:v.nodes.slice(0,4).map(n=>({target:n.target,summary:n.failureSummary?.slice(0,350)})),
        count:v.nodes.length
      }))
      summaries.push({route,width,violations:violations.length})
      if(violations.length)failures.push({route,width,violations})
      console.log(JSON.stringify({route,width,violations}))
    }
    await page.close()
  }
  console.log(JSON.stringify({ok:failures.length===0,checked:summaries.length,failedViews:failures.length,failures},null,2))
  assert.equal(failures.length,0,'WCAG 2.1 A/AA violations detected in '+failures.length+' viewports')
}finally{
  await browser.close()
  await new Promise(resolve=>server.close(resolve))
}
