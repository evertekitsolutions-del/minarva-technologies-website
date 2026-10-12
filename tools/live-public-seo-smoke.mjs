import assert from 'node:assert/strict'
const origin=(process.env.BASE_URL||'https://www.minarvatechnologies.com').replace(/\/$/,'')
const routes=['/','/services/cctv-security','/services/computer-laptop','/services/networking-wifi','/services/solar-inverter','/services/home-automation','/services/custom-software','/services/website-development','/support','/privacy','/terms','/assistant']
const checked=[]
for(const route of routes){
  const response=await fetch(origin+route,{redirect:'follow',signal:AbortSignal.timeout(20000)})
  assert.equal(response.status,200,route+' returned '+response.status)
  const html=await response.text()
  assert.ok(html.includes('<h1'),route+' missing heading')
  const canonical='https://www.minarvatechnologies.com'+(route==='/'?'/':route)
  assert.ok(html.includes('rel="canonical" href="'+canonical+'"'),route+' missing correct canonical')
  if(route.startsWith('/services/')){
    const m=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)
    assert.ok(m,route+' service JSON-LD missing')
    const schema=JSON.parse(m[1])
    assert.ok(schema['@graph'].some(x=>x['@type']==='BreadcrumbList'),route+' BreadcrumbList missing')
    assert.ok(html.includes('aria-label="Breadcrumb"'))
  }
  checked.push({route,status:response.status})
}
const sitemap=await fetch(origin+'/sitemap.xml',{signal:AbortSignal.timeout(20000)})
assert.equal(sitemap.status,200)
const xml=await sitemap.text()
for(const {route} of checked)assert.ok(xml.includes('https://www.minarvatechnologies.com'+route),'Sitemap missing '+route)
const robots=await fetch(origin+'/robots.txt',{signal:AbortSignal.timeout(20000)})
assert.equal(robots.status,200)
assert.ok((await robots.text()).includes('/sitemap.xml'))
console.log(JSON.stringify({ok:true,mode:'read-only-production-http',routes:checked.length,sitemap:true,robots:true},null,2))
