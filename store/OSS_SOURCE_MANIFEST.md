# Minarva CCTV Store — upstream open-source source selection

Decision (2026-10-24): **WooCommerce prohibited by owner. Do not install WordPress/WooCommerce or any plugins for them.** Supersedes the discarded `feat/store-002-oss-commerce-stack` experiment. No WooCommerce files were merged into main.

## Pinned upstream used instead

- Medusa DTC Starter: https://github.com/medusajs/dtc-starter/tree/204130a32d80b704ab509069dcc1a2f8a61f51c1
- Pinned commit: `204130a32d80b704ab509069dcc1a2f8a61f51c1`
- License: MIT, preserve upstream LICENSE and copyright when copying.
- Upstream layout: `apps/backend` (Medusa 2.22 commerce APIs and admin), `apps/storefront` (Next.js 16 storefront), plus pnpm workspace and lockfile.
- Import location: `store/commerce/` so the existing public `index.html`, `admin.html`, CRM, and service pages remain undisturbed.
- Automated importer: `.github/workflows/store-import-medusa.yml`; copies upstream files at the pinned commit as source, not newly implemented checkout modules.
- Upstream's preconfigured payment UI is Stripe-focused and **must not be treated as an Indian Cashfree/Partial-COD implementation**.
- Pinned upstream is a starter, **not** a verified Minarva live ecommerce deployment.

## Ready-made modules inherited from Medusa

- Product catalogue, SKU/variants, collections, inventory and reservation
- Cart, customers, orders, discounts, order management
- Pricing, promotion, tax, payment provider contracts, fulfillment provider contracts
- Admin dashboard and REST APIs
- Next.js product/category/search/cart/checkout/customer screens

See: https://docs.medusajs.com/resources/commerce-modules

## Not yet covered by upstream source

- Cashfree/Razorpay authorized Indian payments + raw webhook verification
- Shiprocket exact parcel quote, COD residual collection, shipping exception events
- Package bill of materials (CCTV camera, DVR/NVR, HDD, cable, power, connectors) with packed dimensions
- Malayalam/English grounded sales AI, chat consent and escalation
- Verified WhatsApp sender, optional customer CRM synchronization (avoid duplicate customer ownership)
- Kerala-specific marketing landing pages, state tax/warranty/legal documents and branding
- Production hosting, isolated data storage, seed data, real merchant keys/approval and domain

**Security:** No live payment, COD shipment, product sale, production DNS, data migrations, API credentials or automatic promotional messages until approved and tested. Partial COD remains disabled until courier platform specifically verifies collection of residual amount. Existing `store/lib/checkout-pricing.mjs` is a provider-neutral tested primitive, *not* wired to Medusa or an actual payment processor.

## Subsequent minimal milestones

1. Import pinned original source with MIT license, verify files, audit available scripts and versions.
2. Configure safe staging environment and isolated backend PostgreSQL. Do not apply Medusa migrations to the current CRM database without compatibility review.
3. Local smoke tests and test-mode product SKU/BOM; bypass mock payment in public launch.
4. Reuse vetted existing Cashfree/Shiprocket provider packages if license-compatible *and security audited*; write only adapter glue where no trusted source exists. Partial COD remains fail-closed.
5. Add AI sales chat from a vetted provider-neutral OSS SDK with approved product grounding; separate AI from transactional authority.
6. Secure CRM sync, DNS, production payments and fulfillment only after explicit approvals and real end-to-end evidence.

**Cost constraint:** Medusa software is MIT but needs a running Node server and PostgreSQL. Running it on a cloud host is not automatically free; obtain explicit cost approval before committing to recurring infrastructure. Do not claim Cloudflare static Workers alone can host persistent Medusa backend.
