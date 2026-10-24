import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const base = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, base), "utf8")

test("install only exact pinned Medusa analytics package", () => {
  const p = JSON.parse(read("store/commerce/apps/backend/package.json"))
  assert.equal(p.dependencies["@agilo/medusa-analytics-plugin"], "1.2.1")
  assert.equal(p.dependencies["@medusajs/medusa"], "2.22.0")
  assert.match(read("store/commerce/pnpm-lock.yaml"), /@agilo\/medusa-analytics-plugin/)
})

test("admin analytics requires separate opt-ins and cannot run in production", () => {
  const c = read("store/commerce/apps/backend/medusa-config.ts")
  assert.match(c, /STORE_ANALYTICS_PLUGIN_ENABLED === "true"/)
  assert.match(c, /isProduction \|\| process\.env\.STORE_ANALYTICS_STAGING_APPROVED !== "true"/)
  assert.match(c, /resolve: "@agilo\/medusa-analytics-plugin"/)
  const env = read("store/commerce/apps/backend/.env.template")
  assert.match(env, /^STORE_ANALYTICS_PLUGIN_ENABLED=false$/m)
  assert.match(env, /^STORE_ANALYTICS_STAGING_APPROVED=false$/m)
})

test("no fabricated sales or paid tracking vendor is introduced", () => {
  const doc = read("store/commerce/ANALYTICS_MODULE.md")
  assert.match(doc, /No analytics events are fabricated/)
  assert.match(doc, /No external analytics pixel/)
  assert.match(doc, /Production enablement is blocked/)
})
