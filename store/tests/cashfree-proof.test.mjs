import test from "node:test"
import assert from "node:assert/strict"
import {
  CashfreeProofError,
  rupeesToPaise,
  verifyCashfreeWebhook,
  reconcileCashfreePayment,
  reconcileSignedCashfreeWebhook,
} from "../lib/cashfree-proof.mjs"

const NOW = 1_782_000_000_000
const TS = String(NOW / 1000)
const ORDER = "minarva_order_001"
const PAYMENT = "4898541050001"
const amountPaise = 13_080_00

const makeSdk = (changes = {}) => ({
  PGVerifyWebhookSignature: async (signature, rawBody, timestamp) => {
    if (signature !== "signed-test-fixture" || timestamp !== TS ||
        !rawBody.includes("PAYMENT_SUCCESS_WEBHOOK")) throw new Error("bad signature")
  },
  PGFetchOrder: async () => ({ data: {
    order_id: ORDER, order_status: "PAID",
    order_currency: "INR", order_amount: "13080.00",
  }}),
  PGOrderFetchPayments: async () => ({ data: [{
    order_id: ORDER, cf_payment_id: Number(PAYMENT),
    payment_status: "SUCCESS", payment_amount: "13080.00",
    payment_currency: "INR",
  }]}),
  ...changes,
})

const signedEvent = (type = "PAYMENT_SUCCESS_WEBHOOK", id = ORDER, paymentId = PAYMENT) =>
  JSON.stringify({ type, data: {
    order: { order_id: id, order_amount: 13080 },
    payment: { cf_payment_id: Number(paymentId) },
  }})

test("parses rupees into paise with exact 2-decimal bound", () => {
  assert.equal(rupeesToPaise("13080.00"), amountPaise)
  assert.equal(rupeesToPaise(13080), amountPaise)
  assert.equal(rupeesToPaise("0.01"), 1)
  for (const invalid of ["0", "-1", "1.001", "1e2", "1.2.3", 0, NaN, Infinity, "001", undefined, 12.345]) {
    assert.throws(() => rupeesToPaise(invalid), CashfreeProofError)
  }
})

test("official SDK verified signature yields a non-authoritative hint", async () => {
  const hint = await verifyCashfreeWebhook({
    sdk: makeSdk(), signature: "signed-test-fixture", rawBody: signedEvent(), timestamp: TS, nowMs: NOW,
  })
  assert.deepEqual(hint, { actionable: true, orderId: ORDER, paymentId: PAYMENT })
  assert.equal(hint.verified, undefined)
})

test("invalid or absent signature is always rejected", async () => {
  for (const signature of ["", "forged"]) {
    await assert.rejects(() => verifyCashfreeWebhook({
      sdk: makeSdk(), signature, rawBody: signedEvent(), timestamp: TS, nowMs: NOW,
    }), CashfreeProofError)
  }
})

test("stale or future signature timestamp is rejected", async () => {
  for (const timestamp of [String(Number(TS) - 10000), String(Number(TS) + 10000), "123", "abc"]) {
    await assert.rejects(() => verifyCashfreeWebhook({
      sdk: makeSdk(), signature: "signed-test-fixture", rawBody: signedEvent(), timestamp, nowMs: NOW,
    }), CashfreeProofError)
  }
})

test("signed nonpayment webhook does not trigger payment confirmation", async () => {
  const result = await reconcileSignedCashfreeWebhook({
    sdk: makeSdk({PGVerifyWebhookSignature: async () => {}}),
    signature: "signed-test-fixture", timestamp: TS,
    rawBody: signedEvent("PAYMENT_FAILED_WEBHOOK"),
    nowMs: NOW, expectedOrderId: ORDER, expectedAmountPaise: amountPaise,
  })
  assert.equal(result.actionable, false)
})

test("signed JSON malformed after SDK verification fails closed", async () => {
  await assert.rejects(() => verifyCashfreeWebhook({
    sdk: makeSdk({PGVerifyWebhookSignature: async () => {}}),
    signature: "signed-test-fixture", timestamp: TS,
    rawBody: "{nope", nowMs: NOW,
  }), CashfreeProofError)
})

test("official SDK order + payment both must agree with the expected value", async () => {
  const proof = await reconcileCashfreePayment({
    sdk: makeSdk(), expectedOrderId: ORDER,
    expectedPaymentId: PAYMENT, expectedAmountPaise: amountPaise,
  })
  assert.deepEqual(proof, {
    provider: "cashfree", orderId: ORDER, paymentId: PAYMENT, amountPaise,
    currency: "INR", idempotencyKey: `cashfree:${ORDER}:${PAYMENT}`, verified: true,
  })
})

