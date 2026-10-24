/**
 * Cashfree payment evidence gate for the Medusa-backed Minarva CCTV Store.
 *
 * This deliberately does NOT create orders, mark Medusa payments as captured,
 * or book Shiprocket shipments. The caller must resolve trusted expected
 * amounts/order IDs from the server's payment collection and perform
 * transactionally idempotent persistence BEFORE any fulfillment.
 *
 * Reuses Cashfree's official cashfree-pg >= 5 SDK methods, rather than
 * reimplementing payment APIs or HMAC signature verification.
 */
const INDIAN_RUPEES = "INR"
const SUCCESS = "SUCCESS"
const PAID = "PAID"

export class CashfreeProofError extends Error {
  constructor(message) {
    super(message)
    this.name = "CashfreeProofError"
  }
}

const fail = (message) => {
  throw new CashfreeProofError(message)
}

const ownString = (value, name) => {
  if (typeof value !== "string" || !value.trim()) fail(`Invalid ${name}`)
  return value
}

const plainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

/** Parse INR amounts without allowing floats, 3-decimal values or negatives. */
export function rupeesToPaise(value) {
  let text
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) fail("Invalid INR amount")
    text = String(value)
  } else if (typeof value === "string") {
    text = value
  } else {
    fail("Invalid INR amount")
  }

  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) fail("Invalid INR precision")
  const [rupees, fraction = ""] = text.split(".")
  const paise = BigInt(rupees) * 100n + BigInt((fraction + "00").slice(0, 2))
  if (paise <= 0n || paise > BigInt(Number.MAX_SAFE_INTEGER)) fail("Unsafe INR amount")
  return Number(paise)
}

const positivePaise = (value, name) => {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`Invalid ${name}`)
  return value
}

const identity = (value, name) => {
  const id = ownString(value, name)
  if (id.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(id)) fail(`Invalid ${name}`)
  return id
}

/**
 * Verify a Cashfree webhook with the OFFICIAL SDK before parsing the JSON.
 * Raw body must be byte-for-byte identical to the HTTP request body.
 * This verifier is strict on age; separately poll Cashfree to reconcile
 * delayed retries that are deliberately rejected by the age gate.
 */
export async function verifyCashfreeWebhook({
  sdk,
  signature,
  timestamp,
  rawBody,
  nowMs = Date.now(),
  maxAgeMs = 15 * 60_000,
}) {
  if (typeof sdk?.PGVerifyWebhookSignature !== "function") fail("Cashfree SDK unavailable")
  ownString(signature, "Cashfree signature")
  if (typeof rawBody !== "string" || rawBody.length < 2 || rawBody.length > 512_000) {
    fail("Invalid raw Cashfree webhook")
  }

  const ts = ownString(timestamp, "webhook timestamp")
  if (!/^\d{10}$/.test(ts)) fail("Invalid webhook timestamp format")
  const parsedMs = Number(ts) * 1000
  if (!Number.isSafeInteger(nowMs) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0 ||
      Math.abs(nowMs - parsedMs) > maxAgeMs) {
    fail("Stale or future Cashfree webhook")
  }

  try {
    // Do not compute our own MAC: the installed official SDK owns verification.
    await sdk.PGVerifyWebhookSignature(signature, rawBody, ts)
  } catch {
    fail("Cashfree webhook signature verification failed")
  }

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    fail("Invalid signed Cashfree JSON")
  }
  if (!plainObject(event)) fail("Invalid signed Cashfree event")

  if (event.type !== "PAYMENT_SUCCESS_WEBHOOK") {
    return { actionable: false, type: String(event.type || "unknown") }
  }
  const orderId = identity(event.data?.order?.order_id, "webhook order id")
  const paymentId = identity(String(event.data?.payment?.cf_payment_id ?? ""), "webhook payment id")

  // Only hints from the verified webhook; NEVER mark payment confirmed here.
  return Object.freeze({ actionable: true, orderId, paymentId })
}

/**
 * Fetch server-side order and successful payment through official Cashfree SDK.
 * 'PAID' on an order alone, or a success-looking browser/webhook response,
 * is NOT sufficient to issue a payment proof.
 */
export async function reconcileCashfreePayment({
  sdk,
  expectedOrderId,
  expectedAmountPaise,
  expectedPaymentId,
  expectedCurrency = INDIAN_RUPEES,
}) {
  if (typeof sdk?.PGFetchOrder !== "function" ||
      typeof sdk?.PGOrderFetchPayments !== "function") fail("Cashfree SDK unavailable")
  const orderId = identity(expectedOrderId, "expected order id")
  const amount = positivePaise(expectedAmountPaise, "expected amount")
  if (expectedCurrency !== INDIAN_RUPEES) fail("Only INR is supported")
  const paymentId = expectedPaymentId === undefined ? undefined :
    identity(String(expectedPaymentId), "expected payment id")

  // Expected order id and amount MUST come from trusted Medusa persistence,
  // not from the webhook payload or shopper's browser.
  const [orderResponse, paymentsResponse] = await Promise.all([
    sdk.PGFetchOrder(orderId),
    sdk.PGOrderFetchPayments(orderId),
  ])
  const order = orderResponse?.data
  const payments = paymentsResponse?.data
  if (!plainObject(order) || !Array.isArray(payments)) fail("Unusable gateway response")
  if (order.order_id !== orderId || order.order_status !== PAID ||
      order.order_currency !== expectedCurrency ||
      rupeesToPaise(order.order_amount) !== amount) {
    fail("Cashfree order evidence mismatch")
  }

  const successes = payments.filter((p) => plainObject(p) && p.payment_status === SUCCESS)
  if (successes.length !== 1) fail("Missing or ambiguous successful gateway payment")
  const payment = successes[0]
  const verifiedPaymentId = identity(String(payment.cf_payment_id ?? ""), "gateway payment id")
  if (paymentId !== undefined && verifiedPaymentId !== paymentId) {
    fail("Gateway payment does not match signed event")
  }
  if (rupeesToPaise(payment.payment_amount) !== amount ||
      (payment.payment_currency !== undefined && payment.payment_currency !== expectedCurrency)) {
    fail("Cashfree payment amount/currency mismatch")
  }
  if (payment.order_id !== undefined && payment.order_id !== orderId) {
    fail("Cashfree payment order id mismatch")
  }

  return Object.freeze({
    provider: "cashfree",
    orderId,
    paymentId: verifiedPaymentId,
    amountPaise: amount,
    currency: INDIAN_RUPEES,
    idempotencyKey: `cashfree:${orderId}:${verifiedPaymentId}`,
    verified: true,
  })
}

export async function reconcileSignedCashfreeWebhook({
  sdk, signature, timestamp, rawBody, nowMs,
  expectedOrderId, expectedAmountPaise,
}) {
  const event = await verifyCashfreeWebhook({ sdk, signature, timestamp, rawBody, nowMs })
  if (!event.actionable) return { actionable: false, type: event.type }
  if (event.orderId !== expectedOrderId) fail("Signed webhook belongs to another order")
  const proof = await reconcileCashfreePayment({
    sdk, expectedOrderId, expectedAmountPaise, expectedPaymentId: event.paymentId,
  })
  return { actionable: true, proof }
}
