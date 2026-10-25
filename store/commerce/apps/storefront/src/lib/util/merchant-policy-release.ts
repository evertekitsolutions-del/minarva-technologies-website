import "server-only"

/**
 * Reuse Medusa's existing region policy data, but never expose it as a
 * merchant promise until the owner approves the underlying figures/terms.
 *
 * This controls informational policy publication only, NOT customer checkout.
 */
export const merchantPolicyPublicationApproved = (): boolean =>
  process.env.STORE_CUSTOMER_POLICIES_PUBLISHED === "true" &&
  process.env.STORE_CUSTOMER_POLICIES_OWNER_APPROVED === "true"
