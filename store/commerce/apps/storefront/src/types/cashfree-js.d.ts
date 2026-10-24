/**
 * Narrow local TypeScript surface for the pinned official Cashfree JS loader.
 * @cashfreepayments/cashfree-js@1.0.7 ships JavaScript without declarations.
 * Keep this in sync with upstream README and sandbox hosted checkout docs.
 */
declare module "@cashfreepayments/cashfree-js" {
  interface CashfreeCheckoutInput {
    paymentSessionId: string
    redirectTarget?: "_modal" | "_self" | "_blank" | "_top"
  }

  interface CashfreeCheckoutClient {
    checkout(input: CashfreeCheckoutInput): Promise<unknown>
  }

  export function load(config: {
    mode: "sandbox" | "production"
  }): Promise<CashfreeCheckoutClient | null>
}
