#!/usr/bin/env node
import { verifyCrmOriginReadiness } from "../lib/crm-edge-origin-readiness.mjs"

/**
 * Explicit manual probe: node store/scripts/check-crm-edge-origin.mjs --live
 * OPTIONS-only. No PII, no CRM writes, no Supabase admin key, no paid API.
 * Deliberately does not execute merely when this module is imported.
 */
if (process.argv.length !== 3 || process.argv[2] !== "--live") {
  console.error("Read-only CRM CORS probe. Explicitly run with --live")
  process.exitCode=2
} else {
  try {
    const report=await verifyCrmOriginReadiness()
    for(const item of report.checks){
      console.log([
        item.verified?"PASS":"BLOCKED",
        item.expected,
        item.origin,
        "HTTP",item.status,
      ].join(" "))
    }
    if(report.ready){
      console.log("CRM CORS preflight passed. This does NOT verify a saved enquiry or authorize activation.")
    } else {
      console.error("Store CRM CORS is not ready. Keep browser CRM saving OFF.")
      process.exitCode=1
    }
  } catch(error){
    console.error("CRM CORS readiness could not be confirmed:", error instanceof Error ? error.message : "unknown")
    process.exitCode=1
  }
}
