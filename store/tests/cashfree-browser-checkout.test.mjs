import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const base = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, base), "utf8")
const prefix = "store/commerce/apps/storefront/src/modules/checkout/components/"

test("official Cashfree published SDK and sandbox mode are reused", () => {
  const p = JSON.parse(read("store/commerce/apps/storefront/package.json"))
  assert.equal(p.dependencies["@cashfreepayments/cashfree-js"], "1.0.7")
  const button = read(prefix + "cashfree-sandbox-button/index.tsx")
  assert.match(button, /import \{ load \} from "@cashfreepayments\/cashfree-js"/)
  assert.match(button, /await load\(\{ mode: "sandbox" \}\)/)
  assert.match(button, /cashfree\.checkout\(\{/)
  assert.match(button, /redirectTarget: "_modal"/)
})

test("sandbox checkout cannot be used by production or without explicit opt-in", () => {
  const source = read(prefix + "cashfree-sandbox-button/index.tsx")
  assert.match(source, /process\.env\.NODE_ENV === "development"/)
  assert.match(source, /NEXT_PUBLIC_CASHFREE_SANDBOX_CHECKOUT_ENABLED === "true"/)
  assert.match(source, /disabled=\{!sandboxEnabled \|\| notReady \|\| !hasSession \|\| submitting\}/)
  const env = read("store/commerce/apps/storefront/.env.template")
  assert.match(env, /^NEXT_PUBLIC_CASHFREE_SANDBOX_CHECKOUT_ENABLED=false$/m)
  assert.match(env, /^NEXT_PUBLIC_STORE_DEV_MANUAL_CHECKOUT_ENABLED=false$/m)
})

test("cashfree browser callback never calls placeOrder or reports paid", () => {
  const source = read(prefix + "cashfree-sandbox-button/index.tsx")
  assert.doesNotMatch(source, /\bawait\s+placeOrder\(|\b(?:await\s+)?cart\.complete\(|authorized: true|status: "paid"/)
  assert.match(source, /Payment status is not confirmed/)
  assert.match(source, /No order has been placed/)
})

test("medusa checkout distinguishes sandbox Cashfree from Stripe and manual", () => {
  const source = read(prefix + "payment-button/index.tsx")
  assert.match(source, /pp_minarva-cashfree-sandbox_cashfree-sandbox/)
  assert.match(source, /<CashfreeSandboxButton/)
  assert.match(source, /NEXT_PUBLIC_STORE_DEV_MANUAL_CHECKOUT_ENABLED === "true"/)
  assert.match(source, /Manual test checkout is not available/)
})

test("no Cashfree merchant secret is exposed to Next.js client variables", () => {
  const frontend = read("store/commerce/apps/storefront/.env.template")
  assert.doesNotMatch(frontend, /CASHFREE_SANDBOX_CLIENT_SECRET|CF_CLIENT_SECRET/)
})
