import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, root), "utf8")
const pkg = (path) => JSON.parse(read(path))

test("Cashfree SDKs are official and pinned exactly", () => {
  const backend = pkg("store/commerce/apps/backend/package.json")
  const storefront = pkg("store/commerce/apps/storefront/package.json")
  assert.equal(backend.dependencies["cashfree-pg"], "6.0.6")
  assert.equal(storefront.dependencies["@cashfreepayments/cashfree-js"], "1.0.7")
  assert.ok(!backend.dependencies["medusa-plugin-razorpay-v2"])
})

test("Cashfree SDK source is locked and checkout remains inactive", () => {
  const lock = read("store/commerce/pnpm-lock.yaml")
  assert.match(lock, /cashfree-pg:/)
  assert.match(lock, /@cashfreepayments\/cashfree-js:/)
  const config = read("store/commerce/apps/backend/medusa-config.ts")
  assert.doesNotMatch(config, /resolve:\s*["']cashfree-pg/)
  const doc = read("store/commerce/PAYMENT_MODULES.md")
  assert.match(doc, /Browser payment return or success UI is \*\*not payment confirmation\*\*/)
})

test("SDKs are isolated from the public Minarva website and secrets", () => {
  const env = read("store/commerce/apps/storefront/.env.template")
  assert.doesNotMatch(env, /CASHFREE_SECRET|CF_CLIENT_SECRET|SHIPROCKET_PASSWORD/)
  assert.match(read("store/commerce/PAYMENT_MODULES.md"), /server-verified payment proof|Signed\/verified server-side payment webhook/)
  assert.match(read("store/OSS_SOURCE_MANIFEST.md"), /WooCommerce prohibited/)
})
