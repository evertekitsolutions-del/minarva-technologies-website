// Fail closed: a non-production frontend URL does not prove backend isolation.
// This preflight performs only anonymous GET requests and never writes business data.
export const PRODUCTION_SUPABASE_HOST='kwullzwhlzziosjsejud.supabase.co'
export const PRODUCTION_SITE_HOSTS=new Set(['minarva-technologies-website.vercel.app'])
export const REQUIRED_ROUTES=['/','/admin','/quotations','/invoices','/service-jobs','/job-sheet','/customer-care','/voice-simulator','/calling-readiness','/release-readiness','/platform-health']
const SUPABASE_ORIGINS=/https:\/\/[a-z0-9-]+\.supabase\.co/gi

export function validateEnvironment(baseUrl,supabaseUrl){
  const base=new URL(baseUrl),supabase=new URL(supabaseUrl)
  if(base.protocol!=='https:'||supabase.protocol!=='https:')throw Error('UAT frontend and backend must use HTTPS')
  if(PRODUCTION_SITE_HOSTS.has(base.hostname)||base.hostname==='minarva-technologies.in')throw Error('Production frontend cannot be used for UAT')
  if(!/^[a-z0-9-]+\.supabase\.co$/i.test(supabase.hostname))throw Error('Expected a dedicated staging Supabase URL')
  if(supabase.hostname===PRODUCTION_SUPABASE_HOST)throw Error('Production Supabase backend is forbidden')
  if(base.origin===supabase.origin)throw Error('Frontend and backend must be distinct origins')
  return {baseOrigin:base.origin,backendOrigin:supabase.origin}
}
export function checkPageIsolation({route,html,headers={},modules={},backendOrigin}){
  const allSources=[html,...Object.values(modules)]
  const declared=[...new Set(allSources.flatMap(s=>[...s.matchAll(SUPABASE_ORIGINS)].map(m=>m[0])))]
  if(declared.length!==1||declared[0]!==backendOrigin)throw Error(route+': frontend Supabase URL does not match isolated backend; found '+JSON.stringify(declared))
  if(allSources.some(s=>s.includes(PRODUCTION_SUPABASE_HOST)))throw Error(route+': production Supabase reference found')
  const csp=headers['content-security-policy']||''
  const connectSrc=(csp.match(/(?:^|;)\s*connect-src\s+([^;]+)/i)||[])[1]||''
  if(!connectSrc.includes(backendOrigin))throw Error(route+': staging backend missing from CSP connect-src')
  if(connectSrc.includes(PRODUCTION_SUPABASE_HOST))throw Error(route+': production backend remains allowed by CSP')
  return {route,backendOrigin,moduleCount:Object.keys(modules).length,pass:true}
}
export async function runIsolationPreflight(baseUrl,supabaseUrl,{routes=REQUIRED_ROUTES,fetcher=fetch}={}){
  const {baseOrigin,backendOrigin}=validateEnvironment(baseUrl,supabaseUrl)
  const checks=[]
  for(const route of routes){
    const response=await fetcher(baseOrigin+route,{redirect:'follow'})
    if(response.status!==200||new URL(response.url).origin!==baseOrigin)throw Error(route+': not a dedicated reachable staging route')
    const html=await response.text()
    const modules={}
    for(const tag of html.match(/<script\b[^>]*type=["']module["'][^>]*>/gi)||[]){
      const src=tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]
      if(!src)continue
      const url=new URL(src,baseOrigin)
      if(url.origin!==baseOrigin)throw Error(route+': unexpected externally hosted module')
      const m=await fetcher(url.href,{redirect:'follow'})
      if(m.status!==200||new URL(m.url).origin!==baseOrigin)throw Error(route+': module fetch failed')
      modules[url.pathname]=await m.text()
    }
    checks.push(checkPageIsolation({route,html,modules,backendOrigin,headers:{'content-security-policy':response.headers.get('content-security-policy')||''}}))
  }
  return {ok:true,mode:'isolated-preflight-only',baseOrigin,backendOrigin,checks}
}
