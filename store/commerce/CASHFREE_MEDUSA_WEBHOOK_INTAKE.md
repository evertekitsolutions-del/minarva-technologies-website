# STORE-014 — Authenticated-by-signature webhook and server-authoritative Medusa payment lookup

## Outcome

Medusa's existing **official payment tables** now become the payment-order authority for sandbox webhook intake. The signature is validated by the pinned **official Cashfree Node SDK v6**, the expected payment amount and session are looked up in Medusa PostgreSQL, the actual gateway order/payment is polled through the SDK, and only then is immutable **verified_unsettled** evidence written.

This is **not** a payment capture/settlement workflow. The module never marks a Medusa payment paid, completes a cart, reserves stock, creates a shipment, sends WhatsApp, or issues a refund.

## Code

- `apps/backend/src/lib/cashfree-webhook-intake.ts`: verifies raw signature and event timestamp, loads exactly one authoritative Medusa `payment_session` joined to `payment_collection`, checks gateway order derivation from Medusa session ID, provider identity, INR session amount and embedded context, confirms gateway paid order + exactly one SUCCESS payment, inserts into STORE-013 append-only PostgreSQL evidence ledger.
- `apps/backend/src/api/webhooks/cashfree/route.ts`: native Medusa API handler, **always 404 unless isolated staging + two independently approved flags**, never emits payment state or sensitive data.
- `apps/backend/src/api/middlewares.ts`: native Medusa `preserveRawBody` and 100kb limit for this route, preserving the exact payload for official Cashfree HMAC verification.
- `apps/backend/src/lib/__tests__/cashfree-webhook-intake.unit.spec.ts`: gateway/DB-mock negative tests, including forged signature, stale event, wrong Medusa session, wrong amount, customer-forged order, gateway mismatch, duplicate SUCCESS payments, missing migration.

## Activation safety

**Do not activate this route in production.** The route can be enabled only on a separate Medusa staging database with all four flags:
- `STORE_CASHFREE_SANDBOX_ENABLED=true`
- `STORE_CASHFREE_SANDBOX_APPROVED=true`
- `STORE_CASHFREE_WEBHOOK_LEDGER_ENABLED=true`
- `STORE_CASHFREE_WEBHOOK_LEDGER_APPROVED=true`

The original `CASHFREE_SANDBOX_CLIENT_ID`/`CASHFREE_SANDBOX_CLIENT_SECRET` live only in server-side environment. No secrets or sample real merchants are committed. `NODE_ENV=production` always returns 404. The route expects the manually reviewed staging schema from STORE-013; without it, the route fails closed.

The webhook URL in an approved isolated staging environment is `POST /webhooks/cashfree` and accepts Cashfree's `x-webhook-signature` and `x-webhook-timestamp` headers. **Do not configure this URL in a real Cashfree merchant dashboard before sandbox certification.**

## Authority model

The Medusa `payment_session` table is queried with a parameterized cashfree order ID *only after* official Cashfree webhook signature verification. The exact Medusa provider ID is `pp_minarva-cashfree-sandbox_cashfree-sandbox`, derived from upstream Medusa PaymentProvider loader and our sandbox class identifier/config. Payment session must be `pending` / `pending_authorization` / `requires_more`, collection `not_paid` / `awaiting`, both currency `inr`, and `payment_session.data` must contain our sandbox-created order/session ID, intent amount, and status.

The hash-derived Cashfree ID must match the Medusa session ID. The trusted amount is `payment_session.amount`, cross-checked against the original `data.amount_paise` and the collection amount; the merchant Cashfree order and SUCCESS payment amounts must match exactly.

No customer/browser/webhook-provided INR total is accepted, and returning HTTP 202 is merely an acknowledgement that **unsettled evidence** was stored.

## Remaining blockers

- Run true Cashfree sandbox end-to-end with approved merchant credentials, signed callback, delayed retry/reconciliation and duplicate concurrent deliveries.
- Build actual Medusa payment authorization/capture/refund workflows with unique transactional settlement claim/outbox. Only that module may mark an order paid.
- Confirm Shiprocket version compatibility and residual merchandise COD collection API with merchant account; do not book shipments without explicit approval.
- Proper cart frontend and hosted staging deployment, real stock/product weights, India GST shipping disclosures, privacy/returns and customer testing.

The whole store is not live. There are no production DB migrations, payments, courier wallet charges, outbound WhatsApp or paid AI dependencies in this PR.
