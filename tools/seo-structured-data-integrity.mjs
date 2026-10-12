import fs from 'node:fs'
import assert from 'node:assert/strict'
const base='https://www.minarvatechnologies.com'
const servicePaths=['cctv-security','computer-laptop','networking-wifi','solar-inverter','home-automation','custom-software','website-development']
const orgHtml=fs.readFileSync('index.html','utf8')
const headSchema=orgHtml.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)
assert.ok(headSchema,'Homepage Organization schema missing')
const org=JSON.parse(headSchema[1])
assert.equal(org['@type'],'Organization')
assert.equal(org.url,base+'/')
assert.equal(org.telephone,'+916235353732')
assert.equal(org.email,'minarvatechnologies@gmail.com')
assert.equal(org.areaServed.name,'Thiruvananthapuram')
assert.equal(org.aggregateRating,undefined,'No invented reviews or scores')
const sitemap=fs.readFileSync('sitemap.xml','utf8')
for(const slug of servicePaths){
  const page=fs.readFileSync('services/'+slug+'.html','utf8')
  const found=page.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)
  assert.ok(found,slug+' JSON-LD missing')
  const schema=JSON.parse(found[1])
  assert.equal(schema['@context'],'https://schema.org')
  const service=schema['@graph'].find(x=>x['@type']==='Service')
  const breadcrumb=schema['@graph'].find(x=>x['@type']==='BreadcrumbList')
  assert.ok(service&&breadcrumb,slug+' missing schema components')
  assert.equal(breadcrumb.itemListElement.length,3)
  assert.equal(breadcrumb.itemListElement[2].item,base+'/services/'+slug)
  assert.equal(breadcrumb.itemListElement[2].name,service.name)
  assert.ok(page.includes('aria-label="Breadcrumb"'))
  assert.ok(page.includes('aria-current="page"'))
  assert.ok(sitemap.includes(base+'/services/'+slug))
  assert.ok(!page.includes('"aggregateRating"'),'No fabricated review scores')
}
assert.ok(!sitemap.includes('/admin'))
console.log(JSON.stringify({ok:true,organization:true,servicePages:servicePaths.length,breadcrumbs:servicePaths.length,noFakeReviews:true}))
