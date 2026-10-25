import type { HttpTypes } from "@medusajs/types"

/**
 * Storefront presentation counterpart to the strict offline operator audit:
 * refuse price/stock/Buy affordances for unapproved or incomplete packages.
 * This is NOT the financial authority: Medusa server-side checkout is separately
 * locked until fully approved and merchant launch is explicitly authorised.
 */
type Product = HttpTypes.StoreProduct
const positiveInt = (n: unknown, max=100000000): n is number =>
  typeof n==="number" && Number.isSafeInteger(n) && n>0 && n<=max
const clean = (s: unknown): s is string =>
  typeof s==="string" && s.trim().length>0
const validBom = (components: unknown): boolean =>
  Array.isArray(components) && components.length>=2 &&
  components.length<=40 && components.every(c=>
    c && typeof c==="object" && clean(c.name) &&
    positiveInt(c.quantity,10000))

/**
 * This only controls what is shown to potential buyers. It does not accept
 * browser-supplied price, stock or approval for an actual sale.
 */
export function hasApprovedCctvOffer(product: Product | null | undefined): boolean {
  if (!product || product.status!=="published") return false
  const metadata=product.metadata
  if (!metadata || metadata.minarva_sale_approved!==true ||
      metadata.minarva_market!=="Kerala" ||
      !clean(metadata.minarva_brand) ||
      !validBom(metadata.minarva_kit_components) ||
      !Number.isSafeInteger(metadata.minarva_camera_warranty_months) ||
      !Number.isSafeInteger(metadata.minarva_recorder_warranty_months) ||
      typeof metadata.minarva_installation_included!=="boolean" ||
      !clean(metadata.minarva_returns_policy_ref) ||
      !clean(metadata.minarva_warranty_terms_ref) ||
      !positiveInt(metadata.minarva_packed_weight_grams,100000) ||
      !positiveInt(metadata.minarva_box_length_cm,300) ||
      !positiveInt(metadata.minarva_box_breadth_cm,300) ||
      !positiveInt(metadata.minarva_box_height_cm,300) ||
      !clean(product.thumbnail)) {
    return false
  }
  const variants=product.variants
  if(!Array.isArray(variants) || !variants.length)return false
  const skus=new Set<string>()
  for(const v of variants){
    if(!clean(v.id) || !clean(v.sku) ||
       v.manage_inventory!==true ||
       !positiveInt(v.inventory_quantity) ||
       v.calculated_price?.currency_code?.toLowerCase()!=="inr" ||
       !Number.isFinite(v.calculated_price?.calculated_amount) ||
       !(v.calculated_price?.calculated_amount!>0) ||
       skus.has(v.sku))return false
    skus.add(v.sku)
  }
  return true
}

/**
 * Only an approved local sandbox may test Buy buttons. Real production
 * checkout is still deliberately disabled by the Medusa backend guard.
 */
export const canUseStorefrontTestCart = (): boolean =>
  process.env.NODE_ENV!=="production" &&
  process.env.NEXT_PUBLIC_STORE_CART_TEST_ENABLED==="true" &&
  process.env.NEXT_PUBLIC_STORE_CART_TEST_APPROVED==="true"
