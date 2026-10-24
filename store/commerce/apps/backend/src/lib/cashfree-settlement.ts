import { createHash } from "node:crypto"
import type { Cashfree } from "cashfree-pg"

type SqlResult = { rows?: Record<string, any>[] }
export interface PaymentLedgerConnection {
  raw(sql: string, bindings: unknown[]): Promise<SqlResult>
}
export interface CashfreePaidClient {
  PGFetchOrder(orderId: string): Promise<{ data?: Record<string, any> }>
  PGOrderFetchPayments(orderId: string): Promise<{ data?: Record<string, any>[] }>
}

const providerId = "pp_minarva-cashfree-sandbox_cashfree-sandbox"

export const SELECT_SETTLEMENT_PROOF = `
SELECT ps.id AS medusa_session_id, ps.amount::text AS session_amount,
  ps.currency_code AS session_currency, ps.provider_id, ps.status AS session_status,
  ps.data AS session_data, pc.amount::text AS collection_amount,
  pc.currency_code AS collection_currency, pc.status AS collection_status,
  ev.cashfree_order_id, ev.cf_payment_id, ev.amount_paise::text AS paid_paise,
  ev.proof_key, ev.stage
FROM payment_session ps
INNER JOIN payment_collection pc ON pc.id = ps.payment_collection_id
INNER JOIN store_cashfree_payment_evidence ev ON ev.medusa_payment_session_id = ps.id
WHERE ps.id = ? AND ev.cashfree_order_id = ?
  AND ps.deleted_at IS NULL AND pc.deleted_at IS NULL
LIMIT 2
`

const fail = (description: string): never => {
  throw new Error("Cashfree settlement refused: " + description)
}
const toPaise = (value: unknown): number => {
  const str = typeof value === "string" || typeof value === "number" ? String(value) : ""
  if (!/^(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(str)) fail("invalid INR amount")
  const [whole, fraction = ""] = str.split(".")
  const result = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0,2))
  if (result < 1n || result > BigInt(Number.MAX_SAFE_INTEGER)) fail("unsafe INR amount")
  return Number(result)
}
const ensureId = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(value)) fail("invalid " + label)
  return value
}
const gatewayOrderId = (medusaSessionId: string) =>
  "mcf_" + createHash("sha256").update(medusaSessionId).digest("hex").slice(0,40)

/**
 * Returns null when there is no verified, persistent gateway evidence.
 * Throws on a conflicting record or invalid expected amount.
 * Only FULL PREPAID can be authorized; shipping-advance PARTIAL COD
 * is explicitly excluded because the payment collection total is higher.
 *
 * The caller MUST then use Medusa's native authorizePaymentSession workflow.
 * No direct edits to payment, capture, order, or shipment tables.
 */
export async function confirmCashfreePrepaidProof({
  db, sdk, sessionData,
}: {
  db: PaymentLedgerConnection
  sdk: CashfreePaidClient | Cashfree
  sessionData: Record<string, unknown> | undefined
}): Promise<null | { sessionId: string; gatewayOrderId: string; paymentId: string; amountPaise: number }> {
  if (!db || typeof db.raw !== "function") fail("PostgreSQL authority unavailable")
  const data = sessionData
  if (!data || typeof data !== "object" || Array.isArray(data)) fail("session data missing")
  const sessionId = ensureId(data.medusa_session_id, "Medusa payment session")
  if (!/^payses_[A-Za-z0-9_-]{4,100}$/.test(sessionId)) fail("invalid Medusa payment ID")
  const orderId = ensureId(data.order_id, "Cashfree order")
  if (gatewayOrderId(sessionId) !== orderId ||
      data.status !== "sandbox_session_created" || data.currency_code !== "INR") {
    fail("Medusa sandbox payment order provenance mismatch")
  }
  const result = await db.raw(SELECT_SETTLEMENT_PROOF,[sessionId,orderId])
  if (!Array.isArray(result?.rows) || result.rows.length > 1) fail("ambiguous payment proof")
  if (!result.rows.length) return null

  const row = result.rows[0]
  const paidId = ensureId(row.cf_payment_id, "verified payment")
  const amountPaise = toPaise(row.session_amount)
  if (row.medusa_session_id !== sessionId || row.cashfree_order_id !== orderId ||
      row.provider_id !== providerId ||
      row.session_currency !== "inr" || row.collection_currency !== "inr" ||
      !["pending","pending_authorization","requires_more"].includes(row.session_status) ||
      !["not_paid","awaiting"].includes(row.collection_status) ||
      row.stage !== "verified_unsettled" ||
      row.proof_key !== `cashfree:${orderId}:${paidId}` ||
      String(row.paid_paise) !== String(amountPaise) ||
      toPaise(row.collection_amount) !== amountPaise ||
      !Number.isSafeInteger(data.amount_paise) || data.amount_paise !== amountPaise) {
    fail("Medusa collection/evidence/amount mismatch; partial COD cannot be fully captured")
  }
  const stored = row.session_data
  if (!stored || stored.order_id !== orderId ||
      stored.medusa_session_id !== sessionId ||
      stored.amount_paise !== amountPaise ||
      stored.status !== "sandbox_session_created") {
    fail("payment session data changed since gateway intent")
  }
  const client = sdk as CashfreePaidClient
  if (typeof client.PGFetchOrder !== "function" ||
      typeof client.PGOrderFetchPayments !== "function") {
    fail("official Cashfree SDK unavailable")
  }
  const [orderResponse, paymentsResponse] = await Promise.all([
    client.PGFetchOrder(orderId), client.PGOrderFetchPayments(orderId),
  ])
  const order = orderResponse?.data
  const payments = paymentsResponse?.data
  if (!order || order.order_id !== orderId || order.order_status !== "PAID" ||
      order.order_currency !== "INR" || toPaise(order.order_amount) !== amountPaise ||
      !Array.isArray(payments)) fail("gateway order not independently confirmed")
  const successes = payments.filter(p => p && p.payment_status === "SUCCESS")
  if (successes.length !== 1) fail("ambiguous successful gateway transactions")
  const payment = successes[0]
  if (String(payment.cf_payment_id) !== paidId ||
      toPaise(payment.payment_amount) !== amountPaise ||
      (payment.payment_currency !== undefined && payment.payment_currency !== "INR") ||
      (payment.order_id !== undefined && payment.order_id !== orderId)) {
    fail("independent gateway payment does not match immutable receipt")
  }
  return Object.freeze({ sessionId, gatewayOrderId: orderId, paymentId: paidId, amountPaise })
}
