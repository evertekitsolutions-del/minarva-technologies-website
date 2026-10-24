# STORE-010 — Cashfree Medusa Payment Provider (SANDBOX ONLY)

This provides a real **Medusa Payment Module adapter** using the already pinned official `cashfree-pg@6.0.6` Node SDK, instead of copying a third-party/community payment implementation.

## Code

- `apps/backend/src/modules/cashfree/service.ts` — implements `AbstractPaymentProvider` with real Cashfree `PGCreateOrder` sandbox session generation, strict INR amount, customer phone and gateway response validation
- `apps/backend/src/modules/cashfree/index.ts` — official `ModuleProvider(Modules.PAYMENT, ...)` registration
- `apps/backend/medusa-config.ts` — plugin deliberately absent in normal local and production boots

## Sandbox admission

1. Use **dedicated, isolated** Medusa staging PostgreSQL and Redis. Never run gateway/provider experiments against existing Minarva CRM Supabase.
2. Never commit secrets. Set `CASHFREE_SANDBOX_CLIENT_ID` and `CASHFREE_SANDBOX_CLIENT_SECRET` only in backend staging environment.
3. To opt into sandbox operations, explicitly set both `STORE_CASHFREE_SANDBOX_ENABLED=true` and `STORE_CASHFREE_SANDBOX_APPROVED=true`. Production always throws on enablement.
4. Set up an India INR region, Medusa payment provider in the region, valid merchant sandbox account and supported customer phone. No real card/UPI charges must be made.
5. Use the Medusa JS SDK storefront with the official Cashfree browser SDK only after checkout integration testing. Payment session `data` is storefront-visible, so it contains payment_session_id but no API key.
6. **Do not advertise the checkout as functioning yet.**

## Deliberately rejected operations

- `authorizePayment` and `getPaymentStatus` always return `PENDING_AUTHORIZATION` instead of marking paid.
- `getWebhookActionAndData` always returns `NOT_SUPPORTED`.
- capture, refund, cancel and delete throw explicitly until signed-webhook verification and durable atomic DB idempotency are implemented.
- When the customer edits quantities or address and price changes, `updatePayment` throws rather than reusing a stale Cashfree amount.
- This prevents silent false payment confirmations, at the expense of **no live checkout completion**.

## Exit criteria

Next milestone must persist Cashfree payment event proof from `store/lib/cashfree-proof.mjs` with a DB `UNIQUE(provider, event_id)`, bind to authentic Medusa payment collection, support replays and delayed webhooks, verify refund/capture, and test against an approved merchant sandbox. Shiprocket residual COD also must be independently verified.

The Cashfree SDK installation and staging-only session creation are **not** payment-processing completion. Live gateway settings, production API keys and customer billing remain OFF until explicit approval.
