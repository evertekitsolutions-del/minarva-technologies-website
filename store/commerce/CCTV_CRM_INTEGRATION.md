# STORE-028 — Consented CCTV enquiries into EXISTING Minarva Technologies CRM

**Why:** The website already has an RLS-protected `public.enquiries` table, status/deduplication workflows and a deployed **`public-enquiry-submit` Supabase Edge Function**. Copying the database or exposing privileged SQL to the storefront would create avoidable security risks. The existing `submit_public_enquiry` RPC is **not available to `anon` or `authenticated` directly**, which is appropriate.

This milestone extends the existing **Edge Function origin allowlist** in source to `https://store.minarvatechnologies.com` and adds optional, opt-in CRM saving to the Medusa Store CCTV quotation wizard.

## Existing protected workflow reused

`supabase/functions/public-enquiry-submit/index.ts` already enforces:
- Strict Origin allowlist and CORS preflight
- Service allowlist: `CCTV & Security Systems`
- Real phone digits 7–15, name 2–120, optional email
- Explicit `consent_to_contact === true`
- Anti-bot company-website honeypot and form age 1.2 seconds–6 hours
- Server-key-hashed fingerprint and per-phone submission throttles via `consume_public_enquiry_quota`
- Server-only privileged RPC `submit_public_enquiry` which writes `source=website, status=new` into existing CRM
- No customer record lookup/automatic marketing or telephone calling.

We do **not** bypass, relax or duplicate any of these checks. No new Supabase tables, grants, RLS policies, migrations or service-role exposures were added.

## Browser UX

Once approved, a **separate optional** "Save enquiry with Minarva CRM" form appears below the CCTV site/camera/installation/PIN selector. A prospective buyer may enter name, phone, optional email, and must separately check a specific consent box. This consent **only permits staff follow-up about that enquiry**, not marketing messages or auto phone calls. Submission is strictly triggered by the buyer's click.

The browser calls the existing Edge Function with the project's **public publishable key** in the `apikey` header (no service role/secret). It sends a validated, bounded payload with the selected site, camera quantity, installation, PIN and allowlisted channel. If the official Edge responds with `accepted:true`, the UI confirms save; otherwise it fails closed and offers the preexisting, customer-click WhatsApp alternative.

Official docs: Supabase Edge Functions Authorization headers and CORS. The publishable key is expected to be client-visible and cannot itself bypass the Edge's server-side authorization and rate limits.

## Activation prerequisites — OFF by default

In the **storefront** environment set all three only after tested deployment, merchant privacy review and explicit permission:

```text
NEXT_PUBLIC_STORE_CRM_ENQUIRY_ENABLED=true
NEXT_PUBLIC_STORE_CRM_ENQUIRY_APPROVED=true
NEXT_PUBLIC_STORE_CRM_PUBLISHABLE_KEY=<public sb_publishable_... project key>
```

The code pins the existing known URL `https://kwullzwhlzziosjsejud.supabase.co/functions/v1/public-enquiry-submit`; no arbitrary URL from browser is accepted. The key must be a publishable API key; **never use service-role or `sb_secret_` keys in NEXT_PUBLIC variables**.

**Mandatory dependency:** the updated `public-enquiry-submit` Edge source containing the exact new allowed store origin must be deployed separately after explicit authorization. Merging this PR does not deploy the function, change RLS, activate the form or affect the production CRM. Real end-to-end Edge + database UAT requires explicit approval to create/delete a designated test enquiry and check quotas.

## Limitations

- Existing API saves general enquiries; no automatic lead-to-paid-order conversion, invoice, courier booking, AI agent, consent to marketing, or transaction capture.
- The existing Edge function accepts source `website`. The inbound channel is stored in the enquiry message (e.g. `Campaign: instagram`) without changing its existing status/source database contract.
- Quotes are still human-confirmed. For direct WhatsApp interaction the customer decides whether to send the draft, and contact data are not invisibly tracked.
- No new paid infrastructure: reuse current website's Supabase free/approved tier and existing Medusa storefront.

After DNS, paid sandbox merchant integration, real CCTV stock/courier verification, security and privacy approval, this becomes the CRM bridge for the ad-to-lead funnel.
