import assert from 'node:assert/strict'
import {existsSync, readdirSync, mkdirSync, readFileSync, writeFileSync, copyFileSync} from 'node:fs'
import {resolve, join, dirname, extname, relative, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {validateEnvironment, PRODUCTION_SUPABASE_HOST} from './uat-isolation.mjs'

// Build only the deployed static website, never server-side functions, migrations,
// local credentials or repository workflow artifacts.
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)))
const PUBLIC_EXTENSIONS=new Set(['.html','.js','.css','.webp','.png','.jpg','.jpeg','.svg','.webmanifest'])
const ROOT_EXTENSIONS=new Set(['.html','.js','.svg','.webmanifest'])
const PRODUCTION_HOST=PRODUCTION_SUPABASE_HOST
const PUBLIC_KEY_RE=/sb_publishable_[A-Za-z0-9_-]+/g
const HOST_RE=/[a-z0-9-]+\.supabase\.co/gi

function collectFiles(directory,prefix=''){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(entry.isSymbolicLink())throw Error('Symlinks are not permitted in UAT website assets: '+entry.name)
    const next=prefix?prefix+'/'+entry.name:entry.name
    if(entry.isDirectory())return collectFiles(join(directory,entry.name),next)
    if(!entry.isFile()||!PUBLIC_EXTENSIONS.has(extname(entry.name).toLowerCase()))throw Error('Unexpected staged public asset type: '+next)
    return [next]
  })
}
function clientFiles(){
  const root=readdirSync(ROOT,{withFileTypes:true})
    .filter(e=>e.isFile()&&ROOT_EXTENSIONS.has(extname(e.name).toLowerCase())).map(e=>e.name)
  return [...root,...collectFiles(join(ROOT,'assets'),'assets'),...collectFiles(join(ROOT,'services'),'services')].sort()
}
function isTextFile(file){return !['.webp','.png','.jpg','.jpeg'].includes(extname(file).toLowerCase())}
function normalizedStagingUrl(value){
  const u=new URL(value)
  assert.equal(u.protocol,'https:','UAT backend must be HTTPS')
  assert.equal(u.pathname,'/','UAT backend URL must not contain a path')
  assert.equal(u.search,'','UAT backend URL must not have a query')
  assert.equal(u.hash,'','UAT backend URL must not have a fragment')
  validateEnvironment('https://dedicated-uat.example.com',u.origin)
  return u.origin
}
export function buildIsolatedUat({backendUrl,publishableKey,outputDir}){
  assert.ok(backendUrl&&publishableKey&&outputDir,'UAT_SUPABASE_URL, UAT_SUPABASE_PUBLISHABLE_KEY and outputDir are required')
  const stageOrigin=normalizedStagingUrl(backendUrl)
  if(!/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(publishableKey))throw Error('A dedicated Supabase publishable key is required')
  const target=resolve(outputDir)
  if(target===ROOT || ROOT.startsWith(target+sep))throw Error('Output must not replace or contain repository source')
  for(const protectedRoot of ['assets','services','supabase','.github','tools','docs']){
    const p=join(ROOT,protectedRoot)
    if(target===p||target.startsWith(p+sep))throw Error('Output may not be written inside a source directory')
  }
  if(existsSync(target))throw Error('Output already exists; refusing to overwrite any existing files')
  const files=clientFiles()
  const originals=files.filter(isTextFile).map(p=>readFileSync(join(ROOT,p),'utf8'))
  const keys=[...new Set(originals.flatMap(s=>[...s.matchAll(PUBLIC_KEY_RE)].map(m=>m[0])))]
  if(keys.length!==1)throw Error('Expected exactly one production frontend publishable key')
  const originalKey=keys[0]
  if(originalKey===publishableKey)throw Error('Staging publishable key must differ from production')
  if(!originals.some(s=>s.includes(PRODUCTION_HOST)))throw Error('Production backend reference missing; refusing unsafe conversion')
  // Refuse output from mixed environments before touching disk.
  for(const [i,s] of originals.entries()){
    const hosts=[...new Set([...s.matchAll(HOST_RE)].map(m=>m[0].toLowerCase()))]
    if(hosts.some(h=>h!==PRODUCTION_HOST))throw Error('Unexpected additional Supabase host in '+files.filter(isTextFile)[i])
    if(s.includes('sb_secret_'))throw Error('Unexpected Supabase secret in browser source')
  }
  mkdirSync(target,{recursive:true})
  let rewritten=0
  for(const file of files){
    const dest=join(target,file);mkdirSync(dirname(dest),{recursive:true})
    if(!isTextFile(file)){copyFileSync(join(ROOT,file),dest);continue}
    const src=readFileSync(join(ROOT,file),'utf8')
    const changed=src.split(PRODUCTION_HOST).join(new URL(stageOrigin).hostname).split(originalKey).join(publishableKey)
    if(changed!==src)rewritten++
    if(changed.includes(PRODUCTION_HOST)||changed.includes(originalKey))throw Error('Production API reference remains in '+file)
    writeFileSync(dest,changed)
  }
  const config=JSON.parse(readFileSync(join(ROOT,'vercel.json'),'utf8'))
  const headers=config.headers?.find(h=>h.source==='/(.*)')?.headers
  if(!headers)throw Error('Production security headers missing')
  for(const h of headers)h.value=h.value.split(PRODUCTION_HOST).join(new URL(stageOrigin).hostname)
  if(headers.some(h=>h.value.includes(PRODUCTION_HOST)))throw Error('Production backend remains in staging headers')
  headers.push({key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'})
  headers.push({key:'X-UAT-Isolated',value:'true'})
  const csp=headers.find(h=>h.key.toLowerCase()==='content-security-policy')?.value||''
  if(!csp.includes(stageOrigin)||csp.includes(PRODUCTION_HOST))throw Error('Staging CSP is not isolated')
  writeFileSync(join(target,'vercel.json'),JSON.stringify(config,null,2)+'\n')
  writeFileSync(join(target,'robots.txt'),'User-agent: *\nDisallow: /\n')
  // Do not put a discoverable production sitemap inside an isolated UAT deployment.
  // Files are written to a separate directory; this function never edits production files.
  return {ok:true,mode:'staging-static-build-only',backendOrigin:stageOrigin,outputDir:target,files:files.length,rewritten,seoIndexable:false,realDataWritten:false}
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)
if(invoked){
  const argIndex=process.argv.indexOf('--out')
  if(argIndex<0||!process.argv[argIndex+1])throw Error('Usage: node tools/build-isolated-uat.mjs --out <new-output-dir>')
  console.log(JSON.stringify(buildIsolatedUat({backendUrl:process.env.UAT_SUPABASE_URL,publishableKey:process.env.UAT_SUPABASE_PUBLISHABLE_KEY,outputDir:process.argv[argIndex+1]}),null,2))
}
