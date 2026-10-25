import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const root = new URL("../../", import.meta.url)
const read = path => readFileSync(new URL(path, root), "utf8")

test("WhatsApp quotation context uses only safe Medusa kit fields and URI encoding", () => {
  const source = read("store/commerce/apps/storefront/src/lib/util/cctv-quote-link.ts")
  assert.match(source,/Pick<HttpTypes\.StoreProduct, "title" \| "handle">/)
  assert.match(source,/Pick<HttpTypes\.StoreProductVariant, "sku">/)
  assert.match(source,/encodeURIComponent\(lines\.join\("\\n"\)\)/)
  assert.match(source,/replace\(\/\[\\u0000-\\u001f\\u007f\]\//)
  assert.match(source,/businessWhatsApp = "916235353732"/)
})
test("quotation clearly requests verified INR price, installation, warranty, delivery", () => {
  const source=read("store/commerce/apps/storefront/src/lib/util/cctv-quote-link.ts")
  assert.match(source,/confirmed|verified CCTV package quotation/i)
  assert.match(source,/latest INR price and stock/)
  assert.match(source,/camera\/recorder warranty terms, installation charges/)
  assert.match(source,/final delivery charge for my PIN code/)
  assert.match(source,/online payment and courier booking are not enabled yet/)
  assert.doesNotMatch(source,/₹\s*\d+|cashfree\.checkout|PGCreateOrder/)
})
test("customer initiates conversation; no automatic outreach or contact uploads", () => {
  const source=read("store/commerce/apps/storefront/src/lib/util/cctv-quote-link.ts")
  assert.doesNotMatch(source,/fetch\(|sendMessage\(|axios\(|setInterval\(|navigator\.sendBeacon/)
  const actions=read("store/commerce/apps/storefront/src/modules/products/components/product-actions/index.tsx")
  assert.match(actions,/buildCctvQuoteLink\(\{ product, variant: selectedVariant \}\)/)
  assert.match(actions,/target="_blank"/)
  assert.match(actions,/rel="noopener noreferrer"/)
  assert.match(actions,/onSubmit=\{handleSubmit\}/)
})
