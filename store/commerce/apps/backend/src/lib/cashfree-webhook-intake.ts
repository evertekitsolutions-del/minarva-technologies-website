import { createHash } from "node:crypto"
import type { Cashfree } from "cashfree-pg"

/**
 * STORE-014: receipt-only webhook intake.
 *
 * The official Cashfree SDK owns signature, order and payment API checks.
 * The authoritative order and amount are loaded from Medusa's own payment
 * tables. This never completes a cart, captures a Medusa payment, or ships.
 *
 * Activated only through a separate two-factor staging flag in route.ts.
 */

export interface PaymentDb {
  raw: (sql: string, bindings: unknown[]) => Promise<{
    rows: Record<string, any>[]
    rowCount?: number
  }>
}

interface CashfreeWebhookClient {
  PGVerifyWebhookSignature(signature: string, rawBody: string, timestamp: string): unknown
  PGFetchOrder(orderId: string): Promise<{ data?: Record<string, any> }>
  PGOrderFetchPayments(orderId: string): Promise<{ data?: Record<string, any>[] }>
}

export class CashfreeIntakeRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CashfreeIntakeRejected"
  }
}
const deny = (message: string): never => {
  throw new CashfreeIntakeRejected(message)
}
const id = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(value)) deny(`Invalid ${label}`)
  return value
}
const paymentId = (value: unknown): string => {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    deny("Unsafe Cashfree payment identifier")
  }
  return id(String(value ?? ""), "Cashfree payment identifier")
}
const paise = (value: unknown): number => {
  const str = typeof value === "number" || typeof value === "string" ? String(value) : ""
  if (!/^(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(str)) deny("Invalid INR amount precision")
  const [whole, frac = ""] = str.split(".")
  const minor = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2))
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    deny("INR amount is not a positive safe integer")
  }
  return Number(minor)
}

export const SELECT_MEDUSA_CASHFREE_SESSION = `
SELECT ps.id, ps.currency_code, ps.amount::text AS amount,
       ps.provider_id, ps.status, ps.data,
       pc.currency_code AS collection_currency,
       pc.amount::text AS collection_amount,
       pc.status AS collection_status
FROM payment_session ps
INNER JOIN payment_collection pc ON pc.id = ps.payment_collection_id
WHERE ps.data->>'order_id' = ?
  AND ps.deleted_at IS NULL
  AND pc.deleted_at IS NULL
LIMIT 2
`

