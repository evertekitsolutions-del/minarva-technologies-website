# STORE-023 — Correct Indian-rupee indexed search prices

**Bug fixed:** The imported Medusa DTC starter indexed and displayed EUR/USD search prices. A new Kerala / INR region would fall back to showing the EUR amount, potentially misleading customers and corrupting price filters.

This changes the actual Medusa backend search index in `apps/backend/src/search/helpers/pricing.ts` to explicitly query **INR** calculated prices from Medusa's own Pricing Module alongside the previously supported EUR and USD. Each supported currency now has independent searchable/filterable price fields, including `min_price_inr`, `max_price_inr`, `original_price_inr`, and `on_sale_inr`.

The Next.js search adapter is updated in lockstep. `indexedCurrency` no longer substitutes the first supported currency when a region's currency is not indexed. **Missing prices stay missing**, not a fabricated conversion. Existing price filters, sorting and cards consume the real `min_price_<region currency>` attributes. Invalid amounts (NaN, infinity, zero, negative) are never treated as sellable listings.

## Test scope

- Native backend Jest unit tests validate actual pricing row-to-index normalization, INR ranges and discount flags, absent INR price with foreign price present, and invalid prices.
- Store static regression tests check backend and Next.js index schema and exact per-currency attribute usage.
- Existing commerce source-build CI verifies TypeScript and both Medusa & Next.js builds.

## Deployment safety

Search index schema changes require **re-indexing/reseeding using Medusa's official search module commands** in an approved, isolated staging environment. No production reindex, migration, merchant data writes or real payments happen when the code merges. Verify the actual Medusa INR region, its price lists/currency, correct product inventory and fresh indexed documents before enabling catalogue or paid ads.

Important: Passing INR index tests does **not** prove the customer-facing prices are approved. STORE-020 CCTV package stock/BOM/warranty audit and subsequent runtime release gates remain prerequisites.

No WooCommerce and no new paid infrastructure.
