import assert from 'node:assert/strict'
import fs from 'node:fs'

const pages=['quotations.html','invoices.html','service-jobs.html','job-sheet.html','customer-care.html','voice-simulator.html','voice-runtime.html','calling-readiness.html','platform-health.html']
const results=[]
function inspect(page,source,modulePath=null){
  const accessImports=(source.match(/import \{ requireActiveAdmin \} from '\/admin-access\.js'/g)||[]).length
  const guardImports=(source.match(/import \{ installAdminSessionGuard \} from '\/admin-session-guard\.js'/g)||[]).length
  const usesHelper=/requireActiveAdmin\(supabase/.test(source)
  const legacyLookup=/\.from\(['"]admin_users['"]\)/.test(source)
  const moduleRef=!modulePath||fs.readFileSync(page,'utf8').includes('src="/'+modulePath+'"')
  return {page,modulePath,accessImports,guardImports,usesHelper,legacyLookup,moduleRef,pass:moduleRef&&accessImports===1&&guardImports===1&&usesHelper&&!legacyLookup}
}
for(const page of pages)results.push(inspect(page,fs.readFileSync(page,'utf8')))
results.push(inspect('release-readiness.html',fs.readFileSync('release-readiness.js','utf8'),'release-readiness.js'))
console.log(JSON.stringify(results,null,2))
const failed=results.filter(x=>!x.pass)
assert.equal(failed.length,0,'Admin access integrity failed: '+failed.map(x=>x.page).join(', '))
