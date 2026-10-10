const base=(process.env.BASE_URL||'https://minarva-technologies-website.vercel.app').replace(/\/$/,'')
const routes=['/','/admin','/quotations','/invoices','/service-jobs','/job-sheet','/customer-care','/voice-simulator','/voice-runtime','/calling-readiness','/platform-health','/release-readiness']
const guarded=new Set(routes.filter(x=>x!=='/'))
let failed=false
for(const route of routes){
  try{
    const res=await fetch(base+route,{redirect:'follow'})
    const html=await res.text()
    const modulePath=route==='/release-readiness'?'/release-readiness.js':null
    const checks={
      http200:res.status===200,
      viewport:/<meta[^>]+name=["']viewport["']/i.test(html),
      responsive:/@media\s*\(/i.test(html),
      sessionGuard:!guarded.has(route)||modulePath!==null||html.includes('installAdminSessionGuard'),
      moduleLink:!modulePath||html.includes('<script type="module" src="'+modulePath+'"></script>')
    }
    if(modulePath&&checks.moduleLink){
      const js=await fetch(base+modulePath,{redirect:'follow'})
      const source=await js.text()
      checks.moduleHttp200=js.status===200
      checks.moduleMime=/javascript|ecmascript/i.test(js.headers.get('content-type')||'')
      checks.moduleGuard=source.includes("installAdminSessionGuard(supabase)")
      checks.moduleAccess=source.includes("requireActiveAdmin(supabase")
      checks.moduleReleaseReadiness=source.includes("platform_release_readiness")
      checks.moduleNoHtmlFallback=!/^\s*<!doctype html/i.test(source)
    }
    const ok=Object.values(checks).every(Boolean)
    console.log(JSON.stringify({route,status:res.status,ok,checks}))
    if(!ok)failed=true
  }catch(e){
    failed=true
    console.log(JSON.stringify({route,ok:false,error:String(e)}))
  }
}
if(failed)process.exit(1)
