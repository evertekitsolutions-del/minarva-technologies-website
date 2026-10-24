/**
 * STORE-018. Public storefront order creation is OFF until explicit release.
 * This must be evaluated in the Medusa HTTP backend, not just Next.js UI.
 *
 * Admin order management remains separate. Approved local sandbox testing can
 * proceed only by independently opting into BOTH release flags.
 */
export const publicCheckoutGate = ({
  nodeEnv,
  enabled,
  approved,
}: {
  nodeEnv?: string
  enabled?: string
  approved?: string
}): boolean =>
  nodeEnv !== "production" &&
  enabled === "true" &&
  approved === "true"

export const publicCheckoutGateFromEnvironment = (): boolean =>
  publicCheckoutGate({
    nodeEnv: process.env.NODE_ENV,
    enabled: process.env.STORE_PUBLIC_CHECKOUT_TEST_ENABLED,
    approved: process.env.STORE_PUBLIC_CHECKOUT_TEST_APPROVED,
  })
