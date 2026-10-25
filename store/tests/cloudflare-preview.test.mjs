import test from "node:test"
import assert from "node:assert/strict"
import worker from "../preview/cloudflare-worker.mjs"

const view = async (path) => {
  const res=await worker.fetch(new Request("https://preview.example.test"+path))
  return {status:res.status,headers:res.headers,body:await res.text()}
}
test("preview has honest labeling and mobile layout",async()=>{
  const r=await view("/in")
  assert.equal(r.status,200)
  assert.match(r.body,/VISUAL PREVIEW ONLY/)
  assert.match(r.body,/NOT LIVE E-COMMERCE/)
  assert.match(r.body,/Minarva CCTV Store/)
  assert.match(r.body,/@media\(max-width:640px\)/)
  assert.match(r.body,/<meta name="viewport"/)
  assert.equal(r.headers.get("X-Robots-Tag"),"noindex,nofollow")
})
test("catalog displays illustrative categories not real offers",async()=>{
  const r=await view("/in/store")
  assert.equal(r.status,200)
  assert.match(r.body,/2 Camera Package Layout/)
  assert.match(r.body,/4 Camera Package Layout/)
  assert.match(r.body,/8 Camera Package Layout/)
  assert.match(r.body,/not verified product listings/)
  assert.match(r.body,/Price on verified enquiry/)
  assert.doesNotMatch(r.body,/₹\s*\d+|payment_session_id|customer_token|CASHFREE_SANDBOX_CLIENT_SECRET/)
})
test("quotation form opens voluntary WhatsApp draft only after valid PIN",async()=>{
  const r=await view("/in/cctv-quote")
  assert.equal(r.status,200)
  assert.match(r.body,/id="quote-submit" class="primary" type="button" disabled/)
  assert.match(r.body,/id="pin" inputmode="numeric"/)
  assert.match(r.body,/https:\/\/wa\.me\/916235353732\?text=/)
  assert.match(r.body,/go\.disabled=!ok/)
  assert.match(r.body,/replace\(\/\\D\/g/)
  assert.match(r.body,/Only you decide whether to send/)
  assert.doesNotMatch(r.body,/<form[^>]*method="post"|<input[^>]*type="password"|<input[^>]*type="tel"/)
})
test("non-GET requests and unknown pages cannot create orders",async()=>{
  for(const method of ["POST","PATCH","DELETE","PUT"]){
    const response=await worker.fetch(new Request("https://preview.example.test/in/cctv-quote",{method}))
    assert.equal(response.status,405)
  }
  assert.equal((await view("/api/checkout")).status,404)
  assert.equal((await view("/admin")).status,404)
  assert.equal((await view("/in/cart")).status,404)
})
test("preview has no cloud API or lead persistence endpoints",async()=>{
  const r=await view("/in")
  assert.match(r.headers.get("Content-Security-Policy"),/connect-src 'none'/)
  assert.match(r.headers.get("Content-Security-Policy"),/form-action 'none'/)
  assert.match(r.body,/No personal details are saved here/)
  assert.doesNotMatch(r.body,/data-supabase-key|createClient\(|localStorage\.setItem|navigator\.sendBeacon|fetch\("/)
})