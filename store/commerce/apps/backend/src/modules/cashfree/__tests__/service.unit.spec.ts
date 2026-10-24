import { createHash } from "node:crypto"
import CashfreeSandboxProvider from "../service"

const opts = {
  client_id: "ci_sandbox_id_not_real",
  client_secret: "ci_sandbox_secret_not_real",
}
const session = "payses_ABCdef123456"
const orderId = "mcf_" + createHash("sha256").update(session).digest("hex").slice(0, 40)
const build = () => {
  process.env.STORE_CASHFREE_SANDBOX_ENABLED = "true"
  process.env.STORE_CASHFREE_SANDBOX_APPROVED = "true"
  process.env.NODE_ENV = "test"
  return new CashfreeSandboxProvider({}, opts)
}
const input = (changes: Record<string, unknown> = {}) => ({
  data: { session_id: session },
  amount: 14500.25,
  currency_code: "INR",
  context: {
    customer: {
      id: "cus_test_1",
      email: "sandbox-only@example.invalid",
      phone: "+919876543210",
    },
  },
  ...changes,
})

describe("Minarva Cashfree sandbox Medusa Payment Provider", () => {
  afterEach(() => {
    delete process.env.STORE_CASHFREE_SANDBOX_ENABLED
    delete process.env.STORE_CASHFREE_SANDBOX_APPROVED
    process.env.NODE_ENV = "test"
  })

  test("constructs only with double staging approval", () => {
    process.env.NODE_ENV = "test"
    process.env.STORE_CASHFREE_SANDBOX_ENABLED = "true"
    process.env.STORE_CASHFREE_SANDBOX_APPROVED = "false"
    expect(() => new CashfreeSandboxProvider({}, opts)).toThrow(/disabled/)
    process.env.STORE_CASHFREE_SANDBOX_APPROVED = "true"
    expect(() => new CashfreeSandboxProvider({}, opts)).not.toThrow()
    process.env.NODE_ENV = "production"
    expect(() => new CashfreeSandboxProvider({}, opts)).toThrow(/disabled/)
  })

  test("creates sandbox order via official SDK and returns no secrets", async () => {
    const provider = build()
    const sdk = (provider as any).client_
    const sdkCreate = jest.spyOn(sdk, "PGCreateOrder").mockResolvedValue({
      data: {
        order_id: orderId,
        order_currency: "INR",
        order_amount: 14500.25,
        order_status: "ACTIVE",
        payment_session_id: "test_session_token",
      },
    })
    const created = await provider.initiatePayment(input() as any)
    expect(created.id).toEqual(orderId)
    expect(created.status).toBe("pending")
    expect(created.data?.payment_session_id).toBe("test_session_token")
    expect(created.data?.amount_paise).toBe(1450025)
    expect(JSON.stringify(created)).not.toContain(opts.client_secret)
    expect(JSON.stringify(created)).not.toContain(opts.client_id)
    expect(sdkCreate).toHaveBeenCalledTimes(1)
    const payload = sdkCreate.mock.calls[0][0] as any
    expect(payload.order_amount).toBe(14500.25)
    expect(payload.order_currency).toBe("INR")
    expect(payload.customer_details.customer_phone).toBe("9876543210")
    expect(payload.order_id).toBe(orderId)
  })

  test("rejects other currencies, invalid phone and absent Medusa session before contacting gateway", async () => {
    const provider = build()
    const sdkCreate = jest.spyOn((provider as any).client_, "PGCreateOrder")
    await expect(provider.initiatePayment(input({ currency_code: "USD" }) as any))
      .rejects.toThrow(/INR/)
    await expect(provider.initiatePayment(input({ context: { customer: { phone: "invalid" } } }) as any))
      .rejects.toThrow(/phone/)
    await expect(provider.initiatePayment(input({ data: {} }) as any))
      .rejects.toThrow(/Medusa payment session/)
    expect(sdkCreate).not.toHaveBeenCalled()
  })

  test("rejects tampered gateway order identity and amount", async () => {
    const provider = build()
    const sdk = (provider as any).client_
    const response = {
      data: {
        order_id: "foreign_order",
        order_currency: "INR",
        order_amount: 14500.25,
        order_status: "ACTIVE",
        payment_session_id: "test_session_token",
      },
    }
    jest.spyOn(sdk, "PGCreateOrder").mockResolvedValue(response)
    await expect(provider.initiatePayment(input() as any)).rejects.toThrow(/mismatch/)
    response.data.order_id = orderId
    response.data.order_amount = 14500.24
    await expect(provider.initiatePayment(input() as any)).rejects.toThrow(/mismatch/)
  })

  test("always keeps authorization pending and cannot capture or refund", async () => {
    const provider = build()
    expect((await provider.authorizePayment({ data: { order_id: orderId } }))
      .status).toBe("pending_authorization")
    expect((await provider.getPaymentStatus({ data: { order_id: orderId } }))
      .status).toBe("pending_authorization")
    expect((await provider.getWebhookActionAndData({} as any))
      .action).toBe("not_supported")
    await expect(provider.capturePayment({ data: { order_id: orderId } }))
      .rejects.toThrow(/capture disabled/)
    await expect(provider.refundPayment({ data: { order_id: orderId }, amount: 1 }))
      .rejects.toThrow(/refunds disabled/)
  })
})
