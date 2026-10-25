import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import "styles/globals.css"

const seoReleaseApproved =
  process.env.NODE_ENV === "production" &&
  process.env.STORE_SEO_RELEASE_ENABLED === "true" &&
  process.env.STORE_SEO_RELEASE_APPROVED === "true"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
  title: {
    default: "Minarva CCTV Store | Thiruvananthapuram, Kerala",
    template: "%s | Minarva CCTV Store",
  },
  description:
    "Explore CCTV camera package enquiries and product support from Minarva Technologies, Thiruvananthapuram. Online ordering is not available yet.",
  applicationName: "Minarva CCTV Store",
  robots: {
    index: seoReleaseApproved,
    follow: seoReleaseApproved,
  },
  openGraph: {
    type: "website",
    title: "Minarva CCTV Store",
    description:
      "CCTV package information and enquiries from Minarva Technologies, Thiruvananthapuram.",
  },
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mode="light">
      <head>
        <link rel="ucp" href="/.well-known/ucp" />
      </head>
      <body>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
