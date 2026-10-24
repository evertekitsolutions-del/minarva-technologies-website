import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, root), "utf8")

test("Medusa OSS core and published Shiprocket provider are pinned", () => {
  const p = JSON.parse(read("store/commerce/apps/backend/package.json"))
  assert.equal(p.dependencies["@medusajs/medusa"], "2.22.0")
  assert.equal(p.dependencies["@sam-ael/medusa-plugin-shiprocket"], "0.2.1")
  assert.match(read("store/commerce/pnpm-lock.yaml"), /@sam-ael\/medusa-plugin-shiprocket/)
})

test("Shiprocket is explicitly disabled in environment template", () => {
  const env = read("store/commerce/apps/backend/.env.template")
  assert.match(env, /^STORE_SHIPROCKET_PLUGIN_ENABLED=false$/m)
  assert.match(env, /^STORE_ALLOW_EXTERNAL_PROVIDER_STAGING=false$/m)
  assert.doesNotMatch(env, /^SHIPROCKET_PASSWORD=.+$/m)
})

test("Provider is double-gated and cannot run in production", () => {
  const config = read("store/commerce/apps/backend/medusa-config.ts")
  assert.match(config, /process\.env\.STORE_SHIPROCKET_PLUGIN_ENABLED === "true"/)
  assert.match(config, /isProduction \|\| process\.env\.STORE_ALLOW_EXTERNAL_PROVIDER_STAGING !== "true"/)
  assert.match(config, /throw new Error\("Shiprocket is blocked/)
  assert.match(config, /resolve: "@sam-ael\/medusa-plugin-shiprocket"/)
  assert.match(config, /"SHIPROCKET_WEBHOOK_TOKEN"/)
})

test("No hard-coded working credentials are part of staging templates", () => {
  const template = read("store/commerce/apps/backend/.env.template")
  for (const key of ["JWT_SECRET", "COOKIE_SECRET"]) {
    assert.match(template, new RegExp(`^${key}=REPLACE_WITH_`, "m"))
  }
  assert.doesNotMatch(template, /(JWT_SECRET|COOKIE_SECRET)=supersecret/)
  const config = read("store/commerce/apps/backend/medusa-config.ts")
  assert.match(config, /if \(isProduction\)/)
  assert.match(config, /Refusing insecure production/)
})

test("Dev databases and cache ports bind only to localhost", () => {
  const compose = read("store/commerce/compose.dev.yml")
  assert.match(compose, /127\.0\.0\.1:55432:5432/)
  assert.match(compose, /127\.0\.0\.1:56379:6379/)
  assert.match(compose, /POSTGRES_PASSWORD: \$\{STORE_DEV_DB_PASSWORD:\?/)
  assert.doesNotMatch(compose, /(?:0\.0\.0\.0|:9000:9000)/)
})

test("Existing storefront defaults to India and does not carry gateway secrets", () => {
  const template = read("store/commerce/apps/storefront/.env.template")
  assert.match(template, /^NEXT_PUBLIC_DEFAULT_REGION=in$/m)
  assert.match(template, /^NEXT_PUBLIC_MEDUSA_BACKEND_URL=http:\/\/localhost:9000$/m)
  assert.doesNotMatch(template, /RAZORPAY_SECRET|SHIPROCKET_PASSWORD|SERVICE_ROLE/)
})

test("Provider activation does not claim prepaid-advance COD readiness", () => {
  const doc = read("store/commerce/PROVIDER_MODULES.md")
  assert.match(doc, /residual COD/)
  assert.match(doc, /Do not enable if merchant account cannot guarantee partial COD/)
  assert.doesNotMatch(read("store/commerce/apps/backend/medusa-config.ts"), /STORE_PARTIAL_COD_ENABLED\s*===\s*"true"/)
})

test("WordPress and WooCommerce remain excluded", () => {
  const p = JSON.parse(read("store/commerce/apps/backend/package.json"))
  assert.ok(!Object.keys(p.dependencies).some(x => /wordpress|woocommerce/i.test(x)))
  assert.match(read("store/OSS_SOURCE_MANIFEST.md"), /WooCommerce prohibited/)
})
