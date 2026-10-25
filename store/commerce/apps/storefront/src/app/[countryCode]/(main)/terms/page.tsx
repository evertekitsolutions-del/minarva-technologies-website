import { Metadata } from "next"

import { STORE_NAME } from "@lib/util/site"
import { PlaceholderNotice, PolicyPage } from "@modules/policies/templates"

export const dynamic = "force-static"
export const revalidate = 60

export const metadata: Metadata = {
  title: "Terms of service",
  description: `Terms that apply to purchases from ${STORE_NAME}.`,
}

export default function TermsPage() {
  return (
    <PolicyPage title="Terms of service">
      <PlaceholderNotice />
      <p>
        {STORE_NAME} is preparing its online store. Checkout, online payment
        and courier dispatch are not available at present.
      </p>
      <p>
        Final product terms, GST, warranty exclusions, installation charges
        and return conditions must be approved and published before orders
        can be accepted. For a quotation please contact our team.
      </p>
    </PolicyPage>
  )
}
