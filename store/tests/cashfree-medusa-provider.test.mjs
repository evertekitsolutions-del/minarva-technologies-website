import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const base = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, base), "utf8")

test("Medusa provider reuses Cashfree's official v6 SDK in sandbox", () => {
  const src = read("store/commerce/apps/backend/src/modules/cashfree/service.ts")
  assert.match(src, /import \{ Cashfree, CFEnvironment \} from "cashfree-pg"/)
  assert.match(src, /new Cashfree\(CFEnvironment\.SANDBOX/)
  assert.match(src, /extends AbstractPaymentProvider/)
  assert.match(src, /PGCreateOrder\(request\)/)
  assert.match(src, /payment_session_id/)
  assert.match(read("store/commerce/apps/backend/src/modules/cashfree/index.ts"), /ModuleProvider\(Modules\.PAYMENT/)
})

test("production gateway requests always fail closed", () => {
  const config = read("store/commerce/apps/backend/medusa-config.ts")
  const src = read("store/commerce/apps/backend/src/modules/cashfree/service.ts")
  assert.match(config, /if \(cashfreeSandboxRequested\)/)
  assert.match(config, /isProduction \|\| process\.env\.STORE_CASHFREE_SANDBOX_APPROVED !== "true"/)
  assert.match(src, /process\.env\.NODE_ENV === "production"/)
  assert.match(src, /STORE_CASHFREE_SANDBOX_ENABLED !== "true"/)
  assert.match(src, /STORE_CASHFREE_SANDBOX_APPROVED !== "true"/)
  assert.match(src, /cashfree-sandbox/)
})

test("Cashfree sandbox is disabled with absent credentials by default", () => {
  const env = read("store/commerce/apps/backend/.env.template")
  assert.match(env, /^STORE_CASHFREE_SANDBOX_ENABLED=false$/m)
  assert.match(env, /^STORE_CASHFREE_SANDBOX_APPROVED=false$/m)
  assert.doesNotMatch(env, /^CASHFREE_SANDBOX_CLIENT_SECRET=[^#\n]+$/m)
})

test("browser redirect and webhooks cannot mark Medusa payment captured", () => {
  const src = read("store/commerce/apps/backend/src/modules/cashfree/service.ts")
  assert.match(src, /status: PaymentSessionStatus\.PENDING_AUTHORIZATION/)
  assert.match(src, /return \{ action: PaymentActions\.NOT_SUPPORTED \}/)
  assert.match(src, /Cashfree capture disabled pending trusted Medusa/)
  assert.match(src, /Cashfree refunds disabled pending refund idempotency/)
  // CAPTURED is now allowed *only* behind explicit sandbox settlement
  // opt-ins after the immutable Medusa + Cashfree full-prepaid proof.
  assert.match(src, /STORE_CASHFREE_SANDBOX_SETTLEMENT_ENABLED !== "true"/)
  assert.match(src, /STORE_CASHFREE_SANDBOX_SETTLEMENT_APPROVED !== "true"/)
  assert.match(src, /await confirmCashfreePrepaidProof\(/)
  assert.match(src, /status: PaymentSessionStatus\.CAPTURED/)
})

test("merchant secrets remain server-side, no public env is introduced", () => {
  const config = read("store/commerce/apps/backend/medusa-config.ts")
  const storefront = read("store/commerce/apps/storefront/.env.template")
  assert.match(config, /CASHFREE_SANDBOX_CLIENT_SECRET/)
  assert.doesNotMatch(storefront, /CASHFREE_SANDBOX_CLIENT_SECRET|CASHFREE_SANDBOX_CLIENT_ID/)
})
