import { Metadata } from "next"

import { getStorePolicies } from "@lib/data/store-policies"
import { merchantPolicyPublicationApproved } from "@lib/util/merchant-policy-release"
import {
  PoliciesUnavailable,
  PolicyPage,
  ShippingSummary,
} from "@modules/policies/templates"

export const dynamic = "force-static"
export const revalidate = 60

export const metadata: Metadata = {
  title: "Shipping information",
  description: "Shipping rates and delivery times.",
}

export default async function ShippingPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const approved = merchantPolicyPublicationApproved()
  const { current, currencyCode } = approved
    ? await getStorePolicies(countryCode)
    : { current: null, currencyCode: "" }

  return (
    <PolicyPage title="Shipping information">
      {current ? (
        <>
          <p>
            These published {countryCode.toUpperCase()} courier policies are
            informational. A shipment cost must still be confirmed against
            actual package dimensions, serviceability and final carrier fees.
          </p>
          <ShippingSummary policies={current} currencyCode={currencyCode} />
          <p className="text-ui-fg-subtle">
            Online checkout remains closed until merchant verification is complete.
          </p>
        </>
      ) : (
        <>
          <PoliciesUnavailable />
          <p>
            Minarva Technologies is preparing Kerala-wide CCTV package delivery.
            Availability and final shipping charges require the destination
            PIN code, measured packed weight and an approved courier quote.
            No online orders or courier bookings are accepted yet.
          </p>
        </>
      )}
    </PolicyPage>
  )
}
