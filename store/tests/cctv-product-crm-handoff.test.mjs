import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)
const read = path => readFileSync(new URL(path, root), "utf8")
const client = "store/commerce/apps/storefront/src/"

test("product-to-CRM route is server resolved against approved Medusa catalogue", () => {
  const page = read(client+"app/[countryCode]/(main)/cctv-quote/page.tsx")
  assert.match(page, /requestedHandle/)
  assert.match(page, /\^\[a-z0-9-\]\{3,100\}\$/)
  assert.match(page, /listProducts\(\{/)
  assert.match(page, /countryCode: "in"/)
  assert.match(page, /product\.handle === requestedHandle && hasApprovedCctvOffer\(product\)/)
  assert.match(page, /variant\.id === requestedVariant/)
  assert.match(page, /if \(match\)/)
  assert.match(page, /verifiedProduct = undefined/)
  assert.match(page, /<CctvQuoteWizard source=\{source\} product=\{verifiedProduct\} \/>/)
  assert.doesNotMatch(page, /\.insert\(|createOrder\(|payment|shippingRatePaise/)
})

test("selected variant and product are only used as information in consented CRM leads", () => {
  const c = read(client+"lib/util/cctv-crm-enquiry.ts")
  assert.match(c, /validQuoteProductReference\(product\)/)
  assert.match(c, /"Selected package: "/)
  assert.match(c, /"Variant SKU: "/)
  assert.match(c, /consent_to_contact: true/)
  assert.match(c, /submitConsentedCctvCrmEnquiry/)
  assert.match(c, /makeCctvCrmEnquiry\(request, contact, product\)/)
  assert.doesNotMatch(c, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|admin\.rpc|\.insert\(/)
})

test("WhatsApp quote includes only bounded known product reference and no prices", () => {
  const c = read(client+"lib/util/cctv-lead-request.ts")
  assert.match(c, /export type VerifiedCctvQuoteProduct/)
  assert.match(c, /validQuoteProductReference\(product\)/)
  assert.match(c, /product\.title\.trim\(\)\.replace\(/)
  assert.match(c, /"Product ref: "/)
  assert.match(c, /"Variant SKU: "/)
  assert.match(c, /encodeURIComponent\(message\)/)
  assert.doesNotMatch(c, /calculated_amount|₹\s*\d{2,}|price_paise/)
})

test("product page links to same opt-in CRM form without placing PII in URL", () => {
  const c = read(client+"modules/products/components/product-actions/index.tsx")
  assert.match(c, /offerApproved && product\.handle/)
  assert.match(c, /\/cctv-quote\?product=/)
  assert.match(c, /encodeURIComponent\(product\.handle\)/)
  assert.match(c, /encodeURIComponent\(selectedVariant\?\.id \?\? ""\)/)
  assert.match(c, /Request this package through Minarva CRM/)
  assert.doesNotMatch(c, /contactName.*href|customerPhone.*href|customerEmail.*href/)
})

test("campaign form never saves product data or contacts without explicit consent", () => {
  const c = read(client+"modules/lead/components/cctv-quote-wizard/index.tsx")
  assert.match(c, /const \[contactConsent, setContactConsent\] = useState\(false\)/)
  assert.match(c, /!crmAvailable \|\| !pinReady \|\| !contactConsent/)
  assert.match(c, /onSubmit=\{submitToCrm\}/)
  assert.match(c, /submitConsentedCctvCrmEnquiry\(\{/)
  assert.match(c, /product,/)
  assert.match(c, /buildCctvLeadWhatsAppUrl\(\{/)
  assert.match(c, /}, product\)/)
  assert.match(c, /not a confirmed quotation/)
  assert.doesNotMatch(c, /useEffect\(\(\).*submitConsented|fetch\(.*POST/)
})
