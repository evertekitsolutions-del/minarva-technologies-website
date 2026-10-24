import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { Cashfree, CFEnvironment } from "cashfree-pg"
import {
  CashfreeIntakeRejected,
  recordSignedCashfreeWebhook,
  type PaymentDb,
} from "../../../lib/cashfree-webhook-intake"

const stagingApproved = () =>
  process.env.NODE_ENV !== "production" &&
  process.env.STORE_CASHFREE_SANDBOX_ENABLED === "true" &&
  process.env.STORE_CASHFREE_SANDBOX_APPROVED === "true" &&
  process.env.STORE_CASHFREE_WEBHOOK_LEDGER_ENABLED === "true" &&
  process.env.STORE_CASHFREE_WEBHOOK_LEDGER_APPROVED === "true"

/**
 * Staging-only Cashfree evidence intake.
 * No Medusa authorization/capture/fulfillment, real merchant credentials or
 * external shipping is performed by this endpoint.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!stagingApproved()) return res.sendStatus(404)
  const clientId = process.env.CASHFREE_SANDBOX_CLIENT_ID
  const clientSecret = process.env.CASHFREE_SANDBOX_CLIENT_SECRET
  if (!clientId || !clientSecret || clientId.length < 10 ||
      clientSecret.length < 10 || clientId.startsWith("REPLACE_") ||
      clientSecret.startsWith("REPLACE_")) {
    return res.status(503).json({ error: "Sandbox configuration unavailable" })
  }

  const signature = req.headers["x-webhook-signature"]
  const timestamp = req.headers["x-webhook-timestamp"]
  // req.rawBody is populated only through the explicit route body parser.
  // Never use req.body or JSON.stringify(req.body) to verify Cashfree HMAC.
  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody.toString("utf8")
    : req.rawBody

  try {
    const db = req.scope.resolve(
      ContainerRegistrationKeys.PG_CONNECTION
    ) as unknown as PaymentDb
    const sdk = new Cashfree(CFEnvironment.SANDBOX, clientId, clientSecret)
    const result = await recordSignedCashfreeWebhook({
      sdk, db, signature, timestamp, rawBody,
    })
    const allowSettlement =
      process.env.STORE_CASHFREE_SANDBOX_SETTLEMENT_ENABLED === "true" &&
      process.env.STORE_CASHFREE_SANDBOX_SETTLEMENT_APPROVED === "true"
    if (allowSettlement && result.status === "verified_unsettled" &&
        "medusaPaymentSessionId" in result) {
      // Do not write payment or capture rows directly. Medusa's official
      // idempotent deferred-payment authorization workflow is the authority.
      // The provider independently re-polls Cashfree and checks the immutable
      // full-price prepaid proof; a mere COD shipping advance stays awaiting.
      const paymentModule = req.scope.resolve(Modules.PAYMENT) as {
        authorizePaymentSession: (
          sessionId: string,
          context: Record<string, unknown>
        ) => Promise<{ id: string } | null>
      }
      const payment = await paymentModule.authorizePaymentSession(
        result.medusaPaymentSessionId, {}
      )
      return res.status(202).json({
        status: payment ? "sandbox_payment_authorized" : "verified_unsettled",
        confirmedInMedusa: Boolean(payment),
        fulfillmentReady: false,
      })
    }
    return res.status(202).json({
      status: result.status,
      confirmedInMedusa: false,
      fulfillmentReady: false,
    })
  } catch (error) {
    if (error instanceof CashfreeIntakeRejected) {
      // Never disclose whether a gateway order or Medusa session exists.
      return res.status(400).json({ error: "Invalid or non-authoritative Cashfree evidence" })
    }
    return res.status(503).json({ error: "Payment evidence intake unavailable" })
  }
}
