import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const config = JSON.parse(readFileSync(new URL("../../vercel.json",import.meta.url),"utf8"))
const rules = config.rewrites ?? []
const store = (r) => Array.isArray(r.has) && r.has.some(h =>
  h.type === "host" && h.value === "store.minarvatechnologies.com")

test("store subdomain is isolated to exact host in existing Vercel project", () => {
  assert(rules.length >= 2)
  assert(rules.every(store))
  assert(rules.some(r => r.source === "/" && r.destination === "/store/live/index"))
  assert(rules.some(r => r.source === "/in" && r.destination === "/store/live/index"))
  assert(!rules.some(r => /minarvatechnologies.com/.test(r.destination)))
})

test("main business website and www are never rewritten", () => {
  assert(rules.every(r => !r.has.some(h => ["www.minarvatechnologies.com",
    "minarvatechnologies.com"].includes(h.value))))
  assert(!rules.some(r => r.source === "/(.*)" || r.source === "/:path*"))
})

test("production domain routes to genuine tracked live store source", () => {
  const html = readFileSync(new URL("../live/index.html",import.meta.url),"utf8")
  assert.match(html, /Minarva CCTV Store/)
  assert.match(html, /916235353732/)
  assert.match(html, /verified|quotation/i)
  assert.doesNotMatch(html, /fake checkout|demo gateway|fake purchase/i)
})

test("site security headers and current www website remain in place", () => {
  assert.equal(config.cleanUrls,true)
  assert(config.headers.some(r => r.headers.some(h =>
    h.key === "Content-Security-Policy")))
  const original = readFileSync(new URL("../../index.html",import.meta.url),"utf8")
  assert.match(original,/Minarva Technologies/)
})
