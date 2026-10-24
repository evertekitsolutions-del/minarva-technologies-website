import test from "node:test"
import assert from "node:assert/strict"
import {
  prepareShippingHandoff,
  assertCourierBookingMatchesHandoff,
} from "../lib/partial-cod-handoff.mjs"

const now = Date.parse("2026-10-24T14:00:00Z")
const PIN = "695020"
const ref = "minarva_order_001"
const gatewayOrderId = "mcf_example_001"
const paymentId = "4898541050001"
const quote = Object.freeze({
  providerCourierId: "sr_42", destinationPincode: PIN, serviceable: true,
  partialCodSupported: true, totalChargePaise: 18500, estimatedDays: 3,
  expiresAt: "2026-10-24T14:05:00Z",
})

const checkout = (overrides = {}) => ({
  medusaOrderRef: ref,
  cashfreeOrderId: gatewayOrderId,
  cashfreePaymentId: paymentId,
  merchandisePaise: 1290000,
  shippingPaise: 18500,
  codHandlingPaise: 2500,
  method: "partial_cod",
  quote,
  destinationPincode: PIN,
  now,
  ...overrides,
})

const gateway = (amountPaise = 21000, overrides = {}) => {
  let calls = 0
  const sdk = {
    PGFetchOrder: async (orderId) => {
      calls++
      return { data: {
        order_id: orderId, order_status: "PAID", order_currency: "INR",
        order_amount: (amountPaise / 100).toFixed(2),
      }}
    },
    PGOrderFetchPayments: async () => {
      calls++
      return { data: [{
        order_id: gatewayOrderId,
        cf_payment_id: Number(paymentId),
        payment_status: "SUCCESS",
        payment_amount: (amountPaise / 100).toFixed(2),
        payment_currency: "INR",
      }]}
    },
    ...overrides,
  }
  return { sdk, requests: () => calls }
}

const booking = (intent, changes = {}) => ({
  provider: "shiprocket",
  medusaOrderRef: ref,
  courierId: "sr_42",
  destinationPincode: PIN,
  codCollectablePaise: intent.codCollectablePaise,
  shiprocketOrderId: "ship_1020",
  awb: "AWB_101010",
  ...changes,
})

test("paid courier/handling advance yields product-only residual COD", async () => {
  const { sdk } = gateway()
  const intent = await prepareShippingHandoff({ ...checkout(), sdk })
  assert.equal(intent.status, "validated_draft_not_booked")
  assert.equal(intent.prepaidCapturedPaise, 21000)
  assert.equal(intent.codCollectablePaise, 1290000)
  assert.equal(intent.invoiceTotalPaise, 1311000)
  assert.equal(intent.prepaidCapturedPaise + intent.codCollectablePaise, intent.invoiceTotalPaise)
  assert.equal(intent.gatewayPaymentId, paymentId)
  assert(Object.isFrozen(intent))
})

test("reject expired or different PIN courier quote before gateway call", async () => {
  const record = gateway()
  await assert.rejects(() => prepareShippingHandoff({
    ...checkout({ now: now + 600_000 }), sdk: record.sdk,
  }), /Expired/)
  await assert.rejects(() => prepareShippingHandoff({
    ...checkout({ destinationPincode: "682001" }), sdk: record.sdk,
  }), /matching/)
  assert.equal(record.requests(), 0)
})

test("reject quote price that differs from authenticated split", async () => {
  const record = gateway()
  await assert.rejects(() => prepareShippingHandoff({
    ...checkout({ quote: { ...quote, totalChargePaise: 17500 } }), sdk: record.sdk,
  }), /differs/)
  assert.equal(record.requests(), 0)
})

test("reject carrier without explicit partial-COD capability", async () => {
  const record = gateway()
  await assert.rejects(() => prepareShippingHandoff({
    ...checkout({ quote: { ...quote, partialCodSupported: false } }), sdk: record.sdk,
  }), /Expired|unsupported/)
  assert.equal(record.requests(), 0)
})

test("reject forged gateway advance without full amount paid", async () => {
  await assert.rejects(() => prepareShippingHandoff({
    ...checkout(), sdk: gateway(20000).sdk,
  }), /amount|mismatch/)
})

