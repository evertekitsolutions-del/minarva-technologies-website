const base=(process.env.BASE_URL||'https://minarva-technologies-website.vercel.app').replace(/\/$/,'')
const routes=['/','/admin','/quotations','/invoices','/service-jobs','/job-sheet','/customer-care','/voice-simulator','/voice-runtime','/calling-readiness','/platform-health','/release-readiness']
const guarded=new Set(routes.filter(x=>x!=='/'))
let failed=false
for(const route of routes){
  const res=await fetch(base+route,{redirect:'follow'})
  const html=await res.text()
  const checks={
    http200:res.status===200,
    viewport:/<meta[^>]+name=["']viewport["']/i.test(html),
    responsive:/@media\s*\(/i.test(html),
    sessionGuard:!guarded.has(route)||html.includes('installAdminSessionGuard')
  }
  const ok=Object.values(checks).every(Boolean)
  console.log(JSON.stringify({route,status:res.status,ok,checks}))
  if(!ok)failed=true
}
if(failed)process.exit(1)
