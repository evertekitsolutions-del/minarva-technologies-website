/**
 * Read-only orchestration: Cashfree payment proof + live courier quote
 * -> provider-neutral fulfillment handoff. This module NEVER books a shipment,
 * captures a payment, changes Medusa stock, or emits an order notification.
 *
 * All monetary values are integer INR paise from the trusted Medusa server.
 */
import { createHash } from "node:crypto"
import { checkoutSplit, validateQuoteForCheckout } from "./checkout-pricing.mjs"
import { reconcileCashfreePayment } from "./cashfree-proof.mjs"

const validId = (value, label) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{3,100}$/.test(value)) {
    throw new TypeError(`Invalid ${label}`)
  }
  return value
}

const validPaise = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Invalid ${label} (expected integer paise)`)
  }
  return value
}

const fingerprint = (...parts) =>
  createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 48)

/**
 * These inputs MUST be fetched from server-authoritative Medusa checkout and
 * courier quote persistence. Never pass an untrusted browser quote or total.
 */
export async function prepareShippingHandoff({
  sdk,
  medusaOrderRef,
  cashfreeOrderId,
  cashfreePaymentId,
  merchandisePaise,
  shippingPaise,
  codHandlingPaise = 0,
  method,
  quote,
  destinationPincode,
  now = Date.now(),
}) {
  validId(medusaOrderRef, "Medusa order reference")
  validId(cashfreeOrderId, "Cashfree gateway order ID")
  if (cashfreePaymentId !== undefined) validId(cashfreePaymentId, "Cashfree payment ID")
  const split = checkoutSplit({ merchandisePaise, shippingPaise, codHandlingPaise, method })
  const selected = validateQuoteForCheckout(quote, {
    method, destinationPincode, now,
  })
  if (selected.totalChargePaise !== split.shippingPaise) {
    throw new Error("Courier quote differs from authoritative checkout shipping amount")
  }

  if (method === "partial_cod" && selected.partialCodSupported !== true) {
    throw new Error("Courier account cannot collect the residual COD")
  }

  // This calls the official Cashfree SDK to fetch the actual PAID order and
  // exactly one matching SUCCESS payment; browser redirects cannot satisfy it.
  const proof = await reconcileCashfreePayment({
    sdk,
    expectedOrderId: cashfreeOrderId,
    expectedAmountPaise: split.payableNowPaise,
    expectedPaymentId: cashfreePaymentId,
  })
  if (proof.verified !== true || proof.currency !== "INR") {
    throw new Error("Missing verified Cashfree payment evidence")
  }

  const collectablePaise = split.onDeliveryPaise
  return Object.freeze({
    provider: "shiprocket",
    medusaOrderRef,
    gatewayOrderId: proof.orderId,
    gatewayPaymentId: proof.paymentId,
    paymentIdempotencyKey: proof.idempotencyKey,
    method,
    courierId: selected.providerCourierId,
    destinationPincode,
    quoteExpiry: selected.expiresAt,
    prepaidCapturedPaise: proof.amountPaise,
    codCollectablePaise: collectablePaise,
    invoiceTotalPaise: split.totalPaise,
    handoffKey: "handoff_" + fingerprint(medusaOrderRef, proof.idempotencyKey,
      selected.providerCourierId, String(collectablePaise)),
    // This is NOT an instruction to send any shipment automatically.
    status: "validated_draft_not_booked",
  })
}

/**
 * After an authorized courier booking attempt, reject any provider response
 * which would collect a different COD amount or ship to another destination.
 * The integration must cancel/escalate a mismatched actual booking; this
 * function itself performs NO external cancellation/booking.
 */
export function assertCourierBookingMatchesHandoff(handoff, receipt) {
  if (!handoff || handoff.status !== "validated_draft_not_booked") {
    throw new TypeError("A server-verified shipment draft is required")
  }
  if (!receipt || receipt.provider !== "shiprocket" ||
      receipt.courierId !== handoff.courierId ||
      receipt.destinationPincode !== handoff.destinationPincode ||
      receipt.medusaOrderRef !== handoff.medusaOrderRef) {
    throw new Error("Courier booked shipment for wrong order, courier or address")
  }
  const providerCollectable = validPaise(receipt.codCollectablePaise, "actual courier COD")
  if (providerCollectable !== handoff.codCollectablePaise) {
    throw new Error("CRITICAL: actual courier COD collectable differs from paid split")
  }
  validId(receipt.shiprocketOrderId, "courier booking ID")
  validId(receipt.awb, "AWB")
  return Object.freeze({
    provider: "shiprocket",
    medusaOrderRef: handoff.medusaOrderRef,
    shiprocketOrderId: receipt.shiprocketOrderId,
    awb: receipt.awb,
    courierId: receipt.courierId,
    codCollectablePaise: providerCollectable,
    prepaidCapturedPaise: handoff.prepaidCapturedPaise,
    handoffKey: handoff.handoffKey,
    status: "booking_matches_draft_pending_persistent_reconciliation",
  })
}
