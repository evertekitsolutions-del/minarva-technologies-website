import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"

const root=new URL("../../",import.meta.url)
const read=path=>readFileSync(new URL(path,root),"utf8")
const support="store/commerce/apps/storefront/src/lib/cctv-support.ts"
const api="store/commerce/apps/storefront/src/app/api/cctv-support/route.ts"
const widget="store/commerce/apps/storefront/src/modules/layout/components/cctv-support/index.tsx"

test("free bilingual assistant never invents package price, warranty or delivery charge",()=>{
  const s=read(support)
  assert.match(s,/SupportedLanguage = "ml" \| "en"/)
  assert.match(s,/വാറന്റി/)
  assert.match(s,/ക്യാമറ/)
  assert.match(s,/partial COD|Partial COD/i)
  assert.match(s,/a verified courier quote|verified courier quote/)
  assert.match(s,/generativeAiUsed:false/)
  assert.doesNotMatch(s,/OpenAI|api\.openai\.com|PGCreateOrder|placeOrder\(/)
})
test("catalogue-based product answer must originate in approved published Medusa product",()=>{
  const s=read(support)
  assert.match(s,/p\.status==="published"/)
  assert.match(s,/minarva_sale_approved===true/)
  assert.match(s,/product:\{id:match\.id,title:match\.title,handle:match\.handle\}/)
  const route=read(api)
  assert.match(route,/sdk\.store\.product\.list\(/)
  assert.match(route,/limit:5/)
  assert.match(route,/process\.env\.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY/)
})
test("support route cannot create orders, store chat histories or call paid LLM",()=>{
  const route=read(api)
  assert.match(route,/question\.length>160/)
  assert.match(route,/Cache-Control/)
  assert.doesNotMatch(route,/cookies\(|createOrder\(|completeCart\(|writeFile|INSERT INTO|OPENAI_API_KEY|ANTHROPIC_API_KEY/)
})
test("widget is voluntary, keyboard accessible and WhatsApp is not auto-sent",()=>{
  const ui=read(widget)
  assert.match(ui,/aria-expanded=\{open\}/)
  assert.match(ui,/aria-live="polite"/)
  assert.match(ui,/onSubmit=\{submit\}/)
  assert.match(ui,/https:\/\/wa\.me\/916235353732/)
  assert.match(ui,/No automatic messages/)
  assert.doesNotMatch(ui,/setInterval\(|navigator\.sendBeacon|window\.open\(/)
  const layout=read("store/commerce/apps/storefront/src/app/[countryCode]/(main)/layout.tsx")
  assert.match(layout,/<CctvSupport\s*\/>/)
})
