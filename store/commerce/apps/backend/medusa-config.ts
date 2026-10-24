import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const environment = process.env.NODE_ENV || "development"
const isProduction = environment === "production"
const shiprocketRequested = process.env.STORE_SHIPROCKET_PLUGIN_ENABLED === "true"
const automationsRequested = process.env.STORE_AUTOMATIONS_PLUGIN_ENABLED === "true"
const cashfreeSandboxRequested = process.env.STORE_CASHFREE_SANDBOX_ENABLED === "true"
const analyticsRequested = process.env.STORE_ANALYTICS_PLUGIN_ENABLED === "true"

// External courier accounts can charge real money even on staging.
// Require explicit, independent opt-in; production deliberately cannot use it
// until the delivery + residual-COD integration acceptance tests are in place.
if (shiprocketRequested) {
  if (isProduction || process.env.STORE_ALLOW_EXTERNAL_PROVIDER_STAGING !== "true") {
    throw new Error("Shiprocket is blocked pending explicit staging approval and production shipment verification")
  }
  for (const name of [
    "SHIPROCKET_EMAIL", "SHIPROCKET_PASSWORD",
    "SHIPROCKET_PICKUP_LOCATION", "SHIPROCKET_WEBHOOK_TOKEN",
  ]) {
    if (!process.env[name] || process.env[name]!.startsWith("REPLACE_")) {
      throw new Error(`Missing safe Shiprocket configuration: ${name}`)
    }
  }
}

// The bundled MIT automation plugin can dispatch notifications and run jobs.
// Never enable it in production before consent, dry-run and delivery controls.
if (automationsRequested && (
  isProduction || process.env.STORE_AUTOMATIONS_STAGING_APPROVED !== "true"
)) {
  throw new Error("Automations require explicit staging approval and are blocked in production")
}

if (cashfreeSandboxRequested) {
  if (isProduction || process.env.STORE_CASHFREE_SANDBOX_APPROVED !== "true") {
    throw new Error("Cashfree sandbox is disabled pending explicit staging authorization")
  }
  for (const name of ["CASHFREE_SANDBOX_CLIENT_ID", "CASHFREE_SANDBOX_CLIENT_SECRET"]) {
    const value = process.env[name] || ""
    if (value.length < 10 || value.startsWith("REPLACE_")) {
      throw new Error(`Missing valid Cashfree staging configuration: ${name}`)
    }
  }
}

if (analyticsRequested && (isProduction || process.env.STORE_ANALYTICS_STAGING_APPROVED !== "true")) {
  throw new Error("Admin analytics plugin is disabled pending staging verification")
}

if (isProduction) {
  for (const name of ["JWT_SECRET", "COOKIE_SECRET"]) {
    const value = process.env[name] || ""
    if (value.length < 32 || value.startsWith("REPLACE_") || value.includes("supersecret")) {
      throw new Error(`Refusing insecure production ${name}`)
    }
  }
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
    throw new Error("Production backend requires dedicated DATABASE_URL and REDIS_URL")
  }
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },
  },
  // Existing MIT Medusa modules remain the transactional authority.
  // Installed plugin code is inert by default and forbidden in production.
  ...(shiprocketRequested || automationsRequested || analyticsRequested ? {
    plugins: [
      ...(shiprocketRequested ? [{ resolve: "@sam-ael/medusa-plugin-shiprocket", options: {} }] : []),
      ...(analyticsRequested ? [{ resolve: "@agilo/medusa-analytics-plugin", options: {} }] : []),
      ...(automationsRequested ? [{
        resolve: "@codee-sh/medusa-plugin-automations",
        options: {
          automations: { actionsEnabled: { email: false, slack: false } },
        },
      }] : []),
    ],
  } : {}),
  modules: [
    ...(shiprocketRequested ? [{
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [{
          resolve: "@sam-ael/medusa-plugin-shiprocket",
          id: "shiprocket",
          options: {
            email: process.env.SHIPROCKET_EMAIL,
            password: process.env.SHIPROCKET_PASSWORD,
            pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION,
          },
        }],
      },
    }] : []),
    ...(cashfreeSandboxRequested ? [{
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [{
          resolve: "./src/modules/cashfree",
          id: "cashfree-sandbox",
          options: {
            client_id: process.env.CASHFREE_SANDBOX_CLIENT_ID,
            client_secret: process.env.CASHFREE_SANDBOX_CLIENT_SECRET,
          },
        }],
      },
    }] : []),
  ],
})
