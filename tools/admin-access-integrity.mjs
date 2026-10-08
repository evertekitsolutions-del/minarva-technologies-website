import assert from 'node:assert/strict'
import fs from 'node:fs'

const pages=[
  'quotations.html','invoices.html','service-jobs.html','job-sheet.html',
  'customer-care.html','voice-simulator.html','voice-runtime.html',
  'calling-readiness.html','platform-health.html','release-readiness.html'
]
const results=[]
for(const page of pages){
  const source=fs.readFileSync(page,'utf8')
  const accessImports=(source.match(/import \{ requireActiveAdmin \} from '\/admin-access\.js'/g)||[]).length
  const guardImports=(source.match(/import \{ installAdminSessionGuard \} from '\/admin-session-guard\.js'/g)||[]).length
  const usesHelper=/requireActiveAdmin\(supabase/.test(source)
  const legacyLookup=/\.from\(['"]admin_users['"]\)/.test(source)
  results.push({page,accessImports,guardImports,usesHelper,legacyLookup,
    pass:accessImports===1&&guardImports===1&&usesHelper&&!legacyLookup})
}
console.log(JSON.stringify(results,null,2))
const failed=results.filter(x=>!x.pass)
assert.equal(failed.length,0,'Admin access integrity failed: '+failed.map(x=>x.page).join(', '))
