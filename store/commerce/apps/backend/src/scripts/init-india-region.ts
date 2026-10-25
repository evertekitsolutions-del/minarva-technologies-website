import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createRegionsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * STORE-025: explicit, disposable/staging-only INDIA INR region bootstrap.
 * Uses Medusa's native workflows, NOT SQL changes and NOT production.
 * Does not seed fictitious products, rates, tax bands or courier providers.
 */
export const approvedIndiaStagingDb = (env: NodeJS.ProcessEnv): boolean => {
  if (env.NODE_ENV === "production" ||
      env.STORE_INR_REGION_STAGING_ENABLED !== "true" ||
      env.STORE_INR_REGION_STAGING_APPROVED !== "true") return false
  const original = env.DATABASE_URL ?? ""
  try {
    const db = new URL(original)
    const actualName = decodeURIComponent(db.pathname.slice(1))
    const approvedName = env.STORE_INR_REGION_STAGING_DB_NAME ?? ""
    return ["postgresql:", "postgres:"].includes(db.protocol) &&
      !!actualName && actualName === approvedName &&
      /(?:_ci|_staging)$/.test(actualName) &&
      !!db.hostname &&
      db.searchParams.size === 0
  } catch { return false }
}

export default async function initIndiaRegion({ container }: ExecArgs) {
  if (!approvedIndiaStagingDb(process.env)) {
    throw new Error(
      "India/INR bootstrap blocked: explicit isolated staging database approval required"
    )
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const result = await query.graph({
    entity: "store",
    fields: ["id", "supported_currencies.currency_code", "supported_currencies.is_default"],
  })
  const stores = result.data as {
    id: string,
    supported_currencies?: { currency_code: string, is_default: boolean }[],
  }[]
  if (stores.length !== 1) {
    throw new Error("Expected exactly one isolated Medusa store")
  }
  const store = stores[0]
  const all = (store.supported_currencies ?? []).map(c => ({
    currency_code: c.currency_code.toLowerCase(),
    is_default: c.is_default,
  }))
  if (!all.find(x => x.currency_code === "inr")) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          supported_currencies: [
            ...all.map(x => ({ currency_code: x.currency_code, is_default: false })),
            { currency_code: "inr", is_default: true },
          ],
        },
      },
    })
    logger.info("Staging Medusa store currency INR added")
  } else if (!all.find(x => x.currency_code === "inr")?.is_default) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          supported_currencies: all.map(x => ({
            currency_code: x.currency_code,
            is_default: x.currency_code === "inr",
          })),
        },
      },
    })
    logger.info("Staging default currency changed to INR")
  }

  const existing = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "countries.iso_2"],
  })
  const regions = existing.data as {
    id: string, name: string, currency_code: string,
    countries?: { iso_2: string }[],
  }[]
  const indiaRegions = regions.filter(r =>
    (r.countries ?? []).some(c => c.iso_2 === "in"))
  if (indiaRegions.length > 1) throw new Error("Ambiguous India region")
  if (indiaRegions.length === 1) {
    if (indiaRegions[0].currency_code !== "inr") {
      throw new Error("India region exists with a non-INR currency: manual reconciliation required")
    }
    logger.info("India INR region exists; no duplicate created")
    return
  }

  // Use Medusa system-manual provider ONLY for isolated staging configuration.
  // Customer checkout is blocked at the backend even for direct Store API calls.
  const { result: created } = await createRegionsWorkflow(container).run({
    input: {
      regions: [{
        name: "Kerala and India — Staging Only",
        currency_code: "inr",
        countries: ["in"],
        automatic_taxes: false,
        payment_providers: ["pp_system_default"],
      }],
    },
  })
  if (created.length !== 1 ||
      created[0].currency_code !== "inr") {
    throw new Error("Failed to establish Medusa India INR staging region")
  }
  logger.info("Created India INR region in isolated staging database; no products or taxes seeded")
}
