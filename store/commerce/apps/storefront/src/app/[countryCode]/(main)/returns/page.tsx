import { Metadata } from "next"

import { getStorePolicies } from "@lib/data/store-policies"
import { merchantPolicyPublicationApproved } from "@lib/util/merchant-policy-release"
import { PoliciesUnavailable, PolicyPage } from "@modules/policies/templates"

export const dynamic = "force-static"
export const revalidate = 60

export const metadata: Metadata = {
  title: "Return policy",
  description: "How to return items and get a refund.",
}

export default async function ReturnsPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const { current } = merchantPolicyPublicationApproved()
    ? await getStorePolicies(countryCode)
    : { current: null }

  return (
    <PolicyPage title="Return policy">
      {current ? (
        <>
          <p>
            You can return items within {current.returnWindowDays} days of
            delivery. Items are returned by mail.
          </p>
          <p>
            {current.freeReturns
              ? "Return shipping is free."
              : "Return shipping costs are paid by the customer."}
          </p>
        </>
      ) : (
        <>
          <PoliciesUnavailable />
          <p>
            Return, replacement, refund and warranty conditions for CCTV
            hardware are undergoing merchant approval. This online store
            is not accepting customer orders or payments. Please contact
            Minarva Technologies for approved written terms before purchase.
          </p>
        </>
      )}
    </PolicyPage>
  )
}
