// Fail closed: a preview frontend alone does not prove backend isolation.
// This preflight only sends unauthenticated GET requests. It never creates
// customers, invoices, payments, recovery evidence, or phone calls.
export const PRODUCTION_SUPABASE_HOST='kwullzwhlzziosjsejud.supabase.co'
export const PRODUCTION_SITE_HOSTS=new Set(['minarva-technologies-website.vercel.app','minarvatechnologies.com','www.minarvatechnologies.com','minarva-technologies-website-minarva-biz.vercel.app','minarva-technologies-website-git-main-minarva-biz.vercel.app'])
export const REQUIRED_ROUTES=['/','/admin','/quotations','/invoices','/service-jobs','/job-sheet','/technician','/customer-care','/voice-simulator','/voice-runtime','/calling-readiness','/release-readiness','/platform-health','/support']
const SUPABASE_ORIGINS=/https:\/\/[a-z0-9-]+\.supabase\.co/gi
const SCRIPT_TAG=/<script\b[^>]*>/gi
const MODULE_CONTENT=/<script\b[^>]*\btype=["']module["'][^>]*>([\s\S]*?)<\/script>/gi
const LOCAL_IMPORT=/\b(?:import|export)\s+(?:[^'"\n]*?\s+from\s*)?['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT=/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const APPROVED_IMPORT_CDN='cdn.jsdelivr.net'

// Only javascript import paths are looked up recursively; third-party imports
// are intentionally restricted to the existing pinned Supabase CDN.
function importSpecifiers(source){
  return [...new Set([
    ...[...source.matchAll(LOCAL_IMPORT)].map(match=>match[1]),
    ...[...source.matchAll(DYNAMIC_IMPORT)].map(match=>match[1])
  ])]
}
function scriptSources(html){
  return [...html.matchAll(SCRIPT_TAG)].flatMap(match=>{
    const attr=match[0].match(/\bsrc\s*=\s*(['"])(.*?)\1/i)
    return attr?[attr[2]]:[]
  })
}
function inlineModuleSources(html){
  return [...html.matchAll(MODULE_CONTENT)].map(match=>match[1])
}
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
  const tokens=connectSrc.trim().split(/\s+/).filter(Boolean)
  if(!tokens.includes(backendOrigin))throw Error(route+': staging backend missing as exact CSP connect-src origin')
  if(tokens.some(token=>token.includes(PRODUCTION_SUPABASE_HOST)))throw Error(route+': production backend remains allowed by CSP')
  if(tokens.some(token=>token==='*'||token==='https:'||token==='wss:'||token.includes('*.supabase.co')))throw Error(route+': wildcard CSP connect-src defeats backend isolation')
  return {route,backendOrigin,moduleCount:Object.keys(modules).length,pass:true}
}
export async function runIsolationPreflight(baseUrl,supabaseUrl,{routes=REQUIRED_ROUTES,fetcher=fetch}={}){
  const {baseOrigin,backendOrigin}=validateEnvironment(baseUrl,supabaseUrl)
  const checks=[]
  const scriptCache=new Map()
  for(const route of routes){
    const response=await fetcher(baseOrigin+route,{redirect:'follow'})
    if(response.status!==200||new URL(response.url).origin!==baseOrigin)throw Error(route+': not a dedicated reachable staging route')
    const html=await response.text()
    const modules={}
    async function checkImport(specifier,parentUrl){
      if(!specifier)throw Error(route+': empty script import')
      if(specifier.startsWith('https://')){
        const url=new URL(specifier)
        if(url.hostname===APPROVED_IMPORT_CDN)return
      }
      if(!(specifier.startsWith('/')||specifier.startsWith('./')||specifier.startsWith('../')||specifier.startsWith('https://')))
        throw Error(route+': unsupported external/bare module import '+specifier)
      await checkLocalScript(specifier,parentUrl)
    }
    async function checkLocalScript(specifier,parentUrl){
      const url=new URL(specifier,parentUrl)
      if(url.protocol!=='https:'||url.origin!==baseOrigin)
        throw Error(route+': script loads a non-staging origin: '+url.origin)
      if(!/\.(?:m?js)$/i.test(url.pathname))throw Error(route+': unexpected local script extension: '+url.pathname)
      if(Object.hasOwn(modules,url.pathname))return
      let body=scriptCache.get(url.href)
      if(body===undefined){
        const response=await fetcher(url.href,{redirect:'follow'})
        if(response.status!==200||new URL(response.url).origin!==baseOrigin)
          throw Error(route+': local script fetch or redirect failed '+url.pathname)
        body=await response.text()
        scriptCache.set(url.href,body)
      }
      modules[url.pathname]=body
      // Static local module re-exports, imports and literal dynamic imports are
      // transitive dependencies, not just the first <script type=module> src.
      for(const imported of importSpecifiers(body))
        await checkImport(imported,url.href)
    }
    for(const script of scriptSources(html))
      await checkLocalScript(script,baseOrigin+route)
    for(const inline of inlineModuleSources(html))
      for(const imported of importSpecifiers(inline))
        await checkImport(imported,baseOrigin+route)
    // Technician PWA service worker is not a <script> tag and can survive a
    // frontend change even when its page correctly targets staging.
    if(route==='/technician')await checkLocalScript('/technician-sw.js',baseOrigin+route)
    checks.push(checkPageIsolation({route,html,modules,backendOrigin,headers:{'content-security-policy':response.headers.get('content-security-policy')||''}}))
  }
  return {ok:true,mode:'isolated-static-dependency-preflight-only',baseOrigin,backendOrigin,checks}
}
