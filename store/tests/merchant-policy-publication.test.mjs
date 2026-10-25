import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"

const root=new URL("../../",import.meta.url)
const read=path=>readFileSync(new URL(path,root),"utf8")
const base="store/commerce/apps/storefront/src/"
test("merchant approval, not unreviewed region metadata, controls policy publication",()=>{
  const s=read(base+"lib/util/merchant-policy-release.ts")
  assert.match(s,/import "server-only"/)
  assert.match(s,/STORE_CUSTOMER_POLICIES_PUBLISHED === "true"/)
  assert.match(s,/STORE_CUSTOMER_POLICIES_OWNER_APPROVED === "true"/)
  assert.match(s,/&&/)
})
test("shipping page suppresses unsupported shipping rates unless separately approved",()=>{
  const s=read(base+"app/[countryCode]/(main)/shipping/page.tsx")
  assert.match(s,/const approved = merchantPolicyPublicationApproved\(\)/)
  assert.match(s,/approved\s*\? await getStorePolicies\(countryCode\)/)
  assert.match(s,/No online orders or courier bookings are accepted yet/)
  assert.doesNotMatch(s,/Available shipping methods and final costs are shown at checkout/)
  assert.doesNotMatch(s,/Orders to \{countryCode\.toUpperCase\(\)\} ship/)
})
test("returns page does not promise an unapproved return window",()=>{
  const s=read(base+"app/[countryCode]/(main)/returns/page.tsx")
  assert.match(s,/merchantPolicyPublicationApproved\(\)/)
  assert.match(s,/\? await getStorePolicies\(countryCode\)/)
  assert.match(s,/Return, replacement, refund and warranty conditions/)
  assert.match(s,/<PoliciesUnavailable \/>/)
})
test("policy approval cannot create an order or silently enable payment",()=>{
  const s=read(base+"lib/util/merchant-policy-release.ts")
  assert.doesNotMatch(s,/createOrder|authorizePayment|Shiprocket|Cashfree|completeCart/)
  const g=read("store/commerce/apps/backend/src/api/middlewares.ts")
  assert.match(g,/publicCheckoutGateFromEnvironment\(\)/)
})
