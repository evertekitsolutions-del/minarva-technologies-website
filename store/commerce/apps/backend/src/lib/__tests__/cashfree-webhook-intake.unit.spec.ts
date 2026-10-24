import { createHash } from "node:crypto"
import {
  CashfreeIntakeRejected,
  recordSignedCashfreeWebhook,
  SELECT_MEDUSA_CASHFREE_SESSION,
  RECORD_CASHFREE_EVIDENCE,
} from "../cashfree-webhook-intake"

const medusaId = "payses_123abc456789"
const orderId = "mcf_" + createHash("sha256").update(medusaId).digest("hex").slice(0, 40)
const cfPaymentId = "518230000123"
const nowMs = 1792880000000
const timestamp = String(Math.floor(nowMs / 1000))
const event = (type = "PAYMENT_SUCCESS_WEBHOOK") =>
  JSON.stringify({
    type,
    data: {order: {order_id: orderId},
      payment: {cf_payment_id: Number(cfPaymentId)} },
  })

function sessionRow(changes: Record<string, unknown> = {}) {
  return {
    id: medusaId,
    provider_id: "pp_minarva-cashfree-sandbox_cashfree-sandbox",
    amount: "219.00", currency_code: "inr",
    collection_amount: "219.00", collection_currency: "inr",
    collection_status: "awaiting", status: "pending_authorization",
    data: {order_id: orderId, medusa_session_id: medusaId,
      currency_code:"INR", amount_paise:21900,
      status:"sandbox_session_created"},
    ...changes,
  }
}
function fakeDb(row = sessionRow(), other: Record<string, unknown> = {}) {
  const calls: {sql:string, bindings:unknown[]}[] = []
  const db = {
    calls,
    raw: jest.fn(async (sql:string, bindings:unknown[]) => {
      calls.push({sql, bindings})
      if(sql.includes("FROM payment_session")) {
        return {rows: [row]}
      }
      return {rows:[{
        cashfree_order_id:orderId, cf_payment_id:cfPaymentId,
        medusa_payment_session_id:medusaId, amount_paise:"21900",
        currency:"INR", proof_key:`cashfree:${orderId}:${cfPaymentId}`,
        stage:"verified_unsettled",
        ...other,
      }], rowCount:1}
    }),
  }
  return db
}
function fakeSdk(overrides: Record<string, unknown> = {}) {
  return {
    PGVerifyWebhookSignature: jest.fn(async (
      signature:string, raw:string, ts:string
    ) => {
      if(signature !== "signed-in-test" || raw !== event() || ts !== timestamp) {
        throw Error("invalid signature")
      }
    }),
    PGFetchOrder: jest.fn(async() => ({data:{
      order_id:orderId, order_status:"PAID",order_currency:"INR",
      order_amount:"219.00",
    }})),
    PGOrderFetchPayments: jest.fn(async()=>({data:[{
      cf_payment_id:Number(cfPaymentId), payment_status:"SUCCESS",
      order_id:orderId, payment_amount:"219.00",payment_currency:"INR",
    }]})),
    ...overrides,
  }
}
const data = (overrides: Record<string, unknown> = {}) => ({
  sdk:fakeSdk(),
  db:fakeDb(),
  signature:"signed-in-test",
  timestamp,
  rawBody:event(),
  nowMs,
  ...overrides,
})

