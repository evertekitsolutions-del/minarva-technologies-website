import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const base = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, base), "utf8")
const prefix = "store/commerce/apps/storefront/src/"

test("store uses authoritative business identity and India region", () => {
  const site = read(prefix + "lib/util/site.ts")
  assert.match(site, /STORE_NAME = "Minarva Technologies CCTV Store"/)
  assert.match(site, /\|\| "in"/)
  assert.doesNotMatch(site, /"Medusa Store"/)
})

test("homepage has honest kit and delivery disclaimers, not dummy products", () => {
  const hero = read(prefix + "modules/home/components/hero/index.tsx")
  assert.match(hero, /CCTV Camera Packages for Homes & Businesses/)
  assert.match(hero, /PIN code/)
  assert.match(hero, /Installation is not included unless/)
  assert.match(hero, /\/store/)
  assert.match(hero, /wa\.me\/916235353732/)
  assert.doesNotMatch(hero, /Ecommerce Starter Template|Guaranteed delivery|[₹$]\s*12,?900/)
})

test("main product page metadata is no longer generic Medusa template", () => {
  const page = read(prefix + "app/[countryCode]/(main)/page.tsx")
  assert.match(page, /STORE_NAME/)
  assert.match(page, /Thiruvananthapuram/)
  assert.doesNotMatch(page, /Medusa Next\.js Starter Template/)
})

test("catalogue and navigation retain prebuilt Medusa product/cart flow", () => {
  const catalog = read(prefix + "app/[countryCode]/(main)/store/page.tsx")
  const nav = read(prefix + "modules/layout/templates/nav/index.tsx")
  assert.match(catalog, /StoreTemplate/)
  assert.match(nav, /CartButton/)
  assert.match(nav, /SideMenu/)
  assert.match(nav, /Minarva CCTV Store/)
})

test("business phone and email are displayed on the customer footer", () => {
  const footer = read(prefix + "modules/layout/templates/footer/index.tsx")
  assert.match(footer, /\+91 6235353732/)
  assert.match(footer, /minarvatechnologies@gmail\.com/)
  assert.match(footer, /Minarva CCTV Store/)
  assert.match(footer, /Shipping information|Return policy/)
})
