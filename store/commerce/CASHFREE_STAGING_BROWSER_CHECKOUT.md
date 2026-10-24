# STORE-015 — Cashfree sandbox browser checkout (not live)

## Reuse-first implementation

The original Medusa DTC Next.js checkout remains intact. For our own Medusa sandbox provider `pp_minarva-cashfree-sandbox_cashfree-sandbox`, the review screen uses the **official** pinned `@cashfreepayments/cashfree-js@1.0.7` loader instead of a hand-built payment form. It obtains only the **public payment session token** already returned through Medusa's payment session; no secret client ID, client key, card or UPI credential is exposed.

Checkout invokes `load({ mode: "sandbox" })`, then `cashfree.checkout({paymentSessionId,redirectTarget:"_modal"})`. The API is based on Cashfree's own JS module README and hosted-checkout examples.

## Safety gates

- Disabled by default: `NEXT_PUBLIC_CASHFREE_SANDBOX_CHECKOUT_ENABLED=false`; only Next.js **development mode** can use this button with explicit opt-in.
- The backend needs its own four distinct Cashfree sandbox/session/webhook gates as documented in `CASHFREE_MEDUSA_WEBHOOK_INTAKE.md` and an authorized isolated merchant sandbox. Next.js opt-in alone does not enable the payment backend.
- **No call to `placeOrder()`, `cart.complete()`, Medusa payment authorization, shipping booking or payment-captured UI** on any Cashfree JS result.
- Customers see only an attempted sandbox checkout and clear copy saying *payment status has not been confirmed*.
- The existing prebuilt Medusa **manual test checkout** path is now disabled by default and allowed only if `NODE_ENV=development` AND `NEXT_PUBLIC_STORE_DEV_MANUAL_CHECKOUT_ENABLED=true`.
- Stripe integration is inherited from the Medusa OSS starter and is not configured with any merchant account; it is not a substitute for verified Cashfree settlement.
- Do NOT configure real Cashfree credentials or real merchant webhook endpoints on this storefront. No live checkout or production DNS switch.

## Remaining before launch

1. Resolve real paid/authorized Medusa order settlement backed by STORE-013/014 immutable evidence, delayed events, outbox and refunds.
2. Validate sandbox checkout with legitimate merchant test keys, return behavior, app domain allowlisting and terms/privacy copy.
3. Confirm full-price prepaid vs shipping-advance COD and Shiprocket carrier's exact residual collection contract.
4. Create authoritative product catalog, GST, real stock/weight, packing and rates; deploy preview then tests on devices.

The store is not customer-ready. This milestone gives the team a usable **local sandbox browser payment UI foundation**, not paid ecommerce.
