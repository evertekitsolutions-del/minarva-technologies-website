import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const root = new URL("../../",import.meta.url)
const read = path => readFileSync(new URL(path,root),"utf8")

test("Medusa POST cart-complete is blocked by server-side middleware",()=>{
  const code=read("store/commerce/apps/backend/src/api/middlewares.ts")
  assert.match(code,/method: \["POST"\]/)
  assert.match(code,/\/store\/carts\//)
  assert.match(code,/complete\/\?\$/)
  assert.match(code,/publicCheckoutGateFromEnvironment\(\)/)
  assert.match(code,/status\(503\)/)
})
test("production checkout is not enabled by a client environment toggle",()=>{
  const src=read("store/commerce/apps/backend/src/lib/store-checkout-release.ts")
  assert.match(src,/nodeEnv !== "production"/)
  assert.match(src,/STORE_PUBLIC_CHECKOUT_TEST_ENABLED/)
  assert.match(src,/STORE_PUBLIC_CHECKOUT_TEST_APPROVED/)
  assert.match(src,/enabled === "true" &&/)
  assert.match(src,/approved === "true"/)
})
test("no order placement or shipping provider is activated on denied checkout",()=>{
  const src=read("store/commerce/apps/backend/src/api/middlewares.ts")
  assert.match(src,/Customer checkout is not yet available/)
  assert.doesNotMatch(src,/\.completeCart\(|\bplaceOrder\(|PGCreateOrder\(|ShiprocketCreateOrder\(/)
})