// Identical replay can return a row, but an altered order/payment/session/
// amount is impossible to overwrite. These constraints are in STORE-013 SQL.
export const RECORD_CASHFREE_EVIDENCE = `
INSERT INTO store_cashfree_payment_evidence AS existing (
  cashfree_order_id, cf_payment_id, medusa_payment_session_id,
  amount_paise, currency, proof_key
) VALUES (?, ?, ?, ?, 'INR', ?)
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

const providerId = "pp_minarva-cashfree-sandbox_cashfree-sandbox"

const verifiedSession = async (db: PaymentDb, orderId: string) => {
  const result = await db.raw(SELECT_MEDUSA_CASHFREE_SESSION, [orderId])
  if (result?.rows?.length !== 1) deny("Missing or ambiguous Medusa payment session")
  const row = result.rows[0]
  const sessionId = id(row.id, "Medusa payment session")
  if (!/^payses_[A-Za-z0-9_-]{4,100}$/.test(sessionId) ||
      row.provider_id !== providerId ||
      row.currency_code !== "inr" ||
      row.collection_currency !== "inr" ||
      !["pending", "pending_authorization", "requires_more"].includes(row.status) ||
      !["not_paid", "awaiting"].includes(row.collection_status)) {
    deny("Medusa payment session is not eligible for evidence intake")
  }
  const data = row.data
  if (!data || Array.isArray(data) || typeof data !== "object" ||
      data.order_id !== orderId || data.medusa_session_id !== sessionId ||
      data.currency_code !== "INR" || data.status !== "sandbox_session_created") {
    deny("Cashfree order is not bound to the Medusa session")
  }
  const expectedGatewayOrder = "mcf_" +
    createHash("sha256").update(sessionId).digest("hex").slice(0, 40)
  if (expectedGatewayOrder !== orderId) deny("Cashfree order ID is not derived from Medusa session")
  const amount = paise(row.amount)
  const collectionAmount = paise(row.collection_amount)
  if (collectionAmount < amount ||
      !Number.isSafeInteger(data.amount_paise) ||
      data.amount_paise !== amount) {
    deny("Medusa payment amount and gateway intent disagree")
  }
  return { sessionId, amount }
}

/**
 * One webhook iteration. Return `verified_unsettled` ONLY.
 * Caller MUST NOT authorize Medusa Payment, capture, or book a courier.
 */
export async function recordSignedCashfreeWebhook({
  sdk, db, signature, timestamp, rawBody, nowMs = Date.now(),
}: {
  sdk: CashfreeWebhookClient | Cashfree
  db: PaymentDb
  signature: unknown
  timestamp: unknown
  rawBody: unknown
  nowMs?: number
}) {
  if (typeof signature !== "string" || !signature.trim() ||
      typeof timestamp !== "string" || !/^\d{10}$/.test(timestamp) ||
      typeof rawBody !== "string" || rawBody.length < 2 ||
      Buffer.byteLength(rawBody, "utf8") > 100_000) {
    deny("Invalid signed webhook inputs")
  }
  if (!Number.isSafeInteger(nowMs) ||
      Math.abs(nowMs - Number(timestamp) * 1000) > 15 * 60_000) {
    deny("Expired or future webhook timestamp")
  }
  if (!db || typeof db.raw !== "function") deny("Medusa database unavailable")
  const client = sdk as CashfreeWebhookClient
  try {
    await client.PGVerifyWebhookSignature(signature, rawBody, timestamp)
  } catch {
    deny("Cashfree webhook signature invalid")
  }
  let event: Record<string, any>
  try {
    event = JSON.parse(rawBody)
  } catch {
    deny("Invalid signed JSON")
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) deny("Invalid event")
  if (event.type !== "PAYMENT_SUCCESS_WEBHOOK") {
    return Object.freeze({ status: "ignored_non_success", authorized: false, fulfillmentReady: false })
  }
  const orderId = id(event.data?.order?.order_id, "Cashfree order ID")
  const expectedPaymentId = paymentId(event.data?.payment?.cf_payment_id)
  // Gateway event signature proves only that Cashfree sent this payload.
  // All expected values come from Medusa and independently polled Cashfree.
  const medusa = await verifiedSession(db, orderId)
  const [orderResponse, paymentResponse] = await Promise.all([
    client.PGFetchOrder(orderId),
    client.PGOrderFetchPayments(orderId),
  ])
  const order = orderResponse?.data
  const payments = paymentResponse?.data
  if (!order || order.order_id !== orderId ||
      order.order_status !== "PAID" ||
      order.order_currency !== "INR" ||
      paise(order.order_amount) !== medusa.amount ||
      !Array.isArray(payments)) {
    deny("Cashfree paid order does not match Medusa")
  }
  const successes = payments.filter(p => p && p.payment_status === "SUCCESS")
  if (successes.length !== 1) deny("Cashfree successful payment count is not one")
  const successfulPayment = successes[0]
  if (paymentId(successfulPayment.cf_payment_id) !== expectedPaymentId ||
      (successfulPayment.order_id !== undefined && successfulPayment.order_id !== orderId) ||
      (successfulPayment.payment_currency !== undefined &&
       successfulPayment.payment_currency !== "INR") ||
      paise(successfulPayment.payment_amount) !== medusa.amount) {
    deny("Cashfree payment ID/currency/amount mismatch")
  }
  const proofKey = `cashfree:${orderId}:${expectedPaymentId}`
  let persisted
  try {
    persisted = await db.raw(RECORD_CASHFREE_EVIDENCE,
      [orderId, expectedPaymentId, medusa.sessionId, medusa.amount, proofKey])
  } catch (err: any) {
    if (err?.code === "23505" || err?.code === "23514") deny("Cashfree evidence conflicts with existing receipt")
    throw err
  }
  if (persisted?.rows?.length !== 1 || persisted.rowCount !== 1) {
    deny("Cashfree payment evidence could not be recorded")
  }
  const row = persisted.rows[0]
  if (row.cashfree_order_id !== orderId ||
      row.cf_payment_id !== expectedPaymentId ||
      row.medusa_payment_session_id !== medusa.sessionId ||
      String(row.amount_paise) !== String(medusa.amount) ||
      row.currency !== "INR" || row.proof_key !== proofKey ||
      row.stage !== "verified_unsettled") {
    deny("Stored gateway evidence was altered or mismatched")
  }
  return Object.freeze({
    status: "verified_unsettled",
    medusaPaymentSessionId: medusa.sessionId,
    paymentProofKey: proofKey,
    capturedInMedusa: false,
    fulfillmentReady: false,
  })
}
