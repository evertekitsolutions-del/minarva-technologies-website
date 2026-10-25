import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, root), "utf8")
const front = "store/commerce/apps/storefront/src/"

test("marketing quote page is India/INR only; no false courier or checkout promise", () => {
  const code = read(front + "app/[countryCode]/(main)/cctv-quote/page.tsx")
  assert.match(code, /getRegion\(countryCode\)/)
  assert.match(code, /countryCode !== "in"/)
  assert.match(code, /region\.currency_code !== "inr"/)
  assert.match(code, /notFound\(\)/)
  assert.match(code, /<CctvQuoteWizard source=\{source\} product=\{verifiedProduct\} \/>/)
  assert.doesNotMatch(code, /createOrder\(|placeOrder\(|checkout\(|ShiprocketCreateOrder\(/)
})
test("form collects only site, camera count, installation and Kerala PIN", () => {
  const code = read(front + "modules/lead/components/cctv-quote-wizard/index.tsx")
  for (const fragment of ["setPremise(", "setCameraCount(", "setInstallation(", "setPin(", "inputMode=\"numeric\"", "autoComplete=\"postal-code\"", "aria-live=\"polite\""]) {
    assert.ok(code.includes(fragment), "Missing " + fragment)
  }
  assert.match(code, /isValidDeliveryPin\(pin\)/)
  assert.match(code, /if \(!pinReady\) return null/)
  assert.match(code, /href=\{url\}/)
  assert.match(code, /target="_blank"/)
  assert.match(code, /rel="noopener noreferrer"/)
  // Optional contact fields are now shown ONLY inside the approved CRM form.
  assert.match(code, /\{crmAvailable && \(/)
  assert.match(code, /consentToContact: contactConsent/)
  assert.doesNotMatch(code, /useEffect\(\(\) => fetch\(|sendBeacon|navigator\.geolocation/)
})
test("lead draft contains only safe enums, independently checked PIN, no fake prices", () => {
  const code = read(front + "lib/util/cctv-lead-request.ts")
  assert.match(code, /\^\[1-9\]\[0-9\]\{5\}\$/)
  assert.match(code, /Object\.hasOwn\(PREMISES, input\.premise\)/)
  assert.match(code, /Object\.hasOwn\(INSTALLATION, input\.installation\)/)
  assert.match(code, /normalizeAdSource\(input\.source\)/)
  assert.match(code, /encodeURIComponent\(message\)/)
  assert.match(code, /https:\/\/wa\.me\/916235353732/)
  assert.match(code, /online payment and courier booking are not yet active/)
  assert.doesNotMatch(code, /[₹$]\s*\d{3,}|PGCreateOrder\(|Cashfree\(|fetch\(|POST /)
})
test("marketing campaign channels are bounded rather than passed unfiltered", () => {
  const page = read(front + "app/[countryCode]/(main)/cctv-quote/page.tsx")
  const helper = read(front + "lib/util/cctv-lead-request.ts")
  assert.match(page, /normalizeAdSource\(/)
  assert.match(page, /typeof query\.utm_source === "string"/)
  for (const channel of ["instagram", "facebook", "google", "whatsapp", "direct"]) {
    assert.match(helper, new RegExp('"' + channel + '"'))
  }
  assert.match(helper, /: "other"/)
})
test("storefront homepage advertises the voluntary quote path without enabling sales", () => {
  const hero = read(front + "modules/home/components/hero/index.tsx")
  assert.match(hero, /href="\/cctv-quote"/)
  assert.match(hero, /Get a Verified CCTV Quote/)
  const backend = read("store/commerce/apps/backend/src/api/middlewares.ts")
  assert.match(backend, /publicCheckoutGateFromEnvironment\(\)/)
  assert.match(backend, /Customer cart and checkout are not yet available/)
})
