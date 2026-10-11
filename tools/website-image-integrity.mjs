import assert from 'node:assert/strict'
import fs from 'node:fs'

const html=fs.readFileSync('index.html','utf8')
const names=['hero','cctv','it','solar','automation','software']
for(const name of names){
  const file='assets/site/'+name+'.webp'
  assert.ok(fs.existsSync(file), 'Missing '+file)
  const b=fs.readFileSync(file)
  assert.equal(b.toString('ascii',0,4),'RIFF',file+' missing RIFF header')
  assert.equal(b.toString('ascii',8,12),'WEBP',file+' not WebP')
  assert.ok(b.length<200_000,file+' should be optimized under 200KB')
  assert.ok(html.includes('/'+file),file+' unused in website')
}
assert.equal((html.match(/class="card-photo"/g)||[]).length,8,'Every service needs a representative photo')
assert.equal((html.match(/class="soft-photo"/g)||[]).length,2,'Software and websites need photography')
assert.ok(html.includes('class="hero-photo"'),'Hero photographic composition missing')
assert.ok(!html.includes('class="control"'),'Remove fictitious systems-online hero widget')
assert.ok(!/74988c6a-4636-4934-8d62-35c1e96e713c|61ba4707-e3d4-47ba-8644-8e0045112240|449b00ff-d315-4bd5-b8ed-17e7f9afc4aa/.test(html),'Old advertisement still referenced')
assert.equal((html.match(/d2ol7oe51mr4n9.cloudfront.net/g)||[]).length,2,'Official logo must remain unchanged; no other CloudFront ads')
assert.ok(/<img[^>]+fetchpriority="high"/.test(html),'Hero image not prioritized')
console.log(JSON.stringify({ok:true,optimizedImages:names.length,serviceImages:8,softwareImages:2,oldAdsRemoved:true,logoPreserved:true}))
