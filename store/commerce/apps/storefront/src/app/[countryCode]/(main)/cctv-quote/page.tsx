import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getRegion } from "@lib/data/regions"
import { listProducts } from "@lib/data/products"
import { hasApprovedCctvOffer } from "@lib/util/cctv-public-offer"
import type { VerifiedCctvQuoteProduct } from "@lib/util/cctv-lead-request"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CctvQuoteWizard from "@modules/lead/components/cctv-quote-wizard"
import { normalizeAdSource } from "@lib/util/cctv-lead-request"

export const metadata: Metadata = {
  title: "CCTV Package Quotation | Minarva Technologies",
  description:
    "Request a CCTV camera package quotation for Kerala. Confirm kit components, installation, warranty and courier charges with Minarva Technologies.",
}

export default async function QuoteLanding({
  params,
  searchParams,
}: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ utm_source?: string | string[]; product?: string | string[]; variant?: string | string[] }>
}) {
  const { countryCode } = await params
  const region = await getRegion(countryCode)
  if (!region || countryCode !== "in" || region.currency_code !== "inr") {
    notFound()
  }
  const query = await searchParams
  const source = normalizeAdSource(
    typeof query.utm_source === "string" ? query.utm_source : null
  )

  // Only Medusa's approved store catalogue can assign product context to a
  // lead. A user-editable URL cannot invent SKUs, price, stock or approval.
  const requestedHandle = typeof query.product === "string" &&
    /^[a-z0-9-]{3,100}$/.test(query.product) ? query.product : null
  const requestedVariant = typeof query.variant === "string" &&
    /^variant_[A-Za-z0-9_-]{4,100}$/.test(query.variant) ? query.variant : null
  let verifiedProduct: VerifiedCctvQuoteProduct | undefined
  if (requestedHandle) {
    try {
      const { response } = await listProducts({
        countryCode: "in",
        queryParams: { handle: requestedHandle, limit: 1 },
      })
      const match = response.products.find(product =>
        product.handle === requestedHandle && hasApprovedCctvOffer(product)
      )
      if (match) {
        const option = match.variants?.find(variant =>
          variant.id === requestedVariant
        )
        verifiedProduct = {
          title: match.title,
          handle: match.handle,
          ...(option?.sku ? { variantSku: option.sku } : {}),
        }
      }
    } catch {
      // Missing backend product must degrade to generic enquiry, not fabricate
      // a product or expose metadata obtained from URL parameters.
      verifiedProduct = undefined
    }
  }

  return (
    <main className="content-container py-10 small:py-16">
      <header className="mx-auto mb-8 max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-ui-fg-muted">
          Minarva Technologies · Thiruvananthapuram
        </p>
        <h1 className="mt-3 text-3xl font-semibold small:text-4xl">
          CCTV Packages for Kerala
        </h1>
        <p className="mt-3 leading-relaxed text-ui-fg-subtle">
          Tell us what you need. Get a confirmed package quotation without
          guessing prices, delivery charges or installation costs.
        </p>
        <p lang="ml" className="mt-2 text-sm text-ui-fg-subtle">
          കേരളത്തിലുടനീളമുള്ള CCTV പാക്കേജുകൾക്കായി വിവരങ്ങൾ നൽകൂ.
          സ്ഥിരീകരിച്ച വിലയും വാറന്റിയും ഡെലിവറി ചാർജും അറിയാം.
        </p>
      </header>
      <CctvQuoteWizard source={source} product={verifiedProduct} />
      <p className="mt-8 text-center text-sm text-ui-fg-subtle">
        Prefer to browse?{" "}
        <LocalizedClientLink href="/store" className="font-semibold underline">
          Explore available camera packages
        </LocalizedClientLink>
      </p>
    </main>
  )
}
