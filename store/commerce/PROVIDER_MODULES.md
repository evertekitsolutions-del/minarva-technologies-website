# Reuse-first commerce provider selection — 24 October 2026

No WooCommerce. Existing Medusa DTC Starter MIT source provides product, inventory, cart, checkout UI, order, pricing, promotion, native payment-provider / fulfillment contracts, admin and Next.js storefront.

## Courier candidate — Shiprocket

- Medusa integrations listing: https://medusajs.com/integrations/%40sam-aelmedusa-plugin-shiprocket
- Package: `@sam-ael/medusa-plugin-shiprocket` **0.2.1** (MIT per npm registry; https://www.npmjs.com/package/@sam-ael/medusa-plugin-shiprocket)
- Advertises rates, fulfillment, label/manifest, AWB, pickup and tracking.
- **Not** installed/activated for production, and not assumed capable of customer-shipping-advance + residual COD. It may auto-book couriers and pickups; tests with real credentials can incur charges.
- Required before activation: package provenance verification, static review of outbound API calls, quote and dimensions validation, webhook HMAC/token strategy, idempotent shipping, cancellation/reconciliation, blocking real shipment in test, and confirmation that courier can collect only the unpaid product value.
- Do not enable if merchant account cannot guarantee partial COD balance collection.

## Payment candidate — Razorpay

- Medusa-compatible community package: `medusa-plugin-razorpay-v2` 0.1.4 (MIT; https://github.com/SGFGOV/medusa-payment-plugins/tree/main/packages/medusa-plugin-razorpay-v2).
- Upstream built against Medusa 2.12.3 while current DTC Starter uses Medusa 2.22.0. Full compatibility has **not** been verified.
- README's sample client payment handler completes order on callback; **do not copy** into checkout without server-verified payment proof. Capture and refund flows require testing.
- Do not install/enable until sandbox signature verification, replay, amount mismatch, duplicate webhook, race with Medusa cart completion, capture and refund tests pass.
- Cashfree remains preferred merchant candidate pending existence of a tested, compatible OSS provider; payment gateway chosen only after account eligibility/KYC and source review.

## AI

- Use existing official Medusa product catalog API as authoritative RAG/tool context.
- Never let an external AI plugin generate/modify live payment, price, promised delivery, stock, or carrier charge.
- No autonomous promotional WhatsApp/calling without lawful consent and user approval.

## Local checkout/payments safety

- Local Medusa staging has NO real gateway credentials, external fulfillment plugin credentials, ad pixels or live API providers.
- Install/experiment with independent PostgreSQL DB only; NEVER run Medusa migrations against the existing Supabase CRM project `kwullzwhlzziosjsejud` database without a separately reviewed isolation plan.
- No fabricated public SKUs, customer orders, warranty terms or testimonials.
- `store/lib/checkout-pricing.mjs` is not a full partial-COD implementation. Do not enable COD based only on its tests.
