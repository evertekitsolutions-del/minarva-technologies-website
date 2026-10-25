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

/**
 * Storefront write blockade. Includes cart creation, line items, shipping,
 * promotion and final completion, but never blocks GET browsing or Admin.
 * This is defense-in-depth on top of Medusa's own session/payment guards.
 */
export const shouldBlockPublicCartMutation = ({
  method,
  path,
  sandboxAuthorized,
}: {
  method: string
  path: string
  sandboxAuthorized: boolean
}): boolean =>
  !sandboxAuthorized &&
  /^(POST|PUT|PATCH|DELETE)$/i.test(method) &&
  /^\/store\/carts(?:\/.*)?\/?$/i.test(path)
