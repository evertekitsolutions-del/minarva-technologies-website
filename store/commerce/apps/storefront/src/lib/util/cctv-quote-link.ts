import type { HttpTypes } from "@medusajs/types"

/**
 * Minarva customer-initiated quote handoff, no lead harvesting and no
 * automated WhatsApp delivery. We send neither guessed prices nor warranty.
 */
const businessWhatsApp = "916235353732"
const clean = (value: unknown, max: number): string =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ").trim().slice(0, max)
    : ""

export function buildCctvQuoteLink({
  product,
  variant,
}: {
  product: Pick<HttpTypes.StoreProduct, "title" | "handle">
  variant?: Pick<HttpTypes.StoreProductVariant, "sku"> | null
}): string {
  const title = clean(product.title, 100) || "CCTV camera package"
  const sku = clean(variant?.sku, 48)
  const handle = clean(product.handle, 100)
  const lines = [
    "Hello Minarva Technologies,",
    "I would like a verified CCTV package quotation.",
    "Package: " + title,
    ...(sku ? ["Reference SKU: " + sku] : []),
    ...(handle ? ["Catalogue reference: " + handle] : []),
    "Please confirm exact kit contents, latest INR price and stock,",
    "camera/recorder warranty terms, installation charges,",
    "and courier availability and final delivery charge for my PIN code.",
    "I understand online payment and courier booking are not enabled yet.",
  ]
  return "https://wa.me/" + businessWhatsApp +
    "?text=" + encodeURIComponent(lines.join("\n"))
}
