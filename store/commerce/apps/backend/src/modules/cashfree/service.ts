import { createHash } from "node:crypto"
import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  InitiatePaymentInput,
  InitiatePaymentOutput,
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  ProviderWebhookPayload,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { Cashfree, CFEnvironment } from "cashfree-pg"

type Options = {
  client_id: string
  client_secret: string
}

// Cashfree order_amount is INR (rupees), while all internal payment proofs
// use safe integer paise. Never infer a price or currency from the browser.
const normalizeAmount = (amount: unknown): number => {
  const v = String(amount)
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(v)) {
    throw new Error("Invalid Cashfree INR session amount")
  }
  const [major, minor = ""] = v.split(".")
  const paise = BigInt(major) * 100n + BigInt((minor + "00").slice(0, 2))
  if (paise < 100n || paise > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Cashfree sandbox amount outside permitted INR range")
  }
  return Number(paise)
}

const sandboxPhone = (phone: string | null | undefined): string => {
  const normalized = (phone ?? "").replace(/[\s()-]/g, "")
  const match = /^(?:(?:\+91)|(?:91))?([6-9]\d{9})$/.exec(normalized)
  if (!match) throw new Error("Cashfree sandbox checkout requires valid Indian phone")
  return match[1]
}

const safeSessionId = (sessionId: unknown): string => {
  if (typeof sessionId !== "string" || !/^payses_[A-Za-z0-9_-]{4,100}$/.test(sessionId)) {
    throw new Error("Medusa payment session ID missing or invalid")
  }
  return sessionId
}

const cashfreeIdForSession = (sessionId: string): string =>
  "mcf_" + createHash("sha256").update(sessionId).digest("hex").slice(0, 40)

/**
 * Staging-only bridge between Medusa's official Payment Module API
 * and the pinned official cashfree-pg v6 SDK.
 *
 * This provider deliberately cannot authorize/capture/refund money until
 * atomic persisted payment verification + webhook replay handling exist.
 * In particular, webhook and browser redirect never mark payment successful.
 */
class CashfreeSandboxProvider extends AbstractPaymentProvider<Options> {
  static identifier = "minarva-cashfree-sandbox"
  protected client_: Cashfree

  static validateOptions(options: Record<string, unknown>): void {
    if (typeof options?.client_id !== "string" || options.client_id.length < 10 ||
        typeof options?.client_secret !== "string" || options.client_secret.length < 10) {
      throw new Error("Cashfree sandbox merchant credentials are required")
    }
  }

  constructor(container: Record<string, unknown>, options: Options) {
    super(container, options)
    CashfreeSandboxProvider.validateOptions(options)
    if (process.env.NODE_ENV === "production" ||
        process.env.STORE_CASHFREE_SANDBOX_ENABLED !== "true" ||
        process.env.STORE_CASHFREE_SANDBOX_APPROVED !== "true") {
      throw new Error("Cashfree provider is strictly disabled outside approved sandbox staging")
    }
    this.client_ = new Cashfree(CFEnvironment.SANDBOX, options.client_id, options.client_secret)
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    if (input.currency_code?.toUpperCase() !== "INR") {
      throw new Error("Cashfree payment provider supports only INR")
    }
    const sessionId = safeSessionId(input.data?.session_id)
    const amountPaise = normalizeAmount(input.amount)
    const orderId = cashfreeIdForSession(sessionId)
    const customerPhone = sandboxPhone(input.context?.customer?.phone)
    const request = {
      order_id: orderId,
      order_amount: amountPaise / 100,
      order_currency: "INR",
      customer_details: {
        customer_id: "mcf_" + createHash("sha256").update(
          String(input.context?.customer?.id ?? sessionId)
        ).digest("hex").slice(0, 24),
        customer_phone: customerPhone,
      },
    }

    // Official SDK performs the API call, never handwritten Cashfree REST code.
    const response = await this.client_.PGCreateOrder(request)
    const order = response?.data
    if (!order || order.order_id !== orderId ||
        order.order_currency !== "INR" ||
        normalizeAmount(order.order_amount) !== amountPaise ||
        typeof order.payment_session_id !== "string" ||
        !order.payment_session_id ||
        order.order_status !== "ACTIVE") {
      throw new Error("Cashfree sandbox order creation evidence mismatch")
    }

    // Medusa payment session data is storefront-visible: no merchant API keys.
    return {
      id: orderId,
      status: PaymentSessionStatus.PENDING,
      data: {
        order_id: orderId,
        medusa_session_id: sessionId,
        payment_session_id: order.payment_session_id,
        currency_code: "INR",
        amount_paise: amountPaise,
        status: "sandbox_session_created",
      },
    }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    // Do not trust checkout return or unverified client-side SDK callback.
    return { status: PaymentSessionStatus.PENDING_AUTHORIZATION, data: input.data ?? {} }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return { status: PaymentSessionStatus.PENDING_AUTHORIZATION, data: input.data ?? {} }
  }

  async updatePayment(_input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    throw new Error("Cashfree session updates require new amount-verified order creation")
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async cancelPayment(_input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    throw new Error("Cashfree cancellation must be implemented and reconciled before enablement")
  }

  async deletePayment(_input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    throw new Error("Cashfree session deletion requires gateway cancellation verification")
  }

  async capturePayment(_input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    throw new Error("Cashfree capture disabled pending trusted Medusa transaction persistence")
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    throw new Error("Cashfree refunds disabled pending refund idempotency and reconciliation")
  }

  async getWebhookActionAndData(
    _payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    // A signed event must first pass the official SDK and the Medusa DB proof
    // gate in STORE-007; this provider must not auto-capture from a callback.
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default CashfreeSandboxProvider
