#!/usr/bin/env node
/**
 * Read-only catalogue quality audit against a trusted Medusa Product export.
 * Usage: node store/scripts/audit-catalog.mjs /absolute/path/to/products.json
 * Never runs Medusa Admin mutations or publishes a SKU.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { auditCatalog } from "../lib/cctv-package-readiness.mjs"

const pathname=process.argv[2]
if(!pathname){
  console.error("Usage: node store/scripts/audit-catalog.mjs <Medusa-products-export.json>")
  process.exitCode=2
}else{
  try{
    const file=resolve(pathname)
    const parsed=JSON.parse(readFileSync(file,"utf8"))
    const products=Array.isArray(parsed)?parsed:parsed?.products
    const audit=auditCatalog(products)
    console.log(JSON.stringify({
      ready:audit.eligibleForPublication,
      productsReviewed:audit.total,
      saleReady:audit.ready,
      blocked:audit.blocked,
      duplicateSkus:audit.duplicateSkus,
      items:audit.items.map(p=>({
        id:p.id,title:p.title,ready:p.ready,errors:p.errors,
        variants:p.variants.filter(v=>!v.ready).map(v=>({
          sku:v.sku,problems:v.problems,
        })),
      })),
    },null,2))
    process.exitCode=audit.eligibleForPublication?0:1
  }catch(e){
    console.error("Catalogue readiness audit failed:",e?.message??"unknown error")
    process.exitCode=2
  }
}
