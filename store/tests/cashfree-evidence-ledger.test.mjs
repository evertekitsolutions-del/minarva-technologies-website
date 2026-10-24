import test from "node:test"
import assert from "node:assert/strict"
import {
  persistVerifiedCashfreeEvidence,
  PaymentEvidenceConflict,
  UPSERT_IDENTICAL_VERIFIED_EVIDENCE,
} from "../lib/cashfree-evidence-ledger.mjs"

const medusaPaymentSessionId = "payses_123abc45"
const cashfreeOrderId = "mcf_test_order_001"
const paymentId = "518230000123"
const amountPaise = 21900

const sdk = (overrides = {}) => ({
  PGFetchOrder: async () => ({ data: {
    order_id: cashfreeOrderId,
    order_status: "PAID",
    order_currency: "INR",
    order_amount: "219.00",
  } }),
  PGOrderFetchPayments: async () => ({ data: [{
    order_id: cashfreeOrderId,
    cf_payment_id: Number(paymentId),
    payment_status: "SUCCESS",
    payment_currency: "INR",
    payment_amount: "219.00",
  }] }),
  ...overrides,
})

function fakeDb() {
  const byOrder = new Map()
  const calls = []
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params })
      const [order, payment, session, amount, proofKey] = params
      for (const row of byOrder.values()) {
        if (row.cashfree_order_id !== order &&
            (row.cf_payment_id === payment ||
             row.medusa_payment_session_id === session ||
             row.proof_key === proofKey)) {
          const e = new Error("duplicate unique key")
          e.code = "23505"
          throw e
        }
      }
      let row = byOrder.get(order)
      if (row && (row.cf_payment_id !== payment ||
          row.medusa_payment_session_id !== session ||
          Number(row.amount_paise) !== amount ||
          row.proof_key !== proofKey)) return { rowCount: 0, rows: [] }
      if (!row) {
        row = { cashfree_order_id: order, cf_payment_id: payment,
          medusa_payment_session_id: session, amount_paise: String(amount),
          currency: "INR", proof_key: proofKey, stage: "verified_unsettled" }
        byOrder.set(order, row)
      }
      return { rowCount: 1, rows: [row] }
    },
  }
}

const args = (overrides = {}) => ({
  sdk: sdk(),
  db: fakeDb(),
  medusaPaymentSessionId,
  cashfreeOrderId,
  expectedAmountPaise: amountPaise,
  expectedPaymentId: paymentId,
  ...overrides,
})

test("prepared SQL is parameterized and atomic, not interpolated", () => {
  assert.match(UPSERT_IDENTICAL_VERIFIED_EVIDENCE, /VALUES \(\$1, \$2, \$3, \$4, 'INR', \$5\)/)
  assert.match(UPSERT_IDENTICAL_VERIFIED_EVIDENCE, /ON CONFLICT \(cashfree_order_id\)/)
  assert.match(UPSERT_IDENTICAL_VERIFIED_EVIDENCE, /existing\.medusa_payment_session_id = EXCLUDED\.medusa_payment_session_id/)
  assert.match(UPSERT_IDENTICAL_VERIFIED_EVIDENCE, /existing\.proof_key = EXCLUDED\.proof_key/)
})

test("verified Cashfree gateway evidence is persisted but does not settle Medusa", async () => {
  const db = fakeDb()
  const recorded = await persistVerifiedCashfreeEvidence(args({ db }))
  assert.deepEqual(recorded, {
    cashfreeOrderId, cashfreePaymentId: paymentId, medusaPaymentSessionId,
    amountPaise, proofKey: `cashfree:${cashfreeOrderId}:${paymentId}`,
    stage: "verified_unsettled", capturedInMedusa: false, fulfillmentAuthorized: false,
  })
  assert(Object.isFrozen(recorded))
  assert.equal(db.calls.length, 1)
  assert.equal(db.calls[0].params[3], 21900)
})

test("byte-equivalent gateway proof can replay without a new payment", async () => {
  const db = fakeDb()
  const first = await persistVerifiedCashfreeEvidence(args({db}))
  const second = await persistVerifiedCashfreeEvidence(args({db}))
  assert.deepEqual(first, second)
  assert.equal(db.calls.length, 2)
  assert(!("ship" in second))
})

test("same Cashfree order ID with another Medusa session must fail", async () => {
  const db = fakeDb()
  await persistVerifiedCashfreeEvidence(args({db}))
  await assert.rejects(() => persistVerifiedCashfreeEvidence(
    args({db, medusaPaymentSessionId:"payses_different99"})
  ), PaymentEvidenceConflict)
})

test("same Medusa payment session used for another gateway order is forbidden", async () => {
  const db = fakeDb()
  await persistVerifiedCashfreeEvidence(args({db}))
  const otherOrder = "mcf_other_order_001"
  await assert.rejects(() => persistVerifiedCashfreeEvidence(args({
    db, cashfreeOrderId:otherOrder,
    sdk:sdk({
      PGFetchOrder:async () => ({data:{
        order_id:otherOrder, order_status:"PAID", order_currency:"INR",order_amount:"219.00",
      }}),
      PGOrderFetchPayments:async () => ({data:[{
        order_id:otherOrder, cf_payment_id:100010001,
        payment_status:"SUCCESS",payment_amount:"219.00",payment_currency:"INR",
      }]}),
    }),
    expectedPaymentId:"100010001",
  })), PaymentEvidenceConflict)
})

