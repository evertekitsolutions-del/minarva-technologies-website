/**
 * Pure API-surface probe against the exact pinned Cashfree SDK.
 * No HTTP calls, no merchant credentials, no live charges.
 */
import { Cashfree, CFEnvironment } from "cashfree-pg"

if (typeof Cashfree !== "function") {
  throw new Error("cashfree-pg does not export the expected Cashfree class")
}

// Deliberately invalid values. The constructor should never connect to the API.
const client = new Cashfree(CFEnvironment.SANDBOX, "NO_REAL_MERCHANT_ID", "NO_REAL_MERCHANT_KEY")
const methods = [
  "PGVerifyWebhookSignature",
  "PGFetchOrder",
  "PGOrderFetchPayments",
  "PGCreateOrder",
  "PGOrderCreateRefund",
]
const surface = Object.fromEntries(methods.map(name => [name, {
  instance: typeof client?.[name],
  static: typeof Cashfree?.[name],
}]))
console.log("Pinned Cashfree SDK method surface:", JSON.stringify(surface))
console.log("Cashfree environment enum:", JSON.stringify({
  sandbox: CFEnvironment.SANDBOX,
  production: CFEnvironment.PRODUCTION,
}))
if (CFEnvironment.SANDBOX === undefined || CFEnvironment.PRODUCTION === undefined) {
  throw new Error("Cashfree SDK environment enum is missing")
}
if (methods.some(name => surface[name].instance !== "function")) {
  throw new Error("Pinned Cashfree SDK lacks required payment methods")
}
