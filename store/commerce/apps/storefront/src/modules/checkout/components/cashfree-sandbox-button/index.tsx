"use client"

import { load } from "@cashfreepayments/cashfree-js"
import { Button, Text } from "@modules/common/components/ui"
import ErrorMessage from "@modules/checkout/components/error-message"
import { useState } from "react"

type Props = {
  notReady: boolean
  paymentSessionId?: unknown
  "data-testid"?: string
}

const sandboxEnabled =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_CASHFREE_SANDBOX_CHECKOUT_ENABLED === "true"

/**
 * Official Cashfree sandbox browser checkout only. Deliberately NO placeOrder(),
 * cart completion, capture, refund, shipment or "paid" UI on browser callback.
 * An independent signed/server-polled Cashfree proof + Medusa settlement
 * workflow must later authorize real customer checkout.
 */
export default function CashfreeSandboxButton({
  notReady,
  paymentSessionId,
  "data-testid": dataTestId,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)

  const hasSession =
    typeof paymentSessionId === "string" &&
    paymentSessionId.startsWith("session_") &&
    paymentSessionId.length < 1024

  const payInSandbox = async () => {
    if (!sandboxEnabled || notReady || !hasSession || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const cashfree = await load({ mode: "sandbox" })
      if (!cashfree) throw new Error("Cashfree sandbox SDK is unavailable")
      // Cashfree owns the payment iframe; no card/UPI secrets reach our app.
      // SDK completion is not payment success or a confirmed Medusa order.
      await cashfree.checkout({
        paymentSessionId: paymentSessionId as string,
        redirectTarget: "_modal",
      })
      setAttempted(true)
    } catch {
      setError("Could not open the Cashfree sandbox checkout. Please retry.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-3">
      <Button
        size="large"
        type="button"
        disabled={!sandboxEnabled || notReady || !hasSession || submitting}
        isLoading={submitting}
        onClick={payInSandbox}
        data-testid={dataTestId}
      >
        {sandboxEnabled ? "Try Cashfree Sandbox Payment" : "Checkout not yet available"}
      </Button>
      <Text className="txt-small text-ui-fg-muted">
        Cashfree sandbox only. The store cannot accept real payments or
        confirm orders yet. Do not pay real money or expect a shipment.
      </Text>
      {attempted && (
        <Text className="txt-small text-ui-fg-subtle" role="status">
          Sandbox checkout was opened. Payment status is not confirmed by
          this screen. No order has been placed or booked for delivery.
        </Text>
      )}
      <ErrorMessage error={error} data-testid="cashfree-sandbox-error-message" />
    </div>
  )
}
