# STORE-024 — Approved CCTV product visibility in public storefront

This milestone closes a real release gap: STORE-020 added a strict product/BOM/stock/warranty validator, but before this change, the imported Medusa Store Products API and InstantSearch could still display any published product.

## What is protected now

1. `apps/backend/src/search/product.ts` indexes an additional **non-retrievable, filterable** `sale_approved` boolean from authentic Product Module metadata `minarva_sale_approved === true`. Only a real boolean true qualifies, not the string `"true"`.
2. `apps/backend/src/api/middlewares.ts` uses official Medusa `configureStoreSearch({allowed_indexes: {product:{filters: () => ({sale_approved:true})}}})`. Medusa combines this filter with user filters via logical AND, so a buyer cannot broaden search to view unapproved packages. Search/price filters, desktop listing and navbar search inherit it automatically, with no new paid search provider.
3. `apps/storefront/src/lib/util/approved-cctv.ts` **reuses STORE-020's original** `store/lib/cctv-package-readiness.mjs` audit, instead of duplicating product rules. Type-only declaration ships alongside the JS.
4. `apps/storefront/src/lib/data/products.ts` filters the Medusa products *after server-side fetch*; direct Next.js product pages, SEO JSON-LD, search page and related products all reuse this one loader. Packages without verified BOM, packed dimensions, stock, positive INR price, approved warranty, installation and policy refs cannot be rendered as offers.
5. Checkout still uses the separate default-off server-side order completion gate from STORE-018/019.

## Explicit limits

- Product approved flags and metadata come from the merchant's trusted Medusa Admin, not customer messages. Do not set the approval flag until vendor specs/kit contents, stock, photos, warranty and taxes have been manually verified.
- This UI/read/search protection is not an authorization or security boundary on all **direct** `GET /store/products` API traffic: the Medusa built-in Store Product endpoint may still expose published products to someone with the store publishable API key. To keep secret draft/incomplete packages entirely out of public APIs, leave them **draft/unpublished** until approved. Search protection does not make public Store Product API private.
- Filtering *after* Medusa pagination can result in pages with fewer entries than the requested limit; reported counts are of the approved page, not the entire merchant database. For launch, seed a small clean verified catalogue and run real pagination/UAT; if hundreds of incomplete products must coexist publicly, implement a database-native approval filter before claiming exact pagination.
- Search index schema changed: merchant staging needs the **official Medusa search reindex** and verification that previously indexed records now carry the approval boolean. Do not mutate production indices without approval.
- Cashfree merchant sandbox settlement, refunds, Shiprocket final all-in charges, and residual COD booking remain externally blocked.

No new paid dependencies, no new product data, no schema migrations against existing CRM Supabase, no real orders and no WooCommerce.
