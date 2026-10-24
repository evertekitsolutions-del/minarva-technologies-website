# STORE-011 — Partial COD shipping handoff (READ-ONLY)

This milestone connects existing, verified open-source-based components without writing a shipping engine:

- `store/lib/checkout-pricing.mjs`: validated live all-in courier quote, package dimensions and shipping/COD split
- `store/lib/cashfree-proof.mjs`: official Cashfree SDK's server-side PAID order + SUCCESS payment evidence
- `store/lib/partial-cod-handoff.mjs`: **pure approval draft** and post-booking amount verification

## Required behavior

Example only (NOT a live product price or shipping quote):

| Item | Rupees |
|---|---:|
| Product merchandise | ₹12,900 |
| Courier shipping | ₹185 |
| Optional COD handling | ₹25 |
| Total invoice | ₹13,110 |
| Cashfree shipping + handling advance | ₹210 |
| Carrier collects on delivery | ₹12,900 |

The exact money comes from authoritative Medusa cart amounts and a fresh, trusted carrier quote, not customer input.

## Safe integration sequence

1. Medusa creates order/payment-session intent from server-authenticated products and stock. Store server quote ID, packing weight, all-in shipping amount, quote expiry and PIN. No invented transport rate.
2. Verify the Cashfree advance via official SDK by fetching the *actual* PAID gateway order and matching SUCCESS payment. For prepaid, full invoice is paid instead.
3. Only after a durable, unique payment proof is stored can an authorized fulfillment worker prepare a provider booking request. This milestone provides `prepareShippingHandoff` as a **read-only checker**, not a shipping executor.
4. **Critical unresolved API gate:** Shiprocket must explicitly permit the carrier account to collect **only the merchandise residual**. An ordinary COD flag does not prove partial COD works. The current pinned Shiprocket community plugin has Medusa v2.12.4 exact peers while our core is v2.22.0.
5. Once a booking is returned by a real provider, normalize the booking receipt and call `assertCourierBookingMatchesHandoff`. If actual COD collectable differs from the paid split, STOP fulfillment and request cancellation/reconciliation.
6. Only after merchant account settlement and database idempotency/replay handling may Medusa mark order paid/fulfillment ready.
7. Never attempt real courier booking for CI tests: Shiprocket often has **no zero-cost sandbox**, so test actions may cost money. Approval and wallet funding required.

## What is NOT done

- No actual carrier API request, payment capture/refund, shipping label, COD collection, returns, or customer message is performed.
- No ability to independently validate Shiprocket credentials, booking response semantics or merchant-specific residual COD setting.
- No production migration, database write, live rate quote or public checkout.
- These helpers only accept provider-normalized data. A merchant cannot safely trust an arbitrary `partialCodSupported: true` field from a browser request.
- The next build must wire them to secure persistent Medusa order/quote/payment records and reviewed Shiprocket integration with live account authorization.

`store/tests/partial-cod-handoff.test.mjs` exercises advance reconciliation, quote price/PIN expiry, full COD overcharge detection, prepaid zero COD, and forged/stale gateway responses with mocked SDK. No real money is moved.
