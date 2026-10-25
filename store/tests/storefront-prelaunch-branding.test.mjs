import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
const base=new URL("../../",import.meta.url)
const read=path=>readFileSync(new URL(path,base),"utf8")
const root="store/commerce/apps/storefront/src/"
test("SEO defaults to noindex until BOTH independently approved production flags",()=>{
  const src=read(root+"app/layout.tsx")
  assert.match(src,/STORE_SEO_RELEASE_ENABLED === "true"/)
  assert.match(src,/STORE_SEO_RELEASE_APPROVED === "true"/)
  assert.match(src,/process\.env\.NODE_ENV === "production"/)
  assert.match(src,/index: seoReleaseApproved/)
  assert.match(src,/follow: seoReleaseApproved/)
  assert.match(src,/Minarva CCTV Store/)
})
test("main storefront visibly warns online payment and courier checkout unavailable",()=>{
  const page=read(root+"app/[countryCode]/(main)/layout.tsx")
  assert.match(page,/role="status"/)
  assert.match(page,/Ordering, online payments and courier booking are not enabled yet/)
})
test("no starter brand/terms claims in menu, footer or published policy placeholders",()=>{
  const footer=read(root+"modules/layout/templates/footer/index.tsx")
  const menu=read(root+"modules/layout/components/side-menu/index.tsx")
  const policy=read(root+"modules/policies/templates/index.tsx")
  assert.doesNotMatch(footer,/<MedusaCTA\s*\/>|>Medusa<|<MedusaCTA/)
  assert.doesNotMatch(menu,/Medusa Store/)
  assert.doesNotMatch(policy,/placeholder content from the Medusa starter/)
  assert.match(footer,/Thiruvananthapuram/)
  assert.match(footer,/tel:\+916235353732/)
})
test("legal/policy pages do not promise non-existent order email or paid checkout",()=>{
  const terms=read(root+"app/[countryCode]/(main)/terms/page.tsx")
  const privacy=read(root+"app/[countryCode]/(main)/privacy/page.tsx")
  const contact=read(root+"app/[countryCode]/(main)/contact/page.tsx")
  assert.doesNotMatch(terms,/Orders are confirmed by email/)
  assert.doesNotMatch(terms,/By placing an order with/)
  assert.match(terms,/terms, GST, warranty exclusions/)
  assert.doesNotMatch(privacy,/Payment details are handled by our payment provider/)
  assert.match(contact,/mailto:minarvatechnologies@gmail.com/)
  assert.match(contact,/Thiruvananthapuram/)
})
test("original open source upstream license stays in the repo",()=>{
  const license=read("store/commerce/LICENSE")
  assert.match(license,/MIT License/i)
})
