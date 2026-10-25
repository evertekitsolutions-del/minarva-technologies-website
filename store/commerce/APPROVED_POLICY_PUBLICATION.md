# STORE-025 — Shipping and returns require merchant policy approval

The upstream Medusa Store region metadata can contain editable shipping costs, times, free return indicators and return windows. These values can originate from demo/test data and **must not be presented as Minarva's merchant-approved contract**.

This milestone reuses the prebuilt Medusa policy pages and `getStorePolicies`, but gates publication through two separate **server-only** flags:

- `STORE_CUSTOMER_POLICIES_PUBLISHED=true`
- `STORE_CUSTOMER_POLICIES_OWNER_APPROVED=true`

Both absent/false => shipping and returns pages display a truthful prelaunch notice. They explain Kerala shipping depends on destination PIN, measured packed weight and final courier quotes. Return/replacement/refund terms are not promised. No live order is accepted.

Once actual merchant legal terms, INR GST shipping rules, warranty inclusions/exclusions, refund method and courier contracts have been signed off, both flags can enable **informational** Medusa region policy display. This is not approval to unlock checkout. Medusa API cart write/complete endpoints remain separately blocked in production.

No live courier lookups, merchant charges, production migrations, policy values or customer PII are introduced. CI checks Next.js typing/build and confirms false legal claims cannot appear by default.
