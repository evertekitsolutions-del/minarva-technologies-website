# STORE-013 — Cashfree verified payment evidence ledger

**This is NOT a payment settlement, refund or shipping system.** It is a durable, collision-proof evidence layer in the isolated Medusa PostgreSQL database.

## Reused components
- Official Cashfree SDK: `cashfree-pg@6.0.6` (already in backend dependency list)
- Medusa v2's own payment session and authoritative cart totals (must be loaded by a future authenticated backend call)
- PostgreSQL 16 (already needed for Medusa; no new paid service)
- Existing `store/lib/cashfree-proof.mjs` verification of Cashfree PAID order + exactly one SUCCESS payment, exact INR amount and payment identity

## New artifacts

- `store/lib/cashfree-evidence-ledger.mjs`: `persistVerifiedCashfreeEvidence` validates the trusted Medusa session ID/amount, checks the gateway through the official SDK, then runs ONE parameterized PostgreSQL upsert. It returns `stage: verified_unsettled`, `capturedInMedusa: false`, `fulfillmentAuthorized: false`. It cannot fulfill, capture, refund, book shipment or send messages.
- `apps/backend/sql/staging/20261025_cashfree_payment_evidence.sql`: opt-in, isolated PostgreSQL table with three independent uniqueness barriers: gateway order, gateway payment and Medusa payment session. Another unique proof key ties all three. Only INR, positive integer paise and `verified_unsettled` are accepted. Database trigger forbids any material UPDATE or DELETE.
- `store/tests/cashfree-evidence-ledger.test.mjs`: mocked gateway and DB integration boundary tests.
- `store/tests/sql/cashfree-ledger.integration.sql`: real PostgreSQL unique constraints, identical replay, mismatched replays, invariant enforcement and append-only triggers.
- `.github/workflows/store-cashfree-ledger.yml`: GitHub CI starts a disposable Postgres 16 database, applies only THIS staging schema and exercises its constraints. No production databases touched.

## Important trust boundary

The caller MUST load these values directly from authenticated, server-owned Medusa payment collection / payment session **before** invoking the helper:
`medusaPaymentSessionId`, `cashfreeOrderId` and `expectedAmountPaise`. The ledger helper cannot establish this Medusa authority by itself. It must NOT be exposed as a public HTTP route taking those values from a customer or webhook.

When an idempotent exact replay occurs, the original evidence remains. An order/payment/session mismatch is rejected; under concurrent insert attempts PostgreSQL unique indexes and atomic upsert enforce the same rule.

## Manual migration guard

- The SQL script is deliberately **not** in Medusa auto migrations and does not modify the existing Minarva Technologies Supabase CRM.
- Only an explicitly approved staging test can apply the schema to the isolated Medusa database.
- Do not apply to a production database without a separate reviewed migration and rollback plan.
- The evidence table is append-only to application-level SQL; privileged database administration is outside this invariant.

## Remaining before anyone can pay

An authorized backend must bind verified evidence to Medusa payment authorization/capture using a transactionally consistent workflow and outbox/claim ledger; extend tests for concurrent webhooks, delayed retries, reversals and refunds. Cashfree sandbox credentials/KYC are required before actual gateway calls. Shiprocket's plugin peer mismatch and *carrier-verified residual COD collectable* remain blockers. Nothing from this ledger triggers fulfillment or treats Cashfree proof as a completed Medusa order. No WhatsApp/email auto messaging is activated.
