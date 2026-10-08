import assert from 'node:assert/strict'
import fs from 'node:fs'
const html=fs.readFileSync('release-readiness.html','utf8')
const js=fs.readFileSync('release-readiness.js','utf8')
assert.match(html,/<script type="module" src="\/release-readiness\.js"><\/script>/)
assert.doesNotMatch(html,/createClient|platform_release_readiness|platform_update_uat_step/)
assert.match(js,/requireActiveAdmin\(supabase/)
assert.match(js,/platform_release_readiness/)
assert.match(js,/platform_update_uat_step/)
assert.match(js,/platform_update_manual_release_check/)
assert.match(js,/automated calling are separate gates/i)
console.log(JSON.stringify({ok:true,module:'release-readiness.js'},null,2))
