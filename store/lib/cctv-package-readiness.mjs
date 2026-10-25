/**
 * STORE-020: Read-only CCTV package publishing readiness.
 *
 * Adverts, checkout and AI must never advertise an unverified package.
 * All values must come from a Medusa Product Module export (not example
 * catalogue strings or browser-provided data). No product is auto-published.
 */
import { chargeableWeightGrams } from "./checkout-pricing.mjs"

const integer = (v,min,max) =>
  Number.isSafeInteger(v) && v >= min && v <= max
const label = v => typeof v === "string" && v.trim().length > 0
const positivePrice = v =>
  (typeof v === "number" || typeof v === "string") &&
  /^\d+(?:\.\d{1,2})?$/.test(String(v)) &&
  Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= 100_000_000
const isHttpsAsset = v => {
  if (typeof v !== "string") return false
  try {
    const parsed = new URL(v)
    return parsed.protocol === "https:" && !!parsed.hostname &&
      !["localhost","127.0.0.1"].includes(parsed.hostname)
  } catch { return false }
}
const metadataValue = (metadata,key) => metadata?.[key]

const validateComponents = (raw) => {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 40) return false
  const seen = new Set()
  for (const item of raw) {
    if (!item || typeof item !== "object" || !label(item.name) ||
        !integer(item.quantity,1,10000)) return false
    const name = item.name.trim().toLowerCase()
    if (seen.has(name)) return false
    seen.add(name)
  }
  return true
}

export function auditCctvPackage(product, {countryCode="in"}={}) {
  const errors=[]
  const warnings=[]
  const add = (condition,message) => { if(!condition) errors.push(message) }

  if (!product || typeof product !== "object" || Array.isArray(product)) {
    return Object.freeze({
      id:null,title:"Unknown package",ready:false,
      errors:["Medusa product record missing"],warnings:[],
      variants:[],
    })
  }
  const metadata=product.metadata && typeof product.metadata==="object" &&
    !Array.isArray(product.metadata) ? product.metadata : {}
  add(label(product.id) && /^prod_[A-Za-z0-9_-]+$/.test(product.id),
    "Missing Medusa product identity")
  add(label(product.title), "Product title is missing")
  add(label(product.description) && product.description.trim().length >= 40,
    "Product description is incomplete")
  add(product.status === "published", "Product is not published in Medusa")
  add(metadataValue(metadata,"minarva_sale_approved") === true,
    "Owner-approved sale status is missing")
  add(label(metadataValue(metadata,"minarva_brand")),
    "Camera brand must be confirmed")
  add(metadataValue(metadata,"minarva_market") === "Kerala",
    "Kerala delivery market is not confirmed")
  add(validateComponents(metadataValue(metadata,"minarva_kit_components")),
    "Package BOM requires distinct component names and integer quantities")
  add(integer(metadataValue(metadata,"minarva_camera_warranty_months"),0,120),
    "Camera warranty months have not been verified")
  add(integer(metadataValue(metadata,"minarva_recorder_warranty_months"),0,120),
    "DVR/NVR warranty months have not been verified")
  add(typeof metadataValue(metadata,"minarva_installation_included") === "boolean",
    "Installation inclusion/exclusion must be explicit")
  add(label(metadataValue(metadata,"minarva_returns_policy_ref")),
    "Merchant returns policy reference is required")
  add(label(metadataValue(metadata,"minarva_warranty_terms_ref")),
    "Warranty terms reference is required")
  add(isHttpsAsset(product.thumbnail), "Real product thumbnail HTTPS URL required")

  const weights={
    actualWeightGrams:metadataValue(metadata,"minarva_packed_weight_grams"),
    lengthCm:metadataValue(metadata,"minarva_box_length_cm"),
    breadthCm:metadataValue(metadata,"minarva_box_breadth_cm"),
    heightCm:metadataValue(metadata,"minarva_box_height_cm"),
  }
  const boxValid=integer(weights.actualWeightGrams,1,100_000) &&
    integer(weights.lengthCm,1,300) &&
    integer(weights.breadthCm,1,300) &&
    integer(weights.heightCm,1,300)
  add(boxValid, "Verified packed box weight and all three dimensions are required")
  let chargeableGrams=null
  if(boxValid){
    try{
      chargeableGrams=chargeableWeightGrams(weights).chargeableGrams
    }catch{errors.push("Packing volume/weight cannot be safely calculated")}
  }

  const variants=Array.isArray(product.variants)?product.variants:[]
  add(variants.length>0,"At least one sellable Medusa variant is required")
  const variantResults=variants.map((v,i)=>{
    const problems=[]
    if(!label(v.id) || !String(v.id).startsWith("variant_")) problems.push("Invalid variant identity")
    if(!label(v.sku)) problems.push("Variant SKU is missing")
    if(v.manage_inventory!==true) problems.push("Inventory management must be enabled")
    if(!integer(v.inventory_quantity,0,100_000_000)) problems.push("Verified inventory quantity required")
    else if(v.inventory_quantity===0) problems.push("Out of stock")
    const calculated=v.calculated_price
    if(calculated?.currency_code?.toLowerCase() !== "inr" ||
        !positivePrice(calculated?.calculated_amount)) {
      problems.push("Actual positive INR calculated price is required")
    }
    return Object.freeze({index:i,sku:label(v.sku)?v.sku:null,
      ready:problems.length===0,problems:Object.freeze(problems)})
  })
  if(!variants.length)warnings.push("No variants to check")
  const skuSet=new Set()
  for(const v of variantResults){
    if(v.sku && skuSet.has(v.sku)) errors.push("Duplicate SKU within CCTV package")
    if(v.sku)skuSet.add(v.sku)
  }
  if(variantResults.some(v=>!v.ready))errors.push("One or more variants are not sale-ready")
  if(countryCode!=="in")errors.push("This package was not approved for non-India markets")
  return Object.freeze({
    id:typeof product.id==="string"?product.id:null,
    title:label(product.title)?product.title:"Untitled CCTV package",
    ready:errors.length===0,
    errors:Object.freeze(errors),
    warnings:Object.freeze(warnings),
    variants:Object.freeze(variantResults),
    chargeableGrams,
  })
}

export function auditCatalog(products,{countryCode="in"}={}){
  if(!Array.isArray(products))throw new TypeError("Medusa products must be an array")
  const audited=products.map(p=>auditCctvPackage(p,{countryCode}))
  const skus=new Set()
  const duplicateSkus=new Set()
  for(const item of audited)for(const v of item.variants)if(v.sku){
    if(skus.has(v.sku))duplicateSkus.add(v.sku)
    skus.add(v.sku)
  }
  const eligibleCount=audited.filter(p=>p.ready &&
    p.variants.every(v=>!duplicateSkus.has(v.sku))).length
  return Object.freeze({
    total:audited.length,
    ready:eligibleCount,
    blocked:audited.length-eligibleCount,
    duplicateSkus:Object.freeze([...duplicateSkus]),
    items:Object.freeze(audited),
    eligibleForPublication:audited.length>0 &&
      eligibleCount===audited.length,
  })
}
