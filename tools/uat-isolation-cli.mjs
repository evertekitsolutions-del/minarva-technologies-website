import { runIsolationPreflight } from './uat-isolation.mjs'
const base=process.env.BASE_URL||''
const backend=process.env.UAT_SUPABASE_URL||''
if(!base||!backend)throw Error('Isolated UAT requires BASE_URL and UAT_SUPABASE_URL')
const report=await runIsolationPreflight(base,backend)
console.log(JSON.stringify(report,null,2))
