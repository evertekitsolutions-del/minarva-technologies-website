import { Metadata } from "next"

import { STORE_NAME } from "@lib/util/site"
import { PlaceholderNotice, PolicyPage } from "@modules/policies/templates"

export const dynamic = "force-static"
export const revalidate = 60

export const metadata: Metadata = {
  title: "Contact",
  description: `How to contact ${STORE_NAME}.`,
}

export default function ContactPage() {
  return (
    <PolicyPage title="Contact">
      <PlaceholderNotice />
      <p>
        Contact {STORE_NAME} for CCTV packages, quotations, technical
        specifications, warranty and delivery enquiries. This online
        storefront is not yet accepting orders.
      </p>
      <p>
        Phone: <a href="tel:+916235353732">+91 6235353732</a>.
        Email: <a href="mailto:minarvatechnologies@gmail.com">
          minarvatechnologies@gmail.com
        </a>.
      </p>
      <p>Service location: Thiruvananthapuram, Kerala, India.</p>
    </PolicyPage>
  )
}
