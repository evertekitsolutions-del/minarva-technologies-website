# STORE-029 — Existing CRM Edge origin readiness (no deployment)

## Confirmed live-vs-source state (25 October 2026)

The Minarva website uses the existing **`public-enquiry-submit` Supabase Edge Function**, version **4**, in project `kwullzwhlzziosjsejud`. The deployed function permits `https://minarvatechnologies.com` and `https://www.minarvatechnologies.com`, but does **not** include `https://store.minarvatechnologies.com` in its CORS allowlist yet.

The versioned GitHub file `supabase/functions/public-enquiry-submit/index.ts` already has the exact store origin added. Comparing the current deployed source with GitHub on 25 October 2026 showed the store-origin line is **the only difference**.

Therefore, the currently merged client integration (STORE-028, PRs #80 and #81) **cannot be called production-ready**. Its browser form correctly defaults **OFF**; keep it off until the Edge source change is separately deployed with approval and verified.

## Safe checks added

`node store/scripts/check-crm-edge-origin.mjs --live` makes **only four OPTIONS preflight requests** against the pinned, existing function endpoint:

1. Allow `https://minarvatechnologies.com`
2. Allow `https://www.minarvatechnologies.com`
3. Allow `https://store.minarvatechnologies.com`
4. Explicitly deny `https://untrusted.example.invalid`

The first three require HTTP 204, exact `Access-Control-Allow-Origin`, POST support and `apikey` / `content-type` in `Access-Control-Allow-Headers`. The rejected origin requires 403 and no reflected ACAO. Wildcard CORS fails the test.

Checks require **no credentials**, never use POST, do not consume submission quotas, do not write enquiries, and do not deploy production changes. CI unit tests use an injected fake transport. An additional GitHub workflow is available **only via manual workflow dispatch**; there is no automatic production polling.

Until the new Edge version is explicitly approved and deployed, the live verification is expected to FAIL on the store origin. Do not weaken production origin checks or proxy submissions from a trusted origin to hide this failure.

## Release dependencies

- Review and explicitly authorize redeployment of the same existing function with only the new exact allowed store origin. Retain JWT=false, server-side RPC, consent, honeypot, form age, quota, phone normalization and allowed service contracts.
- After deployment, run the read-only preflight. Approval is **not** granted merely by merging this PR.
- Run a separately approved customer-consented **staging test enquiry** and inspect the real CRM record + deduplication; no real customer records or data should be created for tests without explicit approval.
- Only then consider enabling all three STORE-028 browser config values `NEXT_PUBLIC_STORE_CRM_ENQUIRY_ENABLED`, `NEXT_PUBLIC_STORE_CRM_ENQUIRY_APPROVED`, `NEXT_PUBLIC_STORE_CRM_PUBLISHABLE_KEY` on an approved storefront deployment.
- Public order/payment/courier launch remain separately disabled. This milestone neither activates the website store nor creates leads.

Source-of-truth: existing static website `index.html` invokes this function with its public project key and then opens a WhatsApp draft. No second CRM, paid automation service, RLS policy, table or privilege is created.
