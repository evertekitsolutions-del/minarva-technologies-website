/**
 * Cashfree verified-evidence ledger for the isolated Medusa PostgreSQL DB.
 *
 * This function is a PRIVATE backend building block, not an HTTP handler.
 * The caller must resolve medusaPaymentSessionId, cashfreeOrderId and amount
 * from the authenticated Medusa payment session and its quote in the DB.
 *
 * A successful result is STILL NOT a captured Medusa payment or a green light
 * to fulfill. Payment settlement, refunds and Shiprocket remain disabled.
 */
import { reconcileCashfreePayment } from "./cashfree-proof.mjs"

export class PaymentEvidenceConflict extends Error {
  constructor(message = "Cashfree evidence conflicts with an existing payment or session") {
    super(message)
    this.name = "PaymentEvidenceConflict"
  }
}

const validSessionId = (v) => {
  if (typeof v !== "string" || !/^payses_[A-Za-z0-9_-]{4,100}$/.test(v)) {
    throw new TypeError("Valid server-owned Medusa payment session ID is required")
  }
  return v
}
const validAmount = (v) => {
  if (!Number.isSafeInteger(v) || v <= 0) {
    throw new RangeError("Expected Medusa amount must be positive integer paise")
  }
  return v
}

// This is a single, atomic, row-locked PostgreSQL statement. It will never
// replace the first proof with a different order/payment/session/amount.
// Exact replays return the same row. Conflicting order replays return no row;
// using the same payment or session with another order raises unique violation.
export const UPSERT_IDENTICAL_VERIFIED_EVIDENCE = `
INSERT INTO store_cashfree_payment_evidence AS existing (
  cashfree_order_id, cf_payment_id, medusa_payment_session_id,
  amount_paise, currency, proof_key
) VALUES ($1, $2, $3, $4, 'INR', $5)
ON CONFLICT (cashfree_order_id)
DO UPDATE SET cashfree_order_id = EXCLUDED.cashfree_order_id
WHERE existing.cf_payment_id = EXCLUDED.cf_payment_id
  AND existing.medusa_payment_session_id = EXCLUDED.medusa_payment_session_id
  AND existing.amount_paise = EXCLUDED.amount_paise
  AND existing.currency = EXCLUDED.currency
  AND existing.proof_key = EXCLUDED.proof_key
RETURNING cashfree_order_id, cf_payment_id, medusa_payment_session_id,
          amount_paise, currency, proof_key, stage
`

export async function persistVerifiedCashfreeEvidence({
  sdk,
  db,
  medusaPaymentSessionId,
  cashfreeOrderId,
  expectedAmountPaise,
  expectedPaymentId,
}) {
  // Never check the gateway or insert a receipt with an invalid Medusa identity.
  const medusaId = validSessionId(medusaPaymentSessionId)
  const expectedPaise = validAmount(expectedAmountPaise)
  if (!db || typeof db.query !== "function") {
    throw new TypeError("Trusted PostgreSQL query interface required")
  }

  // Official SDK verifies BOTH PAID Cashfree order and exactly one SUCCESS
  // payment against the expected amount. Never accept browser/body proof.
  const proof = await reconcileCashfreePayment({
    sdk, expectedOrderId: cashfreeOrderId,
    expectedAmountPaise: expectedPaise,
    expectedPaymentId,
  })

  let dbResult
  try {
    dbResult = await db.query(UPSERT_IDENTICAL_VERIFIED_EVIDENCE, [
      proof.orderId,
      proof.paymentId,
      medusaId,
      proof.amountPaise,
      proof.idempotencyKey,
    ])
  } catch (error) {
    if (error?.code === "23505" || error?.code === "23514") {
      throw new PaymentEvidenceConflict()
    }
    throw error
  }
  if (dbResult?.rowCount !== 1 || dbResult?.rows?.length !== 1) {
    throw new PaymentEvidenceConflict()
  }

  const row = dbResult.rows[0]
  if (row.cashfree_order_id !== proof.orderId ||
      row.cf_payment_id !== proof.paymentId ||
      row.medusa_payment_session_id !== medusaId ||
      String(row.amount_paise) !== String(proof.amountPaise) ||
      row.currency !== "INR" ||
      row.proof_key !== proof.idempotencyKey ||
      row.stage !== "verified_unsettled") {
    throw new PaymentEvidenceConflict("Invalid receipt persisted by payment database")
  }
  return Object.freeze({
    cashfreeOrderId: proof.orderId,
    cashfreePaymentId: proof.paymentId,
    medusaPaymentSessionId: medusaId,
    amountPaise: proof.amountPaise,
    proofKey: proof.idempotencyKey,
    stage: "verified_unsettled",
    // Explicit fail-closed: settlement/fulfillment NOT authorized here.
    capturedInMedusa: false,
    fulfillmentAuthorized: false,
  })
}
