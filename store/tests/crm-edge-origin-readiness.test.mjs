import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  inspectCrmOrigin,
  verifyCrmOriginReadiness,
  MINARVA_CRM_EDGE_URL,
  CRM_ALLOWED_ORIGIN_PROBES,
  CRM_REJECTED_ORIGIN_PROBE,
} from "../lib/crm-edge-origin-readiness.mjs"

function mockPreflight({ denied = new Set(), wildcard = new Set(), failReject = false } = {}) {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({url,options})
    const origin = options.headers.Origin
    if (origin === CRM_REJECTED_ORIGIN_PROBE) {
      return new Response(null, {status: failReject ? 204 : 403})
    }
    if (denied.has(origin)) return new Response(null, {status: 403})
    return new Response(null, {
      status:204,
      headers: {
        "access-control-allow-origin": wildcard.has(origin) ? "*" : origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, apikey, authorization, x-client-info",
      },
    })
  }
  return { calls, fetchImpl }
}

test("real readiness algorithm does exactly four read-only OPTIONS checks",async () => {
  const stub=mockPreflight()
  const report=await verifyCrmOriginReadiness({fetchImpl:stub.fetchImpl})
  assert.equal(report.ready,true)
  assert.equal(report.operation,"readonly_options_only")
  assert.equal(report.crmWrites,false)
  assert.equal(report.merchantActivation,false)
  assert.equal(report.checks.length,4)
  assert(report.checks.every(c=>c.verified))
  assert.deepEqual(stub.calls.map(x=>x.options.headers.Origin),[
    ...CRM_ALLOWED_ORIGIN_PROBES,
    CRM_REJECTED_ORIGIN_PROBE,
  ])
  for(const {url,options} of stub.calls){
    assert.equal(url, MINARVA_CRM_EDGE_URL)
    assert.equal(options.method,"OPTIONS")
    assert.equal(options.redirect,"error")
    assert.equal(options.cache,"no-store")
    assert.equal(options.headers["Access-Control-Request-Method"],"POST")
    assert.equal(options.headers["Access-Control-Request-Headers"],"apikey,content-type")
    assert.equal(options.body,undefined)
    assert.equal(options.headers.apikey,undefined)
    assert.equal(options.headers.Authorization,undefined)
  }
})

test("current-style store origin rejection correctly marks rollout NOT READY",async ()=>{
  const stub=mockPreflight({denied:new Set(["https://store.minarvatechnologies.com"])})
  const report=await verifyCrmOriginReadiness({fetchImpl:stub.fetchImpl})
  assert.equal(report.ready,false)
  assert.equal(report.checks[2].status,403)
  assert.equal(report.checks[2].verified,false)
  assert.equal(report.checks[3].verified,true)
})

test("wildcard ACAO or a reflected untrusted origin never passes",async ()=>{
  const origin=CRM_ALLOWED_ORIGIN_PROBES[2]
  const wildcard=mockPreflight({wildcard:new Set([origin])})
  const report=await inspectCrmOrigin({origin,fetchImpl:wildcard.fetchImpl})
  assert.equal(report.verified,false)
  const bad=mockPreflight({failReject:true})
  const full=await verifyCrmOriginReadiness({fetchImpl:bad.fetchImpl})
  assert.equal(full.ready,false)
  assert.equal(full.checks[3].verified,false)
})

test("missing POST/header CORS capabilities are detected",async ()=>{
  const origin=CRM_ALLOWED_ORIGIN_PROBES[2]
  const fetchImpl=async()=>new Response(null,{status:204,headers:{
    "access-control-allow-origin":origin,
    "access-control-allow-methods":"GET, OPTIONS",
    "access-control-allow-headers":"content-type",
  }})
  assert.equal((await inspectCrmOrigin({origin,fetchImpl})).verified,false)
})

test("origin input is fixed to known sites, cannot probe arbitrary URLs",async ()=>{
  await assert.rejects(()=>inspectCrmOrigin({
    origin:"https://evil.example",fetchImpl:async()=>{throw Error("should not call")}
  }),/Unsupported CRM origin/)
})

test("transport errors fail closed instead of claiming an Edge deployment",async ()=>{
  await assert.rejects(()=>verifyCrmOriginReadiness({
    fetchImpl:async()=>{throw new Error("network unavailable")}
  }),/network unavailable/)
})

test("GitHub Edge source allows store origin but retains consent and quota checks",()=>{
  const source=readFileSync(new URL("../../supabase/functions/public-enquiry-submit/index.ts",import.meta.url),"utf8")
  assert.match(source,/"https:\/\/store\.minarvatechnologies\.com"/)
  assert.match(source,/ALLOWED_ORIGINS\.has\(origin\)/)
  assert.match(source,/body\.consent_to_contact!==true/)
  assert.match(source,/consume_public_enquiry_quota/)
  assert.match(source,/submit_public_enquiry/)
  assert.doesNotMatch(source,/"Access-Control-Allow-Origin":\s*"\*"/)
})
