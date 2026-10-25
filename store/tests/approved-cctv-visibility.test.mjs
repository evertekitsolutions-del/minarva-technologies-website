import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { auditCctvPackage } from "../lib/cctv-package-readiness.mjs"

const base = new URL("../../", import.meta.url)
const read = path => readFileSync(new URL(path, base), "utf8")

test("Medusa index maps true merchant approval from database metadata", () => {
  const src = read("store/commerce/apps/backend/src/search/product.ts")
  assert.match(src, /"metadata",/)
  assert.match(src, /metadata\?: Record<string, unknown> \| null/)
  assert.match(src, /sale_approved: search\.boolean\(\)\.filterable\(\)\.retrievable\(false\)/)
  assert.match(src, /sale_approved: product\.metadata\?\.minarva_sale_approved === true/)
  assert.match(src, /"product\.updated"/)
})

test("Medusa search API combines server-only approved filter with all customer searches", () => {
  const src = read("store/commerce/apps/backend/src/api/middlewares.ts")
  assert.match(src, /product: \{\s*filters: \(\) => \(\{ sale_approved: true \}\)/)
  assert.match(src, /configureStoreSearch\(\{/)
  assert.match(src, /\/store\/search/)
  assert.doesNotMatch(src, /sale_approved: req\.body/)
})

test("Next.js listing and direct product routes reuse source-of-truth package audit", () => {
  const wrapper = read("store/commerce/apps/storefront/src/lib/util/approved-cctv.ts")
  const listing = read("store/commerce/apps/storefront/src/lib/data/products.ts")
  const page = read("store/commerce/apps/storefront/src/app/[countryCode]/(main)/products/[handle]/page.tsx")
  assert.match(wrapper, /import \{ auditCctvPackage \} from/)
  assert.match(wrapper, /auditCctvPackage\(product, \{ countryCode \}\)\.ready/)
  assert.match(listing, /products\.filter\(\(p\) =>\s*isApprovedForPublicCatalog/)
  assert.match(listing, /products: approvedProducts/)
  assert.match(page, /listProducts\(\{/)
  assert.match(page, /if \(!pricedProduct\) \{\s*notFound\(\)/)
})

test("unapproved or incomplete audited CCTV packages never qualify for publishing", () => {
  const skeleton = {
    id: "prod_check_01",
    title: "Synthetic test kit",
    description: "Testing-only CCTV kit with no official merchant offer.",
    status: "published",
    thumbnail: "https://example.invalid/item.png",
    metadata: {
      minarva_sale_approved: true,
      minarva_brand: "Hikvision",
      minarva_market: "Kerala",
    },
    variants: [
      {id: "variant_test_1", sku: "TEST-KIT",
        manage_inventory: true,
        inventory_quantity: 5,
        calculated_price: { currency_code: "inr", calculated_amount: 12900 }},
    ],
  }
  assert.equal(auditCctvPackage(skeleton).ready, false, "No warranty, BOM or box")
  const disapproved = {...skeleton, metadata: {...skeleton.metadata, minarva_sale_approved: false}}
  assert.equal(auditCctvPackage(disapproved).ready, false)
})

test("search index approval field is hidden from query hits", () => {
  const index = read("store/commerce/apps/backend/src/search/product.ts")
  assert.match(index, /sale_approved: search\.boolean\(\)\.filterable\(\)\.retrievable\(false\)/)
  const sdk = read("store/commerce/apps/storefront/src/lib/search-client.ts")
  assert.match(sdk, /path: "\/store\/search"/)
})
