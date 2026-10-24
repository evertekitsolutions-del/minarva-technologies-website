import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const base = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, base), "utf8")

test("official MIT Medusa automation module is installed exactly", () => {
  const pkg = JSON.parse(read("store/commerce/apps/backend/package.json"))
  assert.equal(pkg.dependencies["@codee-sh/medusa-plugin-automations"], "1.0.11")
  assert.equal(pkg.dependencies["@medusajs/medusa"], "2.22.0")
  assert.match(read("store/commerce/pnpm-lock.yaml"), /@codee-sh\/medusa-plugin-automations/)
})

test("automation plugin requires opt-in and production is never enabled", () => {
  const config = read("store/commerce/apps/backend/medusa-config.ts")
  assert.match(config, /STORE_AUTOMATIONS_PLUGIN_ENABLED === "true"/)
  assert.match(config, /STORE_AUTOMATIONS_STAGING_APPROVED !== "true"/)
  assert.match(config, /if \(automationsRequested && \(/)
  assert.match(config, /isProduction \|\| process\.env\.STORE_AUTOMATIONS_STAGING_APPROVED/)
  assert.match(config, /throw new Error\("Automations require explicit staging approval/)
})

test("no email and Slack actions auto-send during staging", () => {
  const config = read("store/commerce/apps/backend/medusa-config.ts")
  assert.match(config, /resolve: "@codee-sh\/medusa-plugin-automations"/)
  assert.match(config, /actionsEnabled: \{ email: false, slack: false \}/)
  const env = read("store/commerce/apps/backend/.env.template")
  assert.match(env, /^STORE_AUTOMATIONS_PLUGIN_ENABLED=false$/m)
  assert.match(env, /^STORE_AUTOMATIONS_STAGING_APPROVED=false$/m)
})

test("no automated payment/COD authority or promotional outreach is claimed", () => {
  const guide = read("store/commerce/AUTOMATION_MODULE.md")
  assert.match(guide, /No unsolicited WhatsApp/)
  assert.match(guide, /No production migrations/)
  assert.match(guide, /does not make the store's AI Sales Agent functional/)
})
