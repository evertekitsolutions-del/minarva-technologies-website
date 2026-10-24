import { createHash } from "node:crypto"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import CashfreeSandboxProvider from "../../modules/cashfree/service"
import {
  confirmCashfreePrepaidProof,
  SELECT_SETTLEMENT_PROOF,
} from "../cashfree-settlement"

const sessionId = "payses_123testsession"
const orderId = "mcf_" + createHash("sha256").update(sessionId).digest("hex").slice(0,40)
const paymentId = "518230000123"
const sessionData = {
  medusa_session_id: sessionId, order_id: orderId,
  status: "sandbox_session_created", currency_code: "INR",
  amount_paise: 21900,
}
const paidRow = (change: Record<string, unknown> = {}) => ({
  medusa_session_id: sessionId, session_amount:"219.00",
  session_currency:"inr", provider_id:"pp_minarva-cashfree-sandbox_cashfree-sandbox",
  session_status:"pending_authorization",
  session_data:sessionData, collection_amount:"219.00",
  collection_currency:"inr", collection_status:"awaiting",
  cashfree_order_id:orderId,cf_payment_id:paymentId,
  paid_paise:"21900",proof_key:`cashfree:${orderId}:${paymentId}`,
  stage:"verified_unsettled",
  ...change,
})
const db = (rows:Record<string,any>[] = [paidRow()]) => ({
  raw:jest.fn(async (_sql:string, _args:unknown[]) => ({rows})),
})
const sdk = (change:Record<string,any> = {}) => ({
  PGFetchOrder:jest.fn(async()=>({data:{
    order_id:orderId,order_status:"PAID",order_currency:"INR",
    order_amount:"219.00",
  }})),
  PGOrderFetchPayments:jest.fn(async()=>({data:[{
    cf_payment_id:Number(paymentId),payment_status:"SUCCESS",
    order_id:orderId,payment_amount:"219.00",payment_currency:"INR",
  }]})),
  ...change,
})
const check = (override:Record<string,unknown> = {}) => ({
  db:db(),sdk:sdk(),sessionData,...override,
})

