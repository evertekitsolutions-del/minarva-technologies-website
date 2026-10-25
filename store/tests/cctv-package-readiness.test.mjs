import test from "node:test"
import assert from "node:assert/strict"
import {auditCctvPackage,auditCatalog} from "../lib/cctv-package-readiness.mjs"

const good=()=>({
  id:"prod_mock_only_001",
  title:"TEST ONLY CCTV Kit — not a public offer",
  description:"Synthetic automated test product. This is not a real price, stock or warranty offer.",
  status:"published",
  thumbnail:"https://example.invalid/test-only-thumbnail.jpg",
  metadata:{
    minarva_sale_approved:true,
    minarva_brand:"Hikvision",
    minarva_market:"Kerala",
    minarva_kit_components:[
      {name:"Camera",quantity:4},
      {name:"Recorder",quantity:1},
      {name:"Cable",quantity:60},
    ],
    minarva_camera_warranty_months:24,
    minarva_recorder_warranty_months:24,
    minarva_installation_included:false,
    minarva_returns_policy_ref:"internal-test-returns-policy",
    minarva_warranty_terms_ref:"internal-test-warranty-policy",
    minarva_packed_weight_grams:3500,
    minarva_box_length_cm:35,
    minarva_box_breadth_cm:25,
    minarva_box_height_cm:20,
  },
  variants:[{
    id:"variant_test_001",
    sku:"TEST-ONLY-KIT-0001",
    manage_inventory:true,
    inventory_quantity:5,
    calculated_price:{currency_code:"inr",calculated_amount:12900},
  }],
})
test("complete synthetic Medusa product produces validated warehouse packing weight",()=>{
  const p=auditCctvPackage(good())
  assert.equal(p.ready,true)
  assert.equal(p.chargeableGrams,3500)
  assert.equal(p.variants[0].ready,true)
  assert.equal(p.errors.length,0)
  assert(Object.isFrozen(p))
})
test("missing stock, false infinite inventory, missing INR amount deny sale readiness",()=>{
  const changes=[
    {inventory_quantity:0},
    {inventory_quantity:undefined},
    {manage_inventory:false},
    {calculated_price:{currency_code:"usd",calculated_amount:12900}},
    {calculated_price:{currency_code:"inr",calculated_amount:null}},
    {calculated_price:{currency_code:"inr",calculated_amount:-1}},
    {sku:""},
  ]
  for(const variant of changes){
    const p=good();p.variants[0]={...p.variants[0],...variant}
    assert.equal(auditCctvPackage(p).ready,false,JSON.stringify(variant))
  }
})
test("unverified price, image, warranty and consent missing block publication",()=>{
  for(const [field,value] of [
    ["minarva_sale_approved",false],["minarva_market","Oman"],
    ["minarva_brand",""],["minarva_camera_warranty_months",undefined],
    ["minarva_installation_included","no"],
    ["minarva_returns_policy_ref",""],
    ["minarva_packed_weight_grams",0],
    ["minarva_box_length_cm",0],
  ]){
    const p=good();p.metadata[field]=value
    assert.equal(auditCctvPackage(p).ready,false,field)
  }
  const p=good();p.thumbnail="http://localhost/fake.png"
  assert.equal(auditCctvPackage(p).ready,false)
})
test("reject incomplete/duplicate BOM and unsafe box geometry",()=>{
  const p=good();p.metadata.minarva_kit_components=[
    {name:"Camera",quantity:1},{name:"camera",quantity:4}]
  assert.equal(auditCctvPackage(p).ready,false)
  p.metadata.minarva_kit_components=[{name:"Camera",quantity:1.5},{name:"Recorder",quantity:1}]
  assert.equal(auditCctvPackage(p).ready,false)
  p.metadata.minarva_kit_components=good().metadata.minarva_kit_components
  p.metadata.minarva_box_length_cm=10000
  p.metadata.minarva_box_height_cm=10000
  p.metadata.minarva_box_breadth_cm=10000
  assert.equal(auditCctvPackage(p).ready,false)
})
test("unknown/Missing Medusa identity never presents a package for sale",()=>{
  assert.equal(auditCctvPackage(null).ready,false)
  assert.equal(auditCctvPackage({}).ready,false)
  assert.equal(auditCctvPackage(good(),{countryCode:"om"}).ready,false)
})
test("duplicate SKU across products blocks BOTH packages",()=>{
  const a=good(),b=good();b.id="prod_mock_only_002"
  const r=auditCatalog([a,b])
  assert.equal(r.total,2)
  assert.equal(r.ready,0)
  assert.equal(r.blocked,2)
  assert.deepEqual(r.duplicateSkus,["TEST-ONLY-KIT-0001"])
  assert.equal(r.eligibleForPublication,false)
})
test("empty catalog is never launch ready and unknown inputs are rejected",()=>{
  assert.equal(auditCatalog([]).eligibleForPublication,false)
  assert.throws(()=>auditCatalog({}),/array/)
})
test("published but incomplete package remains excluded from readiness",()=>{
  const a=good(), b=good();b.id="prod_mock_only_002"
  b.variants[0].sku="TEST-ONLY-KIT-0002"
  b.metadata.minarva_installation_included=null
  const r=auditCatalog([a,b])
  assert.equal(r.total,2)
  assert.equal(r.ready,1)
  assert.equal(r.blocked,1)
  assert.equal(r.eligibleForPublication,false)
})