test("does not trust forged webhook amount, only trusted Medusa amount and official order", async () => {
  await assert.rejects(() => reconcileSignedCashfreeWebhook({
    sdk: makeSdk(), signature: "signed-test-fixture",
    timestamp: TS, rawBody: signedEvent(), nowMs: NOW,
    expectedOrderId: ORDER, expectedAmountPaise: amountPaise + 1,
  }), CashfreeProofError)
})

test("rejects other order in signed webhook", async () => {
  let queries = 0
  await assert.rejects(() => reconcileSignedCashfreeWebhook({
    sdk: makeSdk({ PGFetchOrder: async () => { queries++; throw new Error("should not be called") },
    PGVerifyWebhookSignature: async () => {} }),
    signature: "signed-test-fixture", timestamp: TS,
    rawBody: signedEvent("PAYMENT_SUCCESS_WEBHOOK", "someone_else"), nowMs: NOW,
    expectedOrderId: ORDER, expectedAmountPaise: amountPaise,
  }), CashfreeProofError)
  assert.equal(queries, 0)
})

test("returns proof only after verifying signature, order and exact matching transaction", async () => {
  const result = await reconcileSignedCashfreeWebhook({
    sdk: makeSdk(), signature: "signed-test-fixture",
    timestamp: TS, rawBody: signedEvent(), nowMs: NOW,
    expectedOrderId: ORDER, expectedAmountPaise: amountPaise,
  })
  assert.equal(result.actionable, true)
  assert.equal(result.proof.verified, true)
})

test("rejects gateway order pending even if payment lists success", async () => {
  await assert.rejects(() => reconcileCashfreePayment({
    sdk: makeSdk({ PGFetchOrder: async () => ({data:{
      order_id: ORDER, order_status:"ACTIVE", order_currency:"INR", order_amount:"13080.00",
    }}) }), expectedOrderId: ORDER, expectedAmountPaise: amountPaise,
  }), CashfreeProofError)
})

test("rejects partial payment and wrong currency", async () => {
  for (const data of [
    { payment_status:"SUCCESS", payment_amount:"13079.99", cf_payment_id:Number(PAYMENT) },
    { payment_status:"SUCCESS", payment_amount:"13080", payment_currency:"USD", cf_payment_id:Number(PAYMENT) },
  ]) {
    await assert.rejects(() => reconcileCashfreePayment({
      sdk: makeSdk({PGOrderFetchPayments: async () => ({data: [data]})}),
      expectedOrderId: ORDER, expectedAmountPaise: amountPaise,
    }), CashfreeProofError)
  }
})

test("rejects multiple successful payments rather than double-settle", async () => {
  const payment = {cf_payment_id: Number(PAYMENT), payment_status:"SUCCESS", payment_amount:"13080"}
  await assert.rejects(() => reconcileCashfreePayment({
    sdk: makeSdk({ PGOrderFetchPayments: async () => ({data: [payment,payment]}) }),
    expectedOrderId: ORDER, expectedAmountPaise: amountPaise,
  }), CashfreeProofError)
})

test("rejects gateway payment identifier mismatch", async () => {
  await assert.rejects(() => reconcileCashfreePayment({
    sdk: makeSdk(), expectedOrderId: ORDER, expectedAmountPaise: amountPaise,
    expectedPaymentId:"another_payment",
  }), CashfreeProofError)
})

test("rejects gateway order ID and missing SDK methods", async () => {
  await assert.rejects(() => reconcileCashfreePayment({
    sdk: makeSdk({ PGFetchOrder: async () => ({data:{
      order_id: "other", order_status:"PAID", order_currency:"INR", order_amount:"13080",
    }}) }),
    expectedOrderId: ORDER, expectedAmountPaise: amountPaise,
  }), CashfreeProofError)
  await assert.rejects(() => reconcileCashfreePayment({
    sdk: {}, expectedOrderId: ORDER, expectedAmountPaise: amountPaise,
  }), CashfreeProofError)
})

test("repeated verified webhook yields identical idempotency key, never executes fulfillment", async () => {
  const run = () => reconcileSignedCashfreeWebhook({
    sdk: makeSdk(), signature:"signed-test-fixture", timestamp: TS,
    rawBody: signedEvent(), nowMs: NOW, expectedOrderId: ORDER, expectedAmountPaise: amountPaise,
  })
  const [a,b] = await Promise.all([run(),run()])
  assert.equal(a.proof.idempotencyKey, b.proof.idempotencyKey)
  assert.equal(typeof a.proof.shipOrder, "undefined")
})
