# STORE-007 — Cashfree server-confirmed payment proof

## Why this is minimal custom glue

- Reuses `cashfree-pg@6.0.6` already pinned in Medusa backend (`cashfree-pg-sdk-nodejs`, official Cashfree API SDK).
- Uses official `PGVerifyWebhookSignature`, `PGFetchOrder`, `PGOrderFetchPayments`; no copied gateway code.
- The earlier community package `medusa-cashfree-payment-plugin` was removed from the registry; it is **not** installed.
- Domain-specific evidence checks only: compare signed event to trusted Medusa payment-collection order ID, exact INR amount in paise and successful gateway transaction.

## Source

- `store/lib/cashfree-proof.mjs` (provider-neutral proof gate)
- `store/tests/cashfree-proof.test.mjs` (mock official SDK; no real credentials/API charges)

### Example proposed integration boundary (NOT ACTIVE)

```js
import { Cashfree, CFEnvironment } from "cashfree-pg"
import { reconcileSignedCashfreeWebhook } from "store/lib/cashfree-proof.mjs"

const cashfree = new Cashfree(CFEnvironment.SANDBOX, serverSecretClientId, serverSecretClientKey)
const trusted = await findMedusaExpectedPaymentForSignedOrderId(/* verified order */)
const result = await reconcileSignedCashfreeWebhook({
  sdk: cashfree,
  signature: request.headers["x-webhook-signature"],
  timestamp: request.headers["x-webhook-timestamp"],
  rawBody: exactRawUtf8Body,
  nowMs: Date.now(),
  expectedOrderId: trusted.cashfreeOrderId,
  expectedAmountPaise: trusted.amountPaise,
})
if (result.actionable) {
  // Execute atomic UNIQUE(provider,idempotencyKey) persistence +
  // Medusa payment authorization/capture workflow, THEN fulfillment eligibility.
  // A database uniqueness conflict must be treated as duplicate, not re-executed.
}
```

Do not copy this illustration into a public route without replacing the pseudocode, adding authentication/Medusa payment provider lifecycle, verified body capture, strict provenance and persistence.

## Safety gates

1. `trusted` expected values **must** come from authenticated Medusa backend payment records/quote and not from the webhook payload or customer request. A signed gateway event is not a source of the amount owed.
2. The official SDK verifies the exact raw-body signature before JSON parsing. Events older than 15 minutes are rejected; delayed events require server-side scheduled reconciliation, not relaxing signature checks.
3. Verify both gateway order PAID and exactly one SUCCESS gateway payment matching order ID/currency/amount; if multiple successes exist, freeze for manual reconciliation.
4. Receipt of a proof never calls `completeCartWorkflow`, sends WhatsApp, starts shipping or marks order fulfilled. This module has no database writes.
5. The caller MUST persist the deterministic `cashfree:<order_id>:<cf_payment_id>` idempotency key behind a unique DB constraint and reconcile the Medusa payment collection in one consistent workflow before enabling shipping.
6. Partial COD must additionally verify advance captured and residual COD booked by Shiprocket equals the outstanding merchandise amount. The current Shiprocket plugin has a Medusa peer version mismatch and remains OFF.
7. No production store, merchant account, environment secrets or Cashfree payment provider is activated by this milestone.

## Future acceptance

Wire Cashfree payment provider into Medusa's `AbstractPaymentProvider` lifecycle with complete merchant-owned sandbox tests (create session, cancel, browser return, webhook, delayed reconciliation, refund, idempotency and partial COD) and independent database migrations. No deployment until explicitly approved.

Exact SDK check (24 Oct 2026): installed `cashfree-pg@6.0.6` exposes `PGVerifyWebhookSignature`, `PGFetchOrder`, `PGOrderFetchPayments`, `PGCreateOrder` and `PGOrderCreateRefund` on the **constructed client instance**, not as static methods. The current sandbox enum is `CFEnvironment.SANDBOX`; older README snippets use `Cashfree.SANDBOX` and are incompatible with the pinned package. This was checked by GitHub CI without network requests to Cashfree.
