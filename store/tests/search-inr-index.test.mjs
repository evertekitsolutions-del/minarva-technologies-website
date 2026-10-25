import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const base = new URL("../../", import.meta.url)
const read = path => readFileSync(new URL(path, base), "utf8")

test("Medusa search index loads INR using real Pricing Module context", () => {
  const pricing = read("store/commerce/apps/backend/src/search/helpers/pricing.ts")
  const index = read("store/commerce/apps/backend/src/search/product.ts")
  assert.match(pricing, /PRICE_CURRENCIES = \["inr", "eur", "usd"\]/)
  assert.match(pricing, /QueryContext\(\{ currency_code: currency \}\)/)
  assert.match(pricing, /search\.float\(\)/)
  assert.match(index, /\.\.\.priceFields/)
})

test("Next.js search index and Medusa backend agree on INR price attributes", () => {
  const frontend = read("store/commerce/apps/storefront/src/lib/search-client.ts")
  assert.match(frontend, /SEARCH_PRICE_CURRENCIES = \["inr", "eur", "usd"\]/)
  assert.match(frontend, /priceAttribute = /)
  assert.match(frontend, /numericAttributes: SEARCH_PRICE_CURRENCIES\.flatMap/)
  const ui = read("store/commerce/apps/storefront/src/modules/store/components/store-hits/price.tsx")
  assert.match(ui, /priceAttribute\("min_price", currencyCode\)/)
  assert.match(ui, /indexedCurrency\(currencyCode\)/)
})

test("INR search prices must never be displayed as unrelated EUR fallback", () => {
  const frontend = read("store/commerce/apps/storefront/src/lib/search-client.ts")
  assert.match(frontend, /currencyCode\.toLowerCase\(\)/)
  assert.doesNotMatch(frontend, /SEARCH_PRICE_CURRENCIES\[0\]/)
  assert.match(frontend, /NEVER use another region's currency/)
})

test("price sorting and INR facet slider consume configured currency-specific fields", () => {
  const attributes=read("store/commerce/apps/storefront/src/modules/store/components/store-refinements/attributes.ts")
  const range=read("store/commerce/apps/storefront/src/modules/store/components/store-refinements/price-range.tsx")
  assert.match(attributes, /priceAttribute\("min_price", currencyCode\)/)
  assert.match(range, /attribute: priceAttribute\("min_price", currencyCode\)/)
})
