# STORE-017 — Shiprocket official serviceability (READ-ONLY)

Source: [Shiprocket API documentation](https://apidocs.shiprocket.in/), section **GET Check Courier Serviceability**. Endpoint:
`https://apiv2.shiprocket.in/v1/external/courier/serviceability/`.

The existing community Medusa Shiprocket plugin has a known peer mismatch: 0.2.1 declares exact Medusa 2.12.4, but this store runs Medusa 2.22.0. The plugin remains OFF. Rather than copying a large shipping engine or enabling incompatible booking logic, this module uses Shiprocket's **official published API** for the first safe step: *read-only courier discovery*.

## What is implemented

- `store/lib/shiprocket-serviceability.mjs`: produces a validated request using pickup PIN, destination PIN, declared merchandise amount in INR, `cod=0|1`, packed dimensions, and the **max(actual, volumetric), rounded to carrier slab** weight from existing `store/lib/checkout-pricing.mjs`.
- Uses a backend-only bearer token, never a browser or URL query token; HTTPS host/path are fixed and cross-domain redirects disallowed.
- Accepts only independently confirmed explicit staging flags. No external calls by default; production always rejected.
- Normalizes carrier identity, estimated days, general COD capability, and raw available freight/COD/other/coverage charge *components* for merchant inspection.
- Deliberately sets `totalChargePaise: null`, `rateVerifiedAllInclusive: false`, `partialCodSupported: false`, `bookingAllowed: false` for **every** candidate. Do NOT show these as customer checkout rates, since official serviceability responses do not guarantee final all-inclusive charges after GST, fuel, insurance, RTO or negotiated surcharges.
- Existing `chooseCourier` will not select these incomplete candidates as authoritative; customer checkout remains blocked.
- Unit tests use mocked HTTP responses; **no merchant API access or cost**.

## Critical COD distinction

Shiprocket's `cod=1` and `available_courier_companies[].cod=1` mean ordinary Cash on Delivery might be supported on that lane. They do **not** certify that the courier will collect only the product balance after the customer has already prepaid delivery fees/handling to Minarva.

Never set `partialCodSupported=true` unless the merchant account contract and an actual booking response confirm the exact **residual merchandise amount**, and a human has approved courier wallet charges. A prepaid shipping advance must not be mistaken for authorization to mark a whole Medusa order paid.

## How to test later

1. Generate a distinct Shiprocket **API user** in the merchant panel. Their support documentation says API-user credentials, not the normal account login, should be used to obtain a bearer token.
2. With user permission, store the token server-side only and test staging `GET serviceability` behind both flags.
3. Normalize actual **all-inclusive** rates, validate taxes/insurance/COD/handling, quote expiry and PIN; sign/persist server quote IDs with idempotency.
4. Confirm order-creation API and exact COD collectable value in a merchant staging environment; it may charge the Shiprocket wallet, so requires explicit approval.
5. Either upgrade to a compatible MIT plugin or implement the minimal official API fulfillment connector after validation. Review labels, AWB, pickup, returns, cancellations and RTO.
6. Only then consider enabling delivery options on the public storefront.

This is a live-API-ready *read-only adapter*, not a deployed integration or courier booking. All credentials, product rates and inventory remain private/uninvented.
