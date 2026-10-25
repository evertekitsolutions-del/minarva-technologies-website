import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const root = new URL("../../", import.meta.url)
const read = path => readFileSync(new URL(path,root),"utf8")
const front = "store/commerce/apps/storefront/src/"

test("existing Minarva website Edge API owns CRM inserts, quota and contact-consent checks",()=>{
  const edge=read("supabase/functions/public-enquiry-submit/index.ts")
  assert.match(edge, /"https:\/\/store\.minarvatechnologies\.com"/)
  assert.match(edge, /ALLOWED_ORIGINS\.has\(origin\)/)
  assert.doesNotMatch(edge, /"Access-Control-Allow-Origin":\s*"\*"/)
  assert.match(edge, /body\.consent_to_contact!==true/)
  assert.match(edge, /consume_public_enquiry_quota/)
  assert.match(edge, /submit_public_enquiry/)
  assert.match(edge, /if\(honeypot\)/)
  assert.match(edge, /ageMs<1200/)
  assert.match(edge, /"CCTV & Security Systems"/)
})

test("CRM browser transport uses only public publishable key after independent consent opt-ins",()=>{
  const code=read(front+"lib/util/cctv-crm-enquiry.ts")
  assert.match(code, /NEXT_PUBLIC_STORE_CRM_ENQUIRY_ENABLED === "true"/)
  assert.match(code, /NEXT_PUBLIC_STORE_CRM_ENQUIRY_APPROVED === "true"/)
  assert.match(code, /startsWith\(\s*"sb_publishable_"/)
  assert.match(code, /"https:\/\/kwullzwhlzziosjsejud\.supabase\.co\/functions\/v1\/public-enquiry-submit"/)
  assert.match(code, /method: "POST"/)
  assert.match(code, /credentials: "omit"/)
  assert.match(code, /mode: "cors"/)
  assert.match(code, /apikey: key/)
  assert.match(code, /response\.status === 429/)
  assert.match(code, /result\.accepted !== true/)
  assert.doesNotMatch(code, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|createClient\(|admin\.rpc|\.from\("enquiries"\)/)
})

test("input contract matches existing Edge service, anti-bot and timing requirements",()=>{
  const code=read(front+"lib/util/cctv-crm-enquiry.ts")
  assert.match(code, /"CCTV & Security Systems"/)
  assert.match(code, /contact\.consentToContact !== true/)
  assert.match(code, /contact\.formStartedAt/)
  assert.match(code, /company_website:/)
  assert.match(code, /form_started_at:/)
  assert.match(code, /consent_to_contact: true/)
  assert.match(code, /digits\.length < 7 \|\| digits\.length > 15/)
  assert.match(code, /email\.length > 320/)
  assert.match(code, /isValidDeliveryPin\(request\.deliveryPincode\)/)
  assert.match(code, /normalizeAdSource\(request\.source\)/)
})

test("CRM UI requires manually checked contact-only consent, never prechecks or autoruns",()=>{
  const ui=read(front+"modules/lead/components/cctv-quote-wizard/index.tsx")
  assert.match(ui, /const \[contactConsent, setContactConsent\] = useState\(false\)/)
  assert.match(ui, /const \[saved, setSaved\] = useState\(false\)/)
  assert.match(ui, /onSubmit=\{submitToCrm\}/)
  assert.match(ui, /!crmAvailable \|\| !pinReady \|\| !contactConsent/)
  assert.match(ui, /submitConsentedCctvCrmEnquiry\(/)
  assert.match(ui, /companyWebsite/)
  assert.match(ui, /minarvatechnologies\.com\/privacy/)
  assert.match(ui, /not consenting to promotional campaigns or/)
  assert.match(ui, /role="status" aria-live="polite"/)
  assert.match(ui, /Enquiry saved with Minarva Technologies/)
  assert.match(ui, /Request quotation on WhatsApp/)
  assert.doesNotMatch(ui, /autoFocus|setInterval\(|navigator\.sendBeacon|window\.location\.replace|automatedCalls/)
})

test("CRM is default-off and does not mutate merchant production database in CI",()=>{
  const config=read("store/commerce/apps/storefront/.env.template")
  assert.match(config, /^NEXT_PUBLIC_STORE_CRM_ENQUIRY_ENABLED=false$/m)
  assert.match(config, /^NEXT_PUBLIC_STORE_CRM_ENQUIRY_APPROVED=false$/m)
  assert.match(config, /^NEXT_PUBLIC_STORE_CRM_PUBLISHABLE_KEY=$/m)
  assert.doesNotMatch(config, /sb_secret_|SUPABASE_SERVICE_ROLE_KEY=.+/m)
  const helper=read(front+"lib/util/cctv-crm-enquiry.ts")
  assert.doesNotMatch(helper, /\bINSERT INTO\b|db:migrate|\.insert\(|sendWhatsApp\(/)
})