describe("staging Medusa-owned Cashfree payment evidence", () => {
  test("only trusted exact Medusa session + independently polled Cashfree may persist", async () => {
    const input = data()
    const result = await recordSignedCashfreeWebhook(input as any)
    expect(result).toEqual({
      status:"verified_unsettled",
      medusaPaymentSessionId:medusaId,
      paymentProofKey:`cashfree:${orderId}:${cfPaymentId}`,
      capturedInMedusa:false,fulfillmentReady:false,
    })
    expect(input.db.raw).toHaveBeenCalledTimes(2)
    expect(input.db.calls[0].sql).toContain("FROM payment_session")
    expect(input.db.calls[0].bindings).toEqual([orderId])
    expect(input.db.calls[1].bindings).toEqual([
      orderId, cfPaymentId, medusaId, 21900,
      `cashfree:${orderId}:${cfPaymentId}`,
    ])
    expect(RECORD_CASHFREE_EVIDENCE).toContain("ON CONFLICT (cashfree_order_id)")
    expect(SELECT_MEDUSA_CASHFREE_SESSION).toContain("ps.deleted_at IS NULL")
  })

  test("wrong signature blocks any Medusa DB or Cashfree API request", async () => {
    const input = data({signature:"not-signed"})
    await expect(recordSignedCashfreeWebhook(input as any))
      .rejects.toBeInstanceOf(CashfreeIntakeRejected)
    expect(input.db.raw).not.toHaveBeenCalled()
    expect(input.sdk.PGFetchOrder).not.toHaveBeenCalled()
  })

  test("stale timestamp and missing body are rejected before signature lookup", async () => {
    const input = data({timestamp:String(Number(timestamp)-99999)})
    await expect(recordSignedCashfreeWebhook(input as any))
      .rejects.toThrow(/Expired/)
    expect(input.db.raw).not.toHaveBeenCalled()
    await expect(recordSignedCashfreeWebhook(data({rawBody:undefined}) as any))
      .rejects.toThrow(/Invalid signed webhook/)
  })

  test("non-success events are acknowledged but never looked up/persisted", async () => {
    const raw = event("PAYMENT_FAILED_WEBHOOK")
    const input = data({rawBody:raw,sdk:fakeSdk({
      PGVerifyWebhookSignature:jest.fn(async()=>undefined),
    })})
    const result = await recordSignedCashfreeWebhook(input as any)
    expect(result.status).toEqual("ignored_non_success")
    expect(input.db.raw).not.toHaveBeenCalled()
  })

  test("reused Cashfree order ID on another Medusa session is blocked", async () => {
    const input = data({db:fakeDb(sessionRow({
      id: "payses_other9999",
      data:{order_id:orderId, medusa_session_id:"payses_other9999",
        amount_paise:21900,status:"sandbox_session_created",currency_code:"INR"},
    }))})
    await expect(recordSignedCashfreeWebhook(input as any))
      .rejects.toThrow(/not derived/)
    expect(input.sdk.PGFetchOrder).not.toHaveBeenCalled()
  })

  test("gateway session and Medusa payment session totals must both be INR exact", async () => {
    for(const modification of [
      {amount:"219.01"},
      {collection_amount:"218.99"},
      {data:{order_id:orderId,medusa_session_id:medusaId,
        status:"sandbox_session_created",currency_code:"INR",amount_paise:20000}},
      {currency_code:"usd"},
      {provider_id:"pp_system_system"},
      {status:"captured"},
      {collection_status:"completed"},
    ]) {
      const input=data({db:fakeDb(sessionRow(modification))})
      await expect(recordSignedCashfreeWebhook(input as any))
        .rejects.toBeInstanceOf(CashfreeIntakeRejected)
      expect(input.sdk.PGFetchOrder).not.toHaveBeenCalled()
    }
  })

  test("Cashfree paid gateway amount differs from authoritative Medusa amount", async () => {
    const input=data({sdk:fakeSdk({PGFetchOrder:async()=>({data:{
      order_id:orderId,order_status:"PAID",order_currency:"INR",order_amount:"210.00",
    }})})})
    await expect(recordSignedCashfreeWebhook(input as any))
      .rejects.toThrow(/Cashfree paid order/)
    expect(input.db.raw).toHaveBeenCalledTimes(1)
  })

  test("Cashfree payment does not match signed event payment ID", async () => {
    const input=data({sdk:fakeSdk({PGOrderFetchPayments:async()=>({data:[{
      cf_payment_id:400003, payment_status:"SUCCESS", payment_amount:"219.00",
    }]})})})
    await expect(recordSignedCashfreeWebhook(input as any))
      .rejects.toThrow(/payment ID/)
    expect(input.db.raw).toHaveBeenCalledTimes(1)
  })

  test("duplicate gateway successes never persist", async () => {
    const input=data({sdk:fakeSdk({PGOrderFetchPayments:async()=>({data:[
      {cf_payment_id:Number(cfPaymentId),payment_status:"SUCCESS",payment_amount:"219.00"},
      {cf_payment_id:400009,payment_status:"SUCCESS",payment_amount:"219.00"},
    ]})})})
    await expect(recordSignedCashfreeWebhook(input as any))
      .rejects.toThrow(/count is not one/)
  })

  test("ambiguous Medusa sessions never persist even if a gateway is paid", async () => {
    const input=data({db:{
      raw:jest.fn(async()=>({rows:[sessionRow(),sessionRow()]})),
    }})
    await expect(recordSignedCashfreeWebhook(input as any))
      .rejects.toThrow(/Missing or ambiguous/)
  })

  test("DB rejects conflicting evidence / stage altered but cannot fulfill", async()=> {
    const input=data({db:fakeDb(sessionRow(),{stage:"captured"})})
    await expect(recordSignedCashfreeWebhook(input as any))
      .rejects.toThrow(/altered or mismatched/)
  })

  test("missing manual ledger migration cannot be silently treated as success", async()=> {
    const input=data({db:{
      raw:jest.fn(async(sql:string)=> {
        if(sql.includes("FROM payment_session")) return {rows:[sessionRow()]}
        const error:any =new Error("relation does not exist")
        error.code="42P01"
        throw error
      }),
    }})
    await expect(recordSignedCashfreeWebhook(input as any))
      .rejects.toThrow(/relation does not exist/)
  })
  test("signed replay after Medusa capture verifies identical proof without a second authorization", async () => {
    const input=data({db:fakeDb(sessionRow({
      status:"captured",collection_status:"completed",
    }))})
    const result=await recordSignedCashfreeWebhook(input as any)
    expect(result.status).toBe("verified_replay")
    expect(result.fulfillmentReady).toBe(false)
    expect("medusaPaymentSessionId" in result && result.medusaPaymentSessionId).toBe(medusaId)
    expect(input.db.raw).toHaveBeenCalledTimes(2)
    expect(input.sdk.PGFetchOrder).toHaveBeenCalledTimes(1)
  })

})