test("same gateway payment reused across orders must fail", async () => {
  const db = fakeDb()
  await persistVerifiedCashfreeEvidence(args({db}))
  const otherOrder = "mcf_other_order_002"
  await assert.rejects(() => persistVerifiedCashfreeEvidence(args({
    db, cashfreeOrderId:otherOrder,
    medusaPaymentSessionId:"payses_anotherpaid",
    sdk:sdk({PGFetchOrder:async () => ({data:{
      order_id:otherOrder,order_status:"PAID",order_currency:"INR",order_amount:"219.00",
    }}),PGOrderFetchPayments:async()=>({data:[{
      order_id:otherOrder, cf_payment_id:Number(paymentId),
      payment_status:"SUCCESS",payment_currency:"INR",payment_amount:"219.00",
    }]})}),
  })), PaymentEvidenceConflict)
})

test("wrong price from the gateway never writes to database", async () => {
  const db = fakeDb()
  await assert.rejects(() => persistVerifiedCashfreeEvidence(args({
    db, sdk:sdk({PGFetchOrder:async()=>({data:{
      order_id:cashfreeOrderId,order_status:"PAID",order_currency:"INR",order_amount:"218.99",
    }})}),
  })), /mismatch/)
  assert.equal(db.calls.length,0)
})

test("unsettled gateway order does not write despite success-looking payment", async () => {
  const db = fakeDb()
  await assert.rejects(() => persistVerifiedCashfreeEvidence(args({
    db, sdk:sdk({PGFetchOrder:async()=>({data:{
      order_id:cashfreeOrderId,order_status:"ACTIVE",order_currency:"INR",order_amount:"219.00",
    }})}),
  })), /mismatch/)
  assert.equal(db.calls.length,0)
})

test("ambiguous multiple successful gateway payments never write", async () => {
  const db = fakeDb()
  const successful={order_id:cashfreeOrderId,cf_payment_id: Number(paymentId),payment_status:"SUCCESS",
    payment_amount:"219.00",payment_currency:"INR"}
  await assert.rejects(() => persistVerifiedCashfreeEvidence(args({
    db, sdk:sdk({PGOrderFetchPayments:async()=>({data:[successful,successful]})}),
  })), /ambiguous/)
  assert.equal(db.calls.length,0)
})

test("missing or malformed trusted Medusa session fails before gateway", async () => {
  const db = fakeDb()
  let queried=0
  for(const id of ["", "cart_fake", "payses_!unsafe", null, "payses_"]) {
    await assert.rejects(() => persistVerifiedCashfreeEvidence(args({
      db,medusaPaymentSessionId:id,
      sdk:sdk({PGFetchOrder:async()=>{queried++;throw Error("unexpected")}}),
    })), /Medusa payment session/)
  }
  assert.equal(db.calls.length,0)
  assert.equal(queried,0)
})

test("fractional and zero expected paise are rejected before any gateway calls", async () => {
  const db=fakeDb()
  for(const amount of [0,-1,219.5,NaN,Infinity,"21900"]) {
    await assert.rejects(() => persistVerifiedCashfreeEvidence(args({
      db,expectedAmountPaise:amount,
    })), /integer paise/)
  }
  assert.equal(db.calls.length,0)
})

test("no trusted DB adapter is a hard error", async () => {
  await assert.rejects(() => persistVerifiedCashfreeEvidence(args({db:{}})),/PostgreSQL/)
})

test("PostgreSQL unique violation is translated into evidence conflict", async () => {
  await assert.rejects(() => persistVerifiedCashfreeEvidence(args({
    db:{query:async()=>{const e=Error("duplicate");e.code="23505";throw e}},
  })), PaymentEvidenceConflict)
})

test("database refusing a mismatched replay is not treated as success", async () => {
  await assert.rejects(() => persistVerifiedCashfreeEvidence(args({
    db:{query:async()=>({rowCount:0,rows:[]})},
  })),PaymentEvidenceConflict)
})

test("altered database result cannot claim payment or fulfillment", async () => {
  const mismatches=[
    {stage:"captured"},{currency:"USD"},{amount_paise:"21000"},
    {cashfree_order_id:"foreign_order"},{medusa_payment_session_id:"payses_other"}
  ]
  for(const mismatch of mismatches) {
    const row={
      cashfree_order_id:cashfreeOrderId, cf_payment_id:paymentId,
      medusa_payment_session_id:medusaPaymentSessionId,amount_paise:"21900",
      currency:"INR",proof_key:`cashfree:${cashfreeOrderId}:${paymentId}`,
      stage:"verified_unsettled",...mismatch,
    }
    await assert.rejects(() => persistVerifiedCashfreeEvidence(args({
      db:{query:async()=>({rowCount:1,rows:[row]})},
    })),PaymentEvidenceConflict)
  }
})
