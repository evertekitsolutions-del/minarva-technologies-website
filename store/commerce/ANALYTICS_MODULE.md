# STORE-012 — ready-made Medusa analytics

**Module:** `@agilo/medusa-analytics-plugin@1.2.1`  
**Source:** https://github.com/Agilo/medusa-analytics-plugin  
**License:** MIT according to upstream package manifest.  
**Compatibility:** declared peer ranges `@medusajs/medusa >=2.11.0 <3.0.0`; current Medusa core is pinned to `2.22.0`.

This replaces any plan to hand-code order, revenue, product and inventory charts. The source provides:

- Order count, sales totals, orders-over-time and sales-over-time
- Regional sales and order-status distributions
- Top-selling products, low/out-of-stock variants
- Average order value and customer segments
- Charts and admin widgets (reuses Medusa Admin)

## Safety and rollout

This package is installed and pinned, but the plugin is **OFF by default**.

- Requires `STORE_ANALYTICS_PLUGIN_ENABLED=true` AND `STORE_ANALYTICS_STAGING_APPROVED=true` to enable on isolated staging only.
- Production enablement is blocked until role-controlled Medusa Admin screen, data-level authorization, caching/invalidation and compatibility tests pass.
- No analytics events are fabricated. Charts depend on real permitted Medusa transactions. No external analytics pixel, paid service, advertising tracking, or third-party data export is added.
- No customer-facing page changes, production migration, payment or shipping API calls.
- No Medusa Admin demo seed data is to be presented as real company sales.

Next: validate dashboard rendering with actual staging admin account and sample **clearly labeled test** orders, plus access-control checks. License/provenance files are retained at upstream, not copied into application source.