describe("Cashfree authoritative full-prepaid reconciliation",()=>{
  test("verifies immutable proof against actual Cashfree order and payment",async()=>{
    const input=check()
    const proof=await confirmCashfreePrepaidProof(input as any)
    expect(proof).toEqual({sessionId,gatewayOrderId:orderId,paymentId,amountPaise:21900})
    expect(input.db.raw).toHaveBeenCalledWith(SELECT_SETTLEMENT_PROOF,[sessionId,orderId])
    expect(input.sdk.PGFetchOrder).toHaveBeenCalledTimes(1)
    expect(Object.isFrozen(proof)).toBe(true)
  })
  test("absent signed gateway evidence stays pending without gateway request",async()=>{
    const input=check({db:db([])})
    expect(await confirmCashfreePrepaidProof(input as any)).toBeNull()
    expect(input.sdk.PGFetchOrder).not.toHaveBeenCalled()
  })
  test("rejects partial COD shipping advance, never marks full invoice paid",async()=>{
    const input=check({db:db([paidRow({collection_amount:"12900.00"})])})
    await expect(confirmCashfreePrepaidProof(input as any)).rejects.toThrow(/partial COD/)
    expect(input.sdk.PGFetchOrder).not.toHaveBeenCalled()
  })
  test("refuses any wrong Medusa session, amount, provider, currency or status",async()=>{
    for(const part of [
      {provider_id:"pp_system_default"},
      {medusa_session_id:"payses_foreign"},
      {paid_paise:"21899"},
      {session_amount:"219.01"},
      {session_currency:"usd"},
      {collection_currency:"usd"},
      {stage:"captured"},
      {session_status:"captured"},
      {collection_status:"completed"},
      {proof_key:"fake"},
      {session_data:{...sessionData,amount_paise:21000}},
    ]){
      const input=check({db:db([paidRow(part)])})
      await expect(confirmCashfreePrepaidProof(input as any)).rejects.toThrow(/settlement refused/)
      expect(input.sdk.PGFetchOrder).not.toHaveBeenCalled()
    }
  })
  test("forged session and deterministic gateway ID are rejected before DB",async()=>{
    const input=check({sessionData:{...sessionData,order_id:"mcf_fake"}})
    await expect(confirmCashfreePrepaidProof(input as any)).rejects.toThrow(/provenance/)
    expect(input.db.raw).not.toHaveBeenCalled()
  })
  test("more than one DB proof is rejected",async()=>{
    await expect(confirmCashfreePrepaidProof(check({
      db:db([paidRow(),paidRow()]),
    }) as any)).rejects.toThrow(/ambiguous/)
  })
  test("gateway order not paid or amount/currency mismatch rejected",async()=>{
    for(const change of [
      {order_status:"ACTIVE"},
      {order_amount:"218.99"},
      {order_currency:"USD"},
      {order_id:"different"},
    ]){
      const input=check({sdk:sdk({PGFetchOrder:async()=>({data:{
        order_id:orderId,order_status:"PAID",order_currency:"INR",
        order_amount:"219.00",...change,
      }})})})
      await expect(confirmCashfreePrepaidProof(input as any)).rejects.toThrow(/gateway order/)
    }
  })
  test("extra gateway success never matches immutable receipt",async()=>{
    const payment={cf_payment_id:Number(paymentId),payment_status:"SUCCESS",payment_amount:"219.00"}
    const input=check({sdk:sdk({PGOrderFetchPayments:async()=>({data:[payment,payment]})})})
    await expect(confirmCashfreePrepaidProof(input as any)).rejects.toThrow(/ambiguous/)
  })
  test("gateway payment ID or amount cannot be substituted",async()=>{
    for(const change of [{cf_payment_id:400001},{payment_amount:"218.99"},
      {payment_currency:"USD"},{order_id:"other"}]){
      const input=check({sdk:sdk({PGOrderFetchPayments:async()=>({data:[{
        cf_payment_id:Number(paymentId),payment_status:"SUCCESS",
        payment_amount:"219.00",...change,
      }]})})})
      await expect(confirmCashfreePrepaidProof(input as any)).rejects.toThrow(/independent gateway/)
    }
  })
  test("provider returns pending when flags are off, even with proven receipt",async()=>{
    const old={...process.env}
    try{
      process.env.NODE_ENV="test"
      process.env.STORE_CASHFREE_SANDBOX_ENABLED="true"
      process.env.STORE_CASHFREE_SANDBOX_APPROVED="true"
      process.env.STORE_CASHFREE_SANDBOX_SETTLEMENT_ENABLED="false"
      const provider=new CashfreeSandboxProvider({},{
        client_id:"ci_only_sandbox_id",client_secret:"ci_only_sandbox_secret",
      })
      const state=await provider.authorizePayment({data:sessionData})
      expect(state.status).toBe("pending_authorization")
    }finally{process.env=old}
  })
  test("provider uses Medusa deferred workflow when full prepaid proof exists and explicitly approved",async()=>{
    const old={...process.env}
    try{
      process.env.NODE_ENV="test"
      process.env.STORE_CASHFREE_SANDBOX_ENABLED="true"
      process.env.STORE_CASHFREE_SANDBOX_APPROVED="true"
      process.env.STORE_CASHFREE_SANDBOX_SETTLEMENT_ENABLED="true"
      process.env.STORE_CASHFREE_SANDBOX_SETTLEMENT_APPROVED="true"
      const connection=db()
      const provider=new CashfreeSandboxProvider({
        [ContainerRegistrationKeys.PG_CONNECTION]:connection,
      },{client_id:"ci_only_sandbox_id",client_secret:"ci_only_sandbox_secret"})
      ;(provider as any).client_=sdk()
      const state=await provider.authorizePayment({data:sessionData})
      expect(state.status).toBe("captured")
      expect(state.data?.cashfree_payment_id).toBe(paymentId)
      expect(state.data?.proof_amount_paise).toBe(21900)
      expect(state.data?.sandbox_gateway_captured).toBe(true)
    }finally{process.env=old}
  })
})
