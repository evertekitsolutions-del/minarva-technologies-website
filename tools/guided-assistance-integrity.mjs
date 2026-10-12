import assert from 'node:assert/strict'
import fs from 'node:fs'
const home=fs.readFileSync('index.html','utf8')
const guide=fs.readFileSync('assistant.html','utf8')
const code=fs.readFileSync('assets/service-finder.js','utf8')
for(const marker of ['id="menuToggle"','aria-expanded="false"','aria-controls="mobileNav"','class="skip-to-main"','class="mobile-actions"','href="/assistant"'])assert.ok(home.includes(marker),marker)
for(const marker of ['rule-based guide, not a live AI model','role="status" aria-live="polite"','id="assistLanguage"','id="assistHero"','id="assistIntroduction"'])assert.ok(guide.includes(marker),marker)
for(const service of ['cctv','computer','network','solar','automation','software','web'])assert.ok(code.includes('"value":"'+service+'"'),'Missing '+service)
assert.ok(code.includes('mlKeys'),'Malayalam matching unavailable')
assert.ok(code.includes('findMatches'),'Service ranking missing')
assert.ok(code.includes('option-grid'),'Ambiguity option rendering missing')
assert.ok(code.includes("text.includes(key)"),'Malayalam matching must be explicit')
assert.ok(!code.includes('fetch(')&&!code.includes('supabase'),'Guidance must be browser-only')
console.log(JSON.stringify({ok:true,offlineGuide:true,bilingual:true,noExternalAI:true,mobileActions:true,menuAccessibility:true}))
