# Store subdomain on the SAME existing Vercel project

Owner directive: `store.minarvatechnologies.com` must use the EXISTING `minarva-technologies-website` Vercel project, leaving `www.minarvatechnologies.com` untouched.

The root `vercel.json` now uses exact-`host` conditional rewrites:
- `store.minarvatechnologies.com/` -> static `/store/live/index`
- `/in`, `/in/*` and `/store` -> the same stand-alone storefront HTML
- All other hosts, especially existing www and apex, retain the existing root site.

This is the real public catalogue and customer-initiated WhatsApp quotation UI already in `store/live/index.html`, NOT a screenshot or mockup. It does NOT yet provide live Medusa checkout, Cashfree merchant settlement or Shiprocket shipment booking: those require separate real merchant credentials, Medusa backend+Postgres+Redis runtime and approved product data.

## Vercel deployment/domain verification

1. Merge after CI then verify that the Git-connected main production deployment is READY on the existing Vercel project.
2. Attach the exact subdomain to THAT project using the Vercel Domains API. Do not replace or redirect the apex / www domains.
3. If DNS is external, create only the provider-issued `store` CNAME in the authoritative registrar's DNS panel. Do not move nameservers or modify apex/www records.
4. Verify both `https://store.minarvatechnologies.com` and `https://www.minarvatechnologies.com` return different intended pages on HTTPS.
5. Do not call checkout or shipping LIVE until independent actual payment/courier merchant tests pass.

Running the site and accepting fully paid orders are two different release checks; the owner expressly requests BOTH. This routing milestone tackles the custom domain and must not be described as full commercial checkout completion.
