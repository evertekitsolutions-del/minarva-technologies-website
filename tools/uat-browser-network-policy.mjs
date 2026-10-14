// Read-only network policy for authenticated, isolated staging browser preflight.
// This is NOT a transaction test and must never be used to authorize releases.
// No API keys, credentials or request bodies are handled by this module.
import {validateEnvironment} from './uat-isolation.mjs'

const SAFE_EXTERNAL_ASSET_HOSTS=new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'd2ol7oe51mr4n9.cloudfront.net'
])

// These RPC implementations were individually checked to be read-only.
// No generic /rpc POST passthrough: most RPC functions are business mutations.
const READ_ONLY_RPCS=new Set([
  'platform_health_readiness',
  'platform_release_readiness',
  'customer_care_voice_runtime_readiness',
  'customer_care_call_readiness_audit',
  'customer_care_webhook_idempotency_readiness',
  'customer_care_telephony_go_live_readiness',
  'technician_get_profile',
  'technician_get_queue',
  'technician_get_job'
])

const allow=(kind)=>({allow:true,kind})
const deny=(reason)=>({allow:false,reason})
const safeGet=method=>method==='GET'||method==='HEAD'
const safeHttp=method=>safeGet(method)||method==='OPTIONS'

export function createUatPreflightNetworkPolicy({baseUrl,backendUrl}){
  const {baseOrigin,backendOrigin}=validateEnvironment(baseUrl,backendUrl)
  return function assess({url,method='GET',phase='read_only'}){
    let target
    try{target=new URL(url)}catch{return deny('invalid_url')}
    if(target.protocol!=='https:')return deny('non_https_or_websocket')
    const verb=String(method).toUpperCase()
    if(target.origin===baseOrigin){
      if(!safeHttp(verb))return deny('staging_frontend_write_forbidden')
      return allow('isolated_frontend_read')
    }
    if(target.origin===backendOrigin){
      const path=target.pathname
      if(path==='/auth/v1/token'&&verb==='POST'){
        const grant=target.searchParams.get('grant_type')
        if(grant==='password'&&phase==='login')return allow('isolated_auth_login')
        if(grant==='refresh_token'&&phase==='read_only')return allow('isolated_auth_refresh')
        return deny('unexpected_auth_token_operation')
      }
      if(safeHttp(verb)&&(
        path==='/auth/v1/user'||path==='/auth/v1/settings'
      ))return allow('isolated_auth_read')
      if(safeHttp(verb)&&path.startsWith('/rest/v1/')&&verb!=='POST')
        return allow('isolated_database_read')
      if(verb==='POST'&&path.startsWith('/rest/v1/rpc/')){
        const name=path.slice('/rest/v1/rpc/'.length)
        if(READ_ONLY_RPCS.has(name))return allow('explicit_read_only_rpc')
        return deny('mutating_or_unreviewed_rpc_forbidden')
      }
      if(safeHttp(verb)&&path.startsWith('/storage/v1/object/'))
        return allow('isolated_storage_read')
      if(verb==='OPTIONS')return allow('isolated_cors_preflight')
      return deny('backend_write_or_edge_call_forbidden')
    }
    if(safeGet(verb)&&SAFE_EXTERNAL_ASSET_HOSTS.has(target.hostname)){
      if(target.username||target.password)return deny('external_credentials_forbidden')
      return allow('approved_static_asset')
    }
    return deny('unapproved_network_origin')
  }
}

export const UAT_PREFLIGHT_ROUTES=[
  '/quotations','/invoices','/service-jobs','/job-sheet','/technician',
  '/customer-care','/voice-simulator','/voice-runtime',
  '/calling-readiness','/release-readiness','/platform-health'
]
