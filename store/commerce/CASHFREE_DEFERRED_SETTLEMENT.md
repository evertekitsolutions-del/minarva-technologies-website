# STORE-016 — Deferred Cashfree payment authorization (sandbox-only)

**Actual Medusa reuse:** Medusa 2.22.0 already supports pending_authorization and `paymentModule.authorizePaymentSession(sessionId, {})`. We reuse that native workflow rather than writing direct payment/capture table updates. Source confirmed at `medusajs/medusa` tag `v2.22.0`: `packages/modules/payment/src/services/payment-module.ts` and `packages/core/utils/src/payment/abstract-payment-provider.ts`.

## How this works

1. Existing STORE-010 creates Cashfree sandbox hosted session, Medusa owns payment session.
2. Existing STORE-014 signed webhook checks Cashfree HMAC, gateway PAID status, one SUCCESS payment, Medusa session/expected INR amount, and persists STORE-013 immutable proof.
3. **Only if two additional flags are enabled in isolated staging**, webhook route calls Medusa's native `authorizePaymentSession`.
4. `CashfreeSandboxProvider.authorizePayment` / `getPaymentStatus` must independently fetch the immutable proof joined to the **authoritative Medusa payment session AND collection**; verify exact prepaid amount, correct provider, hash-derived Cashfree order, and gateway status again via official `cashfree-pg@6.0.6`.
5. If proof is absent return `PENDING_AUTHORIZATION`; if gateway paid and full invoice amount confirmed return Medusa `CAPTURED` so Medusa's **own** payment/capture workflow is responsible for recording it. No direct mutation of Medusa payment/capture tables.
6. If payment session amount is **only a shipping advance** while total collection amount is larger, this helper throws, blocks authorizing the **full** order and leaves it awaiting. Partial COD must be implemented as a separate approved split/tender workflow.

**IMPORTANT:** Version-specific Medusa admin/order behavior with `CAPTURED` on deferred payment requires merchant sandbox end-to-end tests; a recent Medusa bug report discusses event emission during deferred capture. Without staging confirmation do NOT enable production or assume order completion creates all expected events.

## Staging flags (ALL mandatory)

- Existing `STORE_CASHFREE_SANDBOX_ENABLED=true` and `STORE_CASHFREE_SANDBOX_APPROVED=true`
- Existing `STORE_CASHFREE_WEBHOOK_LEDGER_ENABLED=true` and `STORE_CASHFREE_WEBHOOK_LEDGER_APPROVED=true`
- New `STORE_CASHFREE_SANDBOX_SETTLEMENT_ENABLED=true` and `STORE_CASHFREE_SANDBOX_SETTLEMENT_APPROVED=true`

All are false by default. Provider constructor rejects `NODE_ENV=production` and webhook route returns 404. The immutable SQL ledger migration still requires explicit isolated Medusa staging DB approval. The implementation does not initiate payment without staging merchant keys.

## Acceptance tests

- Jest tests use mock official Cashfree SDK and DB, never reach merchant gateway.
- Refuse forged provider/order/session IDs; refuse mismatched currency, INR paise, collection amount, untrusted payment row, ambiguous/multiple SUCCESS gateway payments, already-completed Medusa session.
- Confirm `getPaymentStatus` remains pending if flags/proof missing; only a full prepaid proof may return CAPTURED.
- GitHub Medusa backend unit tests/build and PostgreSQL smoke must pass.

## Still not live / missing

- Merchant-approved signed Cashfree sandbox API end-to-end transaction and delayed/repeated webhook test
- Medusa Admin captures, refunds, reversals, reconciliation and support workflows
- **Partial COD** actual carrier residual collection verification and original Medusa collection split workflow
- Shiprocket incompatible peer package, courier label/booking, product catalog/real weights, inventory, GST, reviews and returns
- Public domain deployment/production credentials, store-to-CRM synchronization and WhatsApp consent/notification provider

**No production migration, real payment capture, delivery booking or automatic customer messages occurred with this milestone.**
