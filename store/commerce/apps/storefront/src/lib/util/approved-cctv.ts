import type { HttpTypes } from "@medusajs/types"
import { auditCctvPackage } from "../../../../../../lib/cctv-package-readiness.mjs"

/**
 * Server-side storefront release guard: reuse the STORE-020 source-of-truth
 * audit for every visible package. Incomplete SKU/INR price/stock/box data
 * must never become a customer-facing offer or SEO product JSON-LD.
 *
 * This is complementary to the Medusa Search API's mandatory approval filter.
 * It does not authorize payment or order placement.
 */
export const isApprovedForPublicCatalog = (
  product: HttpTypes.StoreProduct,
  countryCode = "in"
): boolean => auditCctvPackage(product, { countryCode }).ready
