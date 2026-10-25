import { Metadata } from "next"

import { STORE_NAME } from "@lib/util/site"
import { PlaceholderNotice, PolicyPage } from "@modules/policies/templates"

export const dynamic = "force-static"
export const revalidate = 60

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${STORE_NAME} collects and uses personal data.`,
}

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy policy">
      <PlaceholderNotice />
      <p>
        {STORE_NAME} is not accepting online orders or live payments yet.
        Customer information, checkout operations and privacy practices must
        be reviewed and published before the store launches.
      </p>
      <p>
        The optional CCTV help interface processes customer-submitted
        questions to show catalogue-based information. Clicking the WhatsApp
        contact link opens an external messaging service only at your request.
        Contact Minarva Technologies for privacy enquiries.
      </p>
    </PolicyPage>
  )
}