test("reject gateway order that is still ACTIVE", async () => {
  const sdk = gateway(21000, {
    PGFetchOrder: async () => ({
      data: {
        order_id: gatewayOrderId, order_status: "ACTIVE", order_currency: "INR",
        order_amount: "210.00",
      },
    }),
  }).sdk
  await assert.rejects(() => prepareShippingHandoff({ ...checkout(), sdk }), /mismatch/)
})

test("prepaid must capture the full invoice and collect zero COD", async () => {
  const { sdk } = gateway(1311000)
  const handoff = await prepareShippingHandoff({
    ...checkout({ method: "prepaid" }), sdk,
  })
  assert.equal(handoff.codCollectablePaise, 0)
  assert.equal(handoff.prepaidCapturedPaise, 1311000)
  assert.equal(handoff.status, "validated_draft_not_booked")
})

test("reject untrusted float INR money or disabled payment method", async () => {
  const { sdk } = gateway()
  await assert.rejects(() => prepareShippingHandoff({
    ...checkout({ shippingPaise: 18500.5 }), sdk,
  }), /integer/)
  await assert.rejects(() => prepareShippingHandoff({
    ...checkout({ method: "cod" }), sdk,
  }), /Unsupported/)
})

test("verified handoff is deterministic for retries but never books a shipment", async () => {
  const { sdk } = gateway()
  const [a, b] = await Promise.all([
    prepareShippingHandoff({ ...checkout(), sdk }),
    prepareShippingHandoff({ ...checkout(), sdk }),
  ])
  assert.equal(a.handoffKey, b.handoffKey)
  assert(!("awb" in a))
  assert(!("book" in a))
})

test("matched courier receipt permits only pending persistent reconciliation", async () => {
  const { sdk } = gateway()
  const intent = await prepareShippingHandoff({ ...checkout(), sdk })
  const receipt = assertCourierBookingMatchesHandoff(intent, booking(intent))
  assert.equal(receipt.status, "booking_matches_draft_pending_persistent_reconciliation")
  assert.equal(receipt.codCollectablePaise, 1290000)
  assert.equal(receipt.prepaidCapturedPaise, 21000)
  assert(Object.isFrozen(receipt))
})

test("reject courier billing full invoice COD instead of product residual", async () => {
  const { sdk } = gateway()
  const intent = await prepareShippingHandoff({ ...checkout(), sdk })
  assert.throws(() => assertCourierBookingMatchesHandoff(intent,
    booking(intent, { codCollectablePaise: 1311000 })), /CRITICAL/)
})

test("reject wrong courier, wrong order, wrong address, and missing AWB", async () => {
  const { sdk } = gateway()
  const intent = await prepareShippingHandoff({ ...checkout(), sdk })
  for (const wrong of [
    { courierId: "sr_other" },
    { medusaOrderRef: "different_order" },
    { destinationPincode: "682001" },
    { provider: "other-provider" },
    { awb: "" },
  ]) {
    assert.throws(() => assertCourierBookingMatchesHandoff(intent,
      booking(intent, wrong)), /wrong|Invalid/)
  }
})

test("reject untrusted draft/receipt shape and negative COD", async () => {
  assert.throws(() => assertCourierBookingMatchesHandoff({ status: "user_submitted" }, {}), /server-verified/)
  const { sdk } = gateway()
  const verifiedDraft = await prepareShippingHandoff({ ...checkout(), sdk })
  assert.throws(() => assertCourierBookingMatchesHandoff(verifiedDraft,
    booking(verifiedDraft, { codCollectablePaise: -1 })), /integer paise/)
})

test("reject structurally forged or serialized validated drafts", async () => {
  const { sdk } = gateway()
  const authentic = await prepareShippingHandoff({ ...checkout(), sdk })
  const cloned = JSON.parse(JSON.stringify(authentic))
  assert.deepEqual(cloned, authentic)
  assert.throws(
    () => assertCourierBookingMatchesHandoff(cloned, booking(authentic)),
    /server-verified/,
  )
})
